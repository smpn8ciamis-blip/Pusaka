#!/usr/bin/env node
'use strict';
/*
 * PUSAKA — salin berkas Supabase Storage yang sudah ada di server ke Google Drive (format sama dengan gerbang S3).
 *
 * Pemakaian (jalankan di folder bot, mis. /srv/wa-bot, tempat drive-s3-gateway.cjs berada):
 *   node drive-s3-migrate.cjs --root ~/sekolah-app/supabase-docker/docker/volumes/storage              (simulasi, tidak mengubah apa pun)
 *   node drive-s3-migrate.cjs --root <...>/volumes/storage --run                                       (salin ke Drive; bisa diulang, yang sudah ada dilewati)
 *   node drive-s3-migrate.cjs --root <...>/volumes/storage --verify                                    (cocokkan ukuran + MD5 semua berkas dengan Drive)
 *
 * Opsi:
 *   --root DIR            folder volumes/storage (isinya: stub/stub/<bucket>/<nama berkas>/<versi>)
 *   --run                 benar-benar menyalin (tanpa ini hanya simulasi)
 *   --verify              hanya memeriksa kecocokan dengan Drive
 *   --concurrency N       jumlah berkas paralel (default 3)
 *   --db-container NAME   nama container database Supabase (mis. supabase-db) untuk membaca tipe berkas (mimetype) dari tabel
 *                         storage.objects; tanpa ini tipe ditebak dari ekstensi nama berkas.
 *   --db-command "CMD"    perintah kustom yang mencetak "bucket/nama/versi<TAB>mimetype<TAB>cacheControl" per baris (lanjutan)
 *   --force               lanjut walau perkiraan ruang Drive tidak cukup
 *   --s3-bucket NAME      nama bucket S3 global (default: stub, sama dengan GLOBAL_S3_BUCKET)
 *
 * Berkas lokal TIDAK PERNAH dihapus oleh skrip ini. Hapus sendiri setelah --verify bersih dan aplikasi diuji.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { createDriveStore, configFromEnv, loadDotEnv } = require('./drive-s3-gateway.cjs');

const MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', heic: 'image/heic',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
};
const guessMime = (name) => MIME[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

function parseArgs(argv) {
    const a = { concurrency: 3, s3Bucket: 'stub' };
    for (let i = 0; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--run') a.run = true;
        else if (k === '--verify') a.verify = true;
        else if (k === '--force') a.force = true;
        else if (k === '--root') a.root = argv[++i];
        else if (k === '--concurrency') a.concurrency = Math.max(1, Math.min(8, Number(argv[++i]) || 3));
        else if (k === '--db-container') a.dbContainer = argv[++i];
        else if (k === '--db-command') a.dbCommand = argv[++i];
        else if (k === '--s3-bucket') a.s3Bucket = argv[++i];
        else { console.error('Opsi tidak dikenal: ' + k); process.exit(2); }
    }
    return a;
}

function* walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) yield* walk(p);
        else if (ent.isFile()) yield p;
    }
}
const fmtBytes = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(1) + ' KB');
function md5File(p) {
    return new Promise((resolve, reject) => {
        const h = crypto.createHash('md5');
        fs.createReadStream(p).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
    });
}

function loadDbMeta(args) {
    const map = new Map();
    let cmd = args.dbCommand;
    if (!cmd && args.dbContainer) {
        const sql = "SELECT bucket_id || '/' || name || '/' || coalesce(version,'') || E'\\t' || coalesce(metadata->>'mimetype','') || E'\\t' || coalesce(metadata->>'cacheControl','') FROM storage.objects";
        cmd = `docker exec ${args.dbContainer} psql -U postgres -d postgres -At -c "${sql.replace(/"/g, '\\"')}"`;
    }
    if (!cmd) return map;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    for (const line of out.split('\n')) {
        const [k, mime, cc] = line.split('\t');
        if (k && k.includes('/')) map.set(k.replace(/\/$/, ''), { mime: mime || '', cc: cc || '' });
    }
    return map;
}

async function main() {
    loadDotEnv();
    const args = parseArgs(process.argv.slice(2));
    if (!args.root) { console.error('Wajib: --root <folder volumes/storage>. Lihat komentar di awal berkas ini.'); process.exit(2); }
    const root = path.resolve(args.root);
    if (!fs.existsSync(root)) { console.error('Folder tidak ada: ' + root); process.exit(2); }

    // daftar berkas lokal; kunci = path relatif dari root (= kunci objek S3: <bucket-s3>/<tenant>/<bucket>/<nama>/<versi>)
    const items = [];
    let bad = 0;
    for (const f of walk(root)) {
        const rel = path.relative(root, f).split(path.sep).join('/');
        const base = path.basename(f);
        if (base.startsWith('.') || /\.(tmp|part)$/.test(base)) continue;
        if (rel.split('/')[0] !== args.s3Bucket || rel.split('/').length < 4) { bad++; if (bad <= 5) console.warn('Dilewati (bukan struktur <' + args.s3Bucket + '>/<tenant>/<bucket>/<nama>/<versi>): ' + rel); continue; }
        items.push({ file: f, key: rel, size: fs.statSync(f).size });
    }
    const totalBytes = items.reduce((s, i) => s + i.size, 0);
    console.log('Folder     : ' + root);
    console.log('Berkas     : ' + items.length + ' (' + fmtBytes(totalBytes) + ')' + (bad ? ', dilewati ' + bad : ''));
    if (items[0]) console.log('Contoh kunci: ' + items[0].key);
    if (!items.length) { console.log('Tidak ada berkas untuk diproses. Periksa --root (harus folder yang berisi "' + args.s3Bucket + '/").'); process.exit(bad ? 1 : 0); }

    if (!args.run && !args.verify) {
        const byBucket = {};
        for (const i of items) { const b = i.key.split('/')[2]; byBucket[b] = byBucket[b] || { n: 0, s: 0 }; byBucket[b].n++; byBucket[b].s += i.size; }
        console.log('\nPer bucket:');
        for (const [b, v] of Object.entries(byBucket).sort((a, b) => b[1].s - a[1].s)) console.log('  ' + b.padEnd(28) + String(v.n).padStart(7) + ' berkas  ' + fmtBytes(v.s));
        console.log('\nSIMULASI selesai: tidak ada yang diubah. Tambahkan --run untuk menyalin ke Google Drive.');
        return;
    }

    const cfg = configFromEnv();
    if (!cfg.clientId || !cfg.clientSecret) { console.error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diset (isi di .env bot).'); process.exit(2); }
    const store = createDriveStore(cfg);
    let dbMeta = new Map();
    if (args.run) {
        try { dbMeta = loadDbMeta(args); console.log('Tipe berkas dari database: ' + dbMeta.size + ' entri' + (dbMeta.size ? '' : ' (tidak dipakai; tipe ditebak dari ekstensi)')); }
        catch (e) { console.error('Gagal membaca tipe berkas dari database (' + String(e.message).split('\n')[0] + '). Lanjut dengan tebakan dari ekstensi.'); }
        const q = await store.quota().catch((e) => { console.error('Tidak bisa membaca kuota Drive: ' + e.message); process.exit(1); });
        const used = Number(q.usage || 0), limit = q.limit ? Number(q.limit) : null;
        console.log('Drive      : terpakai ' + fmtBytes(used) + (limit ? ' dari ' + fmtBytes(limit) : ' (tanpa batas)'));
        if (limit && used + totalBytes > limit * 0.98 && !args.force) {
            console.error('\nRuang Drive TIDAK cukup (butuh ±' + fmtBytes(totalBytes) + ', tersisa ' + fmtBytes(limit - used) + '). Tambah kapasitas Google (Google One/Workspace) atau jalankan lagi dengan --force.');
            process.exit(1);
        }
    }

    const logFile = path.join(process.cwd(), 'drive-s3-migrate-' + new Date().toISOString().replace(/[:.]/g, '-') + '.log');
    const logLines = [];
    const stat = { ok: 0, skip: 0, fail: 0, bytes: 0, mismatch: 0 };
    let idx = 0, done = 0;
    const started = Date.now();

    async function one(it) {
        try {
            const existing = await store.find(it.key);
            if (args.verify) {
                if (!existing) { stat.mismatch++; logLines.push('HILANG di Drive: ' + it.key); return; }
                const local = await md5File(it.file);
                if (existing.size !== it.size || (existing.md5 && existing.md5 !== local)) { stat.mismatch++; logLines.push('BEDA (ukuran/MD5): ' + it.key); } else stat.ok++;
                return;
            }
            if (existing && existing.size === it.size) { stat.skip++; return; }
            const parts = it.key.split('/'); // stub/<tenant>/<bucket>/<nama...>/<versi>
            const dbKey = parts.slice(2).join('/');
            const m = dbMeta.get(dbKey) || {};
            const md5 = await md5File(it.file);
            await store.put(it.key, it.file, it.size, md5, { ct: m.mime || guessMime(parts[parts.length - 2] || ''), cc: m.cc || '', meta: {} });
            stat.ok++; stat.bytes += it.size;
        } catch (e) {
            stat.fail++;
            logLines.push('GAGAL ' + it.key + ': ' + e.message);
            if (/storageQuotaExceeded/.test(e.message)) { console.error('\nDrive penuh. Berhenti.'); throw e; }
        } finally {
            done++;
            if (done % 25 === 0 || done === items.length) console.log('  ' + done + '/' + items.length + '  (' + Math.round((Date.now() - started) / 1000) + ' dtk)');
        }
    }
    async function worker() { while (idx < items.length) { const it = items[idx++]; await one(it); } }
    try { await Promise.all(Array.from({ length: args.concurrency }, worker)); } catch (e) { /* kuota penuh: ringkasan tetap dicetak */ }

    if (logLines.length) fs.writeFileSync(logFile, logLines.join('\n') + '\n');
    console.log('\n' + (args.verify ? 'VERIFIKASI' : 'SALIN') + ' selesai: ' + (args.verify ? stat.ok + ' cocok, ' + stat.mismatch + ' bermasalah, ' + stat.fail + ' gagal diperiksa' : stat.ok + ' disalin (' + fmtBytes(stat.bytes) + '), ' + stat.skip + ' sudah ada, ' + stat.fail + ' gagal'));
    if (logLines.length) console.log('Rincian masalah: ' + logFile);
    if (stat.fail || stat.mismatch) process.exit(1);
    if (args.run) console.log('Berkas lokal TIDAK dihapus. Jalankan --verify untuk memastikan semuanya cocok sebelum menghapus salinan di server.');
}
main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
