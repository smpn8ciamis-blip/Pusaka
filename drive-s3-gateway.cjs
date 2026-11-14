'use strict';
/*
 * PUSAKA — Gerbang S3 → Google Drive
 *
 * Supabase Storage (storage-api) dapat memakai penyimpanan berprotokol S3. Berkas ini adalah server S3 kecil yang
 * menyimpan isi objek di Google Drive. Aplikasi (upload foto, tugas siswa, surat, SPJ, e-learning, dll.) dan aturan
 * hak akses (RLS) TIDAK berubah: storage-api tetap mengurus siapa boleh melihat apa; gerbang ini hanya tempat
 * menaruh dan mengambil isi berkas. Saat berkas dilihat, server mengambilnya dari Drive (dengan cache disk terbatas).
 *
 * Penyimpanan di Drive: satu folder induk ("Pusaka Storage") berisi 256 subfolder (2 hex pertama dari sha256 kunci).
 * Nama berkas di Drive = sha256(kunci) dan kunci asli disimpan di kolom description (JSON), jadi indeks tidak
 * perlu database: Drive adalah satu-satunya sumber kebenaran dan bisa dibangun ulang kapan saja.
 *
 * Akses Drive memakai OAuth yang sama dengan backup di server.js (GDRIVE_TOKEN_FILE, scope drive.file: hanya berkas
 * yang dibuat aplikasi ini). Hanya modul bawaan Node (tanpa npm install). Node >= 18.
 *
 * Env wajib : S3_GATEWAY_ACCESS_KEY, S3_GATEWAY_SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * Env opsional: S3_GATEWAY_HOST (0.0.0.0), S3_GATEWAY_PORT (9100), GDRIVE_TOKEN_FILE, S3_DRIVE_ROOT_NAME,
 *               S3_DRIVE_ROOT_ID, S3_CACHE_DIR, S3_CACHE_MAX_MB (1024), S3_CACHE_FILE_MAX_MB (25),
 *               S3_SPOOL_DIR, S3_LOG=1, ENV_FILE
 *
 * Saklar penyimpanan (Google Drive atau disk server):
 *   S3_LOCAL_DIR            folder berkas di server (isi: folder volumes/storage Supabase; kunci = path relatif, tata letak sama
 *                           dengan backend "file" Supabase, jadi berkas lama langsung terbaca). Tanpa ini hanya mode Drive.
 *   S3_DEFAULT_MODE         "drive" (default) atau "local"; hanya dipakai sebelum saklar pernah diubah
 *   S3_MODE_FILE            tempat menyimpan pilihan saklar (default: storage-mode.json di folder berkas ini)
 *   S3_GATEWAY_ADMIN_TOKEN  token API admin (/__admin/*, hanya dari 127.0.0.1); default: S3_GATEWAY_SECRET_KEY
 * Mode hanya menentukan TEMPAT UNGGAHAN BARU. Berkas selalu dibaca dari tempat mana pun ia berada (server dulu, lalu Drive).
 */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Transform, Readable } = require('stream');
const { pipeline } = require('stream/promises');

// ---------- .env (sama seperti server.js; variabel yang sudah ada tidak ditimpa) ----------
function loadDotEnv() {
    const candidates = [process.env.ENV_FILE, path.join(__dirname, '.env'), path.join(process.cwd(), '.env')].filter(Boolean);
    const seen = new Set();
    for (const file of candidates) {
        const abs = path.resolve(file);
        if (seen.has(abs)) continue;
        seen.add(abs);
        let text;
        try { text = fs.readFileSync(abs, 'utf-8'); } catch (e) { continue; }
        for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!m) continue;
            let val = m[2].trim();
            if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) || (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) val = val.slice(1, -1);
            else val = val.replace(/\s+#.*$/, '');
            if (process.env[m[1]] === undefined) process.env[m[1]] = val;
        }
    }
}

// ---------- util ----------
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const keyHash = (key) => sha256hex(key);
const shardOf = (key) => keyHash(key).slice(0, 2);
const safeMime = (ct) => {
    const v = String(ct || '').split(';')[0].trim().toLowerCase();
    if (!v || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(v) || v.startsWith('application/vnd.google-apps')) return 'application/octet-stream';
    return v;
};

class S3Error extends Error {
    constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
class DriveError extends Error {
    constructor(status, reason, message) { super(message); this.status = status; this.reason = reason; }
}

// ---------- SigV4 (verifikasi) ----------
const uriEncode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function canonicalQuery(rawQuery) {
    if (!rawQuery) return '';
    const pairs = rawQuery.split('&').filter(Boolean).map((p) => {
        const i = p.indexOf('=');
        const k = i < 0 ? p : p.slice(0, i);
        const v = i < 0 ? '' : p.slice(i + 1);
        const dec = (x) => { try { return decodeURIComponent(x.replace(/\+/g, '%20')); } catch (e) { return x; } };
        return [uriEncode(dec(k)), uriEncode(dec(v))];
    });
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    return pairs.map((p) => p[0] + '=' + p[1]).join('&');
}
function sigV4Signature({ method, rawPath, rawQuery, headers, signedHeaders, payloadHash, amzDate, region, service, secret }) {
    const canonHeaders = signedHeaders.map((h) => h + ':' + String(headers[h]).trim().replace(/\s+/g, ' ') + '\n').join('');
    const canonical = [method, rawPath, canonicalQuery(rawQuery), canonHeaders, signedHeaders.join(';'), payloadHash].join('\n');
    const date = amzDate.slice(0, 8);
    const scope = [date, region, service, 'aws4_request'].join('/');
    const sts = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
    const kDate = hmac('AWS4' + secret, date);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    return crypto.createHmac('sha256', kSigning).update(sts).digest('hex');
}
function verifyRequest(req, rawPath, rawQuery, cfg) {
    const fail = () => { throw new S3Error(403, 'AccessDenied', 'Access Denied'); };
    const auth = req.headers['authorization'] || '';
    const m = /^AWS4-HMAC-SHA256\s+Credential=([^,\s]+),\s*SignedHeaders=([^,\s]+),\s*Signature=([0-9a-fA-F]{64})\s*$/.exec(auth);
    if (!m) fail();
    const [akid, date, region, service, term] = m[1].split('/');
    if (akid !== cfg.accessKey || service !== 's3' || term !== 'aws4_request') fail();
    const amzDate = String(req.headers['x-amz-date'] || '');
    if (!/^\d{8}T\d{6}Z$/.test(amzDate) || amzDate.slice(0, 8) !== date) fail();
    const t = Date.UTC(+amzDate.slice(0, 4), +amzDate.slice(4, 6) - 1, +amzDate.slice(6, 8), +amzDate.slice(9, 11), +amzDate.slice(11, 13), +amzDate.slice(13, 15));
    if (Math.abs(Date.now() - t) > 3600 * 1000) throw new S3Error(403, 'RequestTimeTooSkewed', 'Jam server dan klien berbeda lebih dari 1 jam');
    const signedHeaders = m[2].split(';');
    for (const h of signedHeaders) if (req.headers[h] === undefined) fail();
    const payloadHash = String(req.headers['x-amz-content-sha256'] || 'UNSIGNED-PAYLOAD');
    const expected = sigV4Signature({ method: req.method, rawPath, rawQuery, headers: req.headers, signedHeaders, payloadHash, amzDate, region, service, secret: cfg.secretKey });
    const a = Buffer.from(expected), b = Buffer.from(m[3].toLowerCase());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new S3Error(403, 'SignatureDoesNotMatch', 'Signature tidak cocok');
}

// ---------- decoder aws-chunked (badan PutObject/UploadPart dari AWS SDK) ----------
class AwsChunkedDecoder extends Transform {
    constructor() { super(); this.state = 'size'; this.buf = Buffer.alloc(0); this.remaining = 0; }
    _transform(chunk, enc, cb) {
        let data = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
        this.buf = Buffer.alloc(0);
        let pos = 0;
        try {
            while (pos < data.length) {
                if (this.state === 'size') {
                    const i = data.indexOf('\r\n', pos);
                    if (i < 0) { this.buf = data.subarray(pos); if (this.buf.length > 8192) throw new Error('header chunk terlalu panjang'); break; }
                    const size = parseInt(data.subarray(pos, i).toString('latin1').split(';')[0].trim(), 16);
                    if (!Number.isFinite(size) || size < 0) throw new Error('header chunk tidak valid');
                    pos = i + 2;
                    if (size === 0) this.state = 'trailer'; else { this.remaining = size; this.state = 'data'; }
                } else if (this.state === 'data') {
                    const n = Math.min(this.remaining, data.length - pos);
                    this.push(Buffer.from(data.subarray(pos, pos + n)));
                    pos += n; this.remaining -= n;
                    if (this.remaining === 0) this.state = 'crlf';
                } else if (this.state === 'crlf') {
                    if (data.length - pos < 2) { this.buf = data.subarray(pos); break; }
                    if (data[pos] !== 13 || data[pos + 1] !== 10) throw new Error('akhir chunk tidak valid');
                    pos += 2; this.state = 'size';
                } else { pos = data.length; } // trailer (mis. x-amz-checksum-*): diabaikan
            }
        } catch (e) { return cb(new S3Error(400, 'IncompleteBody', e.message)); }
        cb();
    }
    _flush(cb) { cb(this.state === 'trailer' ? null : new S3Error(400, 'IncompleteBody', 'Badan aws-chunked terpotong')); }
}

async function spoolBody(req, dest, decode) {
    const md5 = crypto.createHash('md5');
    let size = 0;
    const meter = new Transform({ transform(c, e, cb) { md5.update(c); size += c.length; cb(null, c); } });
    const chain = [req];
    if (decode) chain.push(new AwsChunkedDecoder());
    chain.push(meter, fs.createWriteStream(dest));
    await pipeline(...chain);
    return { size, md5: md5.digest('hex') };
}
const needsDecode = (h) => /aws-chunked/i.test(h['content-encoding'] || '') || /^STREAMING-/i.test(String(h['x-amz-content-sha256'] || ''));

// ---------- cache disk (LRU berdasar waktu akses) ----------
class DiskCache {
    constructor(dir, maxBytes) {
        this.dir = dir; this.max = maxBytes; this.idx = new Map(); this.total = 0;
        try {
            fs.mkdirSync(dir, { recursive: true });
            for (const n of fs.readdirSync(dir)) {
                if (!/^[0-9a-f]{64}$/.test(n)) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { /* abaikan */ } continue; }
                const st = fs.statSync(path.join(dir, n));
                this.idx.set(n, { size: st.size, at: st.mtimeMs }); this.total += st.size;
            }
            this.enabled = maxBytes > 0;
        } catch (e) { this.enabled = false; }
    }
    file(key) { return path.join(this.dir, keyHash(key)); }
    get(key) {
        if (!this.enabled) return null;
        const h = keyHash(key), e = this.idx.get(h);
        if (!e) return null;
        e.at = Date.now();
        return path.join(this.dir, h);
    }
    async put(key, tmpPath, size) {
        if (!this.enabled || size > this.max) { await fsp.unlink(tmpPath).catch(() => {}); return; }
        const h = keyHash(key);
        const old = this.idx.get(h);
        if (old) this.total -= old.size;
        await fsp.rename(tmpPath, path.join(this.dir, h));
        this.idx.set(h, { size, at: Date.now() }); this.total += size;
        while (this.total > this.max && this.idx.size > 1) {
            let oldest = null;
            for (const [n, e] of this.idx) if (n !== h && (!oldest || e.at < oldest[1].at)) oldest = [n, e];
            if (!oldest) break;
            this.idx.delete(oldest[0]); this.total -= oldest[1].size;
            await fsp.unlink(path.join(this.dir, oldest[0])).catch(() => {});
        }
    }
    async del(key) {
        const h = keyHash(key), e = this.idx.get(h);
        if (!e) return;
        this.idx.delete(h); this.total -= e.size;
        await fsp.unlink(path.join(this.dir, h)).catch(() => {});
    }
}

// ---------- klien Google Drive ----------
function createDriveStore(cfg) {
    const API = cfg.driveApi || 'https://www.googleapis.com/drive/v3';
    const UPLOAD = cfg.driveUpload || 'https://www.googleapis.com/upload/drive/v3';
    const TOKEN_URL = cfg.tokenUrl || 'https://oauth2.googleapis.com/token';
    const FIELDS = 'id,name,size,md5Checksum,mimeType,modifiedTime,description';
    let tok = { token: '', exp: 0 };
    let rootPromise = null;
    const shardPromises = new Map();

    async function accessToken(force) {
        if (!force && tok.token && Date.now() < tok.exp - 60000) return tok.token;
        let t = null;
        try { t = JSON.parse(fs.readFileSync(cfg.tokenFile, 'utf8')); } catch (e) { /* belum ada */ }
        if (!t || !t.refresh_token) throw new DriveError(503, 'noToken', 'Google Drive belum dihubungkan (token tidak ditemukan: ' + cfg.tokenFile + ').');
        if (!cfg.clientId || !cfg.clientSecret) throw new DriveError(503, 'noClient', 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diset.');
        const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new DriveError(503, 'tokenRefresh', 'Gagal memperbarui token Google: ' + (j.error_description || j.error || r.status));
        tok = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
        return tok.token;
    }
    async function toError(res) {
        const j = await res.json().catch(() => ({}));
        const reason = (j.error && j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || (j.error && j.error.status) || '';
        return new DriveError(res.status, reason, 'Drive ' + res.status + ' ' + reason + ' ' + ((j.error && j.error.message) || ''));
    }
    const isRetriable = (e) => e instanceof DriveError && (e.status === 429 || e.status >= 500 || ['rateLimitExceeded', 'userRateLimitExceeded', 'backendError'].includes(e.reason));
    async function withRetry(fn, attempts = 4) {
        let last;
        for (let i = 0; i < attempts; i++) {
            try { return await fn(); } catch (e) {
                last = e;
                const netErr = !(e instanceof DriveError) && !(e instanceof S3Error);
                if (!(isRetriable(e) || netErr) || i === attempts - 1) throw e;
                await sleep((cfg.retryBaseMs ?? 400) * 2 ** i + Math.random() * 100);
            }
        }
        throw last;
    }
    // satu panggilan HTTP ke Drive (token otomatis; 401 -> perbarui token sekali)
    async function call(url, init, { raw } = {}) {
        let res;
        for (let n = 0; n < 2; n++) {
            const token = await accessToken(n === 1);
            res = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + token, ...(init && init.headers) } });
            if (res.status !== 401) break;
        }
        if (!res.ok && !(raw && (res.status === 404 || res.status === 416))) throw await toError(res);
        return res;
    }
    const jcall = async (url, init) => (await call(url, init)).json();
    const jbody = (o) => ({ headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(o) });
    const q = (s) => encodeURIComponent(s);

    function rootId() {
        if (cfg.rootId) return Promise.resolve(cfg.rootId);
        if (!rootPromise) {
            rootPromise = withRetry(async () => {
                const name = cfg.rootName || 'Pusaka Storage';
                const found = await jcall(`${API}/files?q=${q(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`)}&fields=files(id)&pageSize=1`);
                if (found.files && found.files[0]) return found.files[0].id;
                const c = await jcall(`${API}/files?fields=id`, { method: 'POST', ...jbody({ name, mimeType: 'application/vnd.google-apps.folder' }) });
                return c.id;
            }).catch((e) => { rootPromise = null; throw e; });
        }
        return rootPromise;
    }
    function shardId(shard) {
        if (!shardPromises.has(shard)) {
            shardPromises.set(shard, withRetry(async () => {
                const root = await rootId();
                const found = await jcall(`${API}/files?q=${q(`name='${shard}' and mimeType='application/vnd.google-apps.folder' and '${root}' in parents and trashed=false`)}&fields=files(id)&pageSize=1`);
                if (found.files && found.files[0]) return found.files[0].id;
                const c = await jcall(`${API}/files?fields=id`, { method: 'POST', ...jbody({ name: shard, mimeType: 'application/vnd.google-apps.folder', parents: [root] }) });
                return c.id;
            }).catch((e) => { shardPromises.delete(shard); throw e; }));
        }
        return shardPromises.get(shard);
    }
    function toMeta(f, key) {
        let d = {};
        try { d = JSON.parse(f.description || '{}'); } catch (e) { /* abaikan */ }
        return { id: f.id, key: key || d.k, size: Number(f.size || 0), md5: f.md5Checksum || '', mtime: f.modifiedTime, ct: d.ct || f.mimeType || 'application/octet-stream', cc: d.cc || '', meta: d.m || {} };
    }
    const describe = (key, o) => JSON.stringify({ k: key, ct: o.ct, cc: o.cc || undefined, m: o.meta && Object.keys(o.meta).length ? o.meta : undefined });

    async function findAll(key) {
        return withRetry(async () => {
            const shard = await shardId(shardOf(key));
            const r = await jcall(`${API}/files?q=${q(`name='${keyHash(key)}' and '${shard}' in parents and trashed=false`)}&fields=files(${FIELDS})&pageSize=10&orderBy=createdTime desc`);
            return (r.files || []).map((f) => toMeta(f, key));
        });
    }
    async function find(key) { const all = await findAll(key); return all[0] || null; }

    async function put(key, filePath, size, md5, o) {
        const mime = safeMime(o.ct);
        const created = await withRetry(async () => {
            const shard = await shardId(shardOf(key));
            const body = { name: keyHash(key), parents: [shard], mimeType: mime, description: describe(key, o) };
            if (size === 0) return jcall(`${API}/files?fields=${FIELDS}`, { method: 'POST', ...jbody(body) });
            const init = await call(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) }, body: JSON.stringify(body) });
            const loc = init.headers.get('location');
            if (!loc) throw new DriveError(502, 'noLocation', 'Drive tidak memberi alamat upload');
            const up = await call(loc, { method: 'PUT', headers: { 'Content-Length': String(size), 'Content-Type': mime }, body: Readable.toWeb(fs.createReadStream(filePath)), duplex: 'half' });
            return up.json();
        });
        if (md5 && created.md5Checksum && created.md5Checksum !== md5) {
            await del(created.id).catch(() => {});
            throw new DriveError(502, 'md5Mismatch', 'MD5 hasil upload ke Drive tidak cocok');
        }
        // timpa: hapus versi lama dengan kunci sama
        for (const old of await findAll(key).catch(() => [])) if (old.id !== created.id) await del(old.id).catch(() => {});
        return toMeta(created, key);
    }
    // alt=media; range = {start,end} atau null. Mengembalikan Response (stream) atau null bila hilang.
    async function open(meta, range) {
        return withRetry(async () => {
            const h = range ? { Range: `bytes=${range.start}-${range.end}` } : {};
            const res = await call(`${API}/files/${meta.id}?alt=media`, { headers: h }, { raw: true });
            return res.status === 404 ? null : res;
        });
    }
    async function del(id) {
        await withRetry(async () => { const r = await call(`${API}/files/${id}`, { method: 'DELETE' }, { raw: true }); await r.arrayBuffer().catch(() => {}); });
    }
    async function delKey(key) {
        const all = await findAll(key);
        for (const m of all) await del(m.id);
        return all.length;
    }
    async function copy(srcMeta, newKey, o) {
        const shard = await shardId(shardOf(newKey));
        const merged = { ct: o.ct || srcMeta.ct, cc: o.cc !== undefined ? o.cc : srcMeta.cc, meta: o.meta || srcMeta.meta };
        const c = await withRetry(() => jcall(`${API}/files/${srcMeta.id}/copy?fields=${FIELDS}`, { method: 'POST', ...jbody({ name: keyHash(newKey), parents: [shard], description: describe(newKey, merged) }) }));
        for (const old of await findAll(newKey).catch(() => [])) if (old.id !== c.id) await del(old.id).catch(() => {});
        return toMeta(c, newKey);
    }
    // pindai semua objek (untuk ListObjectsV2; jarang dipakai)
    async function* scan() {
        const root = await rootId();
        let tokenS = '';
        const shards = [];
        do {
            const r = await jcall(`${API}/files?q=${q(`'${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=nextPageToken,files(id)&pageSize=1000${tokenS ? '&pageToken=' + tokenS : ''}`);
            shards.push(...(r.files || []).map((f) => f.id)); tokenS = r.nextPageToken || '';
        } while (tokenS);
        for (const sid of shards) {
            let pt = '';
            do {
                const r = await jcall(`${API}/files?q=${q(`'${sid}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`)}&fields=nextPageToken,files(${FIELDS})&pageSize=1000${pt ? '&pageToken=' + pt : ''}`);
                for (const f of r.files || []) { const m = toMeta(f); if (m.key) yield m; }
                pt = r.nextPageToken || '';
            } while (pt);
        }
    }
    async function quota() {
        const r = await jcall(`${API}/about?fields=storageQuota`);
        return r.storageQuota || {};
    }
    return { find, findAll, put, open, del, delKey, copy, scan, quota, rootId, accessToken };
}

// ---------- server S3 ----------
// ---------- tipe berkas (untuk berkas lama tanpa catatan tipe) ----------
const MIME = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', heic: 'image/heic',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
};
const guessMime = (name) => MIME[(String(name).split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

// ---------- penyimpanan di disk server ----------
// Berkas disimpan di <localDir>/<kunci> (sama dengan backend "file" Supabase). Tipe/cache-control/ETag berkas baru dicatat di
// <localDir>/.pusaka-meta/<sha256 kunci>.json; berkas lama (tanpa catatan) dibaca apa adanya (tipe ditebak dari ekstensi).
function createLocalStore(cfg) {
    const root = path.resolve(cfg.localDir);
    const metaDir = path.join(root, '.pusaka-meta');
    const rand = () => crypto.randomBytes(6).toString('hex');
    const pathOf = (key) => {
        const segs = String(key).split('/');
        if (segs.length < 2 || segs.some((x) => x === '' || x === '.' || x === '..' || x.includes('\0'))) return null;
        const p = path.join(root, ...segs);
        return p.startsWith(root + path.sep) ? p : null;
    };
    const metaFile = (key) => path.join(metaDir, keyHash(key) + '.json');
    async function readSide(key) { try { return JSON.parse(await fsp.readFile(metaFile(key), 'utf8')); } catch (e) { return {}; } }
    async function writeSide(key, o) {
        await fsp.mkdir(metaDir, { recursive: true });
        const f = metaFile(key), tmp = f + '.' + rand() + '.pusaka-tmp';
        await fsp.writeFile(tmp, JSON.stringify(o));
        await fsp.rename(tmp, f);
    }
    async function find(key) {
        const p = pathOf(key);
        if (!p) return null;
        let st;
        try { st = await fsp.stat(p); } catch (e) { return null; }
        if (!st.isFile()) return null;
        const side = await readSide(key);
        const parts = String(key).split('/');
        const pseudo = crypto.createHash('md5').update(st.size + ':' + Math.round(st.mtimeMs)).digest('hex');
        return { store: 'local', localPath: p, key, size: st.size, md5: side.md5 && side.size === st.size ? side.md5 : pseudo, mtime: st.mtime.toISOString(), ct: side.ct || guessMime(parts[parts.length - 2] || ''), cc: side.cc || '', meta: side.meta || {} };
    }
    // move=true: pindahkan berkas sumber (berkas sementara milik pemanggil); false: salin
    async function place(dest, src, move) {
        const tmp = path.join(path.dirname(dest), '.' + rand() + '.pusaka-tmp');
        try {
            await fsp.mkdir(path.dirname(dest), { recursive: true });
            if (move) { try { await fsp.rename(src, tmp); } catch (e) { if (e.code !== 'EXDEV') throw e; await fsp.copyFile(src, tmp); } }
            else await fsp.copyFile(src, tmp);
            await fsp.rename(tmp, dest);
        } catch (e) {
            await fsp.unlink(tmp).catch(() => {});
            if (e.code === 'ENAMETOOLONG') throw new S3Error(400, 'KeyTooLongError', 'Nama objek terlalu panjang');
            if (e.code === 'ENOSPC') throw new S3Error(507, 'StorageQuotaExceeded', 'Disk server penuh.');
            throw e;
        }
    }
    async function put(key, filePath, size, md5, o) {
        const p = pathOf(key);
        if (!p) throw new S3Error(400, 'InvalidKey', 'Kunci objek tidak valid');
        await place(p, filePath, true);
        await writeSide(key, { ct: o.ct || 'application/octet-stream', cc: o.cc || '', meta: o.meta || {}, md5: md5 || '', size });
        return find(key);
    }
    async function open(meta, range) {
        return { body: Readable.toWeb(fs.createReadStream(meta.localPath, range ? { start: range.start, end: range.end } : undefined)) };
    }
    async function delKey(key) {
        const p = pathOf(key);
        if (!p) return 0;
        let n = 0;
        try { await fsp.unlink(p); n = 1; } catch (e) { if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(e.code)) throw e; }
        await fsp.unlink(metaFile(key)).catch(() => {});
        // rapikan folder kosong (tapi jangan hapus <bucket-s3>/<tenant>/<bucket>)
        let d = path.dirname(p);
        while (n && path.relative(root, d).split(path.sep).length > 3) { try { await fsp.rmdir(d); } catch (e) { break; } d = path.dirname(d); }
        return n;
    }
    async function copy(srcMeta, newKey, o) {
        const p = pathOf(newKey);
        if (!p) throw new S3Error(400, 'InvalidKey', 'Kunci objek tidak valid');
        await place(p, srcMeta.localPath, false);
        await writeSide(newKey, { ct: o.ct || srcMeta.ct, cc: o.cc !== undefined ? o.cc : srcMeta.cc, meta: o.meta || srcMeta.meta, md5: srcMeta.md5, size: srcMeta.size });
        return find(newKey);
    }
    async function* scan() {
        async function* walk(dir) {
            for (const ent of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
                const p = path.join(dir, ent.name);
                if (ent.isDirectory()) { if (dir === root && ent.name === '.pusaka-meta') continue; yield* walk(p); }
                else if (ent.isFile() && !ent.name.endsWith('.pusaka-tmp')) yield p;
            }
        }
        for await (const p of walk(root)) {
            const key = path.relative(root, p).split(path.sep).join('/');
            if (key.split('/').length < 2) continue;
            const m = await find(key);
            if (m) yield m;
        }
    }
    async function space() {
        try { const s = await fsp.statfs(root); return { freeBytes: Number(s.bavail) * Number(s.bsize), totalBytes: Number(s.blocks) * Number(s.bsize) }; } catch (e) { return {}; }
    }
    async function check() { await fsp.mkdir(root, { recursive: true }); await fsp.access(root, fs.constants.W_OK); }
    return { find, put, open, delKey, copy, scan, space, check, root };
}

// ---------- router: memilih Drive / server ----------
// Unggahan baru ke penyimpanan aktif (getMode()); pembacaan: server dulu (murah), baru Drive; hapus di keduanya.
function createRoutedStore({ drive, local, getMode, tmpName }) {
    const isLocalMode = () => !!local && getMode() === 'local';
    const active = () => (isLocalMode() ? local : drive);
    const tag = (m, store) => { if (m) m.store = store; return m; };
    async function find(key) {
        if (local) { const m = await local.find(key); if (m) return m; }
        try { return tag(await drive.find(key), 'drive'); }
        catch (e) { if (isLocalMode()) { console.error('[S3] Drive tidak terjangkau saat mode server: ' + e.message); return null; } throw e; }
    }
    async function put(key, filePath, size, md5, o) {
        const a = active();
        const m = await a.put(key, filePath, size, md5, o);
        if (a === drive) { if (local) await local.delKey(key).catch(() => {}); return tag(m, 'drive'); }
        return m;
    }
    const open = (meta, range) => (meta.store === 'local' ? local.open(meta, range) : drive.open(meta, range));
    async function delKey(key) {
        let n = 0;
        if (local) n += await local.delKey(key);
        try { n += await drive.delKey(key); }
        catch (e) { if (!(local && (n > 0 || isLocalMode()))) throw e; console.error('[S3] Gagal menghapus di Drive (' + e.message + '); berkas di server sudah dihapus.'); }
        return n;
    }
    async function copy(srcMeta, newKey, o) {
        const a = active();
        const srcStore = srcMeta.store === 'local' ? local : drive;
        if (srcStore === a) {
            const m = await a.copy(srcMeta, newKey, o);
            if (a === drive) { if (local) await local.delKey(newKey).catch(() => {}); return tag(m, 'drive'); }
            return m;
        }
        // beda tempat: salin lewat berkas sementara
        const tmp = tmpName();
        try {
            const src = await srcStore.open(srcMeta, null);
            if (!src) throw new S3Error(404, 'NoSuchKey', 'Sumber salinan tidak ditemukan');
            const h = crypto.createHash('md5'); let size = 0;
            await pipeline(Readable.fromWeb(src.body), new Transform({ transform(c, e, cb) { h.update(c); size += c.length; cb(null, c); } }), fs.createWriteStream(tmp));
            const merged = { ct: o.ct || srcMeta.ct, cc: o.cc !== undefined ? o.cc : srcMeta.cc, meta: o.meta || srcMeta.meta };
            const m = await a.put(newKey, tmp, size, h.digest('hex'), merged);
            if (a === drive) { if (local) await local.delKey(newKey).catch(() => {}); return tag(m, 'drive'); }
            return m;
        } finally { fsp.unlink(tmp).catch(() => {}); }
    }
    async function* scan() {
        const seen = new Set();
        if (local) for await (const m of local.scan()) { seen.add(m.key); yield m; }
        try { for await (const m of drive.scan()) if (!seen.has(m.key)) yield tag(m, 'drive'); }
        catch (e) { if (!isLocalMode()) throw e; }
    }
    return { find, put, open, delKey, copy, scan, quota: () => drive.quota() };
}

function createGateway(cfg) {
    const driveRaw = cfg.store || createDriveStore(cfg);
    const local = cfg.localDir ? createLocalStore(cfg) : null;
    // saklar penyimpanan: dibaca dari berkas pilihan (bila ada); tanpa S3_LOCAL_DIR selalu mode Drive
    let modeState = (() => {
        let st = {};
        try { st = JSON.parse(fs.readFileSync(cfg.modeFile, 'utf8')); } catch (e) { /* belum pernah diatur */ }
        let mode = st.mode === 'local' || st.mode === 'drive' ? st.mode : (cfg.defaultMode === 'local' ? 'local' : 'drive');
        if (mode === 'local' && !local) mode = 'drive';
        return { mode, changedAt: st.changedAt || null, changedBy: st.changedBy || null };
    })();
    const drive = createRoutedStore({ drive: driveRaw, local, getMode: () => modeState.mode, tmpName: () => tmpName() });
    const cache = new DiskCache(cfg.cacheDir, (cfg.cacheMaxMb || 0) * 1024 * 1024);
    const cacheFileMax = (cfg.cacheFileMaxMb || 25) * 1024 * 1024;
    const spool = cfg.spoolDir;
    fs.mkdirSync(spool, { recursive: true });
    fs.mkdirSync(path.join(spool, 'mpu'), { recursive: true });
    const log = (...a) => { if (cfg.log) console.log('[S3]', ...a); };

    // cache metadata objek di memori (objek tak berubah per kunci; kunci memuat versi)
    const metaCache = new Map();
    const META_MAX = 5000;
    const metaSet = (key, m) => { metaCache.delete(key); metaCache.set(key, m); if (metaCache.size > META_MAX) metaCache.delete(metaCache.keys().next().value); };
    async function getMeta(key) {
        const hit = metaCache.get(key);
        if (hit) { metaSet(key, hit); return hit; }
        const m = await drive.find(key);
        if (m) metaSet(key, m);
        return m;
    }

    const rawMetaHeaders = (m) => {
        const h = {
            'Content-Type': m.ct, 'Content-Length': String(m.size), ETag: '"' + m.md5 + '"',
            'Last-Modified': new Date(m.mtime || Date.now()).toUTCString(), 'Accept-Ranges': 'bytes',
        };
        if (m.cc) h['Cache-Control'] = m.cc;
        for (const [k, v] of Object.entries(m.meta || {})) h['x-amz-meta-' + k] = String(v);
        return h;
    };
    const extractMeta = (headers) => {
        const meta = {};
        for (const [k, v] of Object.entries(headers)) if (k.startsWith('x-amz-meta-')) meta[k.slice(11)] = String(v);
        return meta;
    };
    function send(res, status, headers, body) {
        const b = body === undefined ? '' : body;
        res.writeHead(status, { 'Content-Length': Buffer.byteLength(b), ...headers });
        res.end(b);
    }
    const xml = (res, status, inner) => send(res, status, { 'Content-Type': 'application/xml' }, '<?xml version="1.0" encoding="UTF-8"?>\n' + inner);
    function sendError(res, e, reqPath) {
        let status = 500, code = 'InternalError', msg = e.message || 'Kesalahan internal';
        if (e instanceof S3Error) { status = e.status; code = e.code; }
        else if (e instanceof DriveError) {
            if (e.reason === 'storageQuotaExceeded') { status = 507; code = 'StorageQuotaExceeded'; msg = 'Ruang Google Drive penuh.'; }
            else if (e.status === 503) { status = 503; code = 'ServiceUnavailable'; }
            else { status = 502; code = 'BadGateway'; }
        }
        if (status >= 500) console.error('[S3] ' + status + ' ' + code + ' ' + msg + (reqPath ? ' (' + reqPath + ')' : ''));
        if (res.headersSent) { res.destroy(); return; }
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<Error><Code>${code}</Code><Message>${xmlEsc(msg)}</Message><Resource>${xmlEsc(reqPath || '')}</Resource><RequestId>0</RequestId></Error>`;
        send(res, status, { 'Content-Type': 'application/xml' }, res.req.method === 'HEAD' ? '' : body);
    }
    const readSmallBody = (req, max = 2 * 1024 * 1024) => new Promise((resolve, reject) => {
        const parts = []; let n = 0;
        req.on('data', (c) => { n += c.length; if (n > max) { reject(new S3Error(400, 'EntityTooLarge', 'Badan permintaan terlalu besar')); req.destroy(); } else parts.push(c); });
        req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        req.on('error', reject);
    });
    const tmpName = () => path.join(spool, 'u-' + crypto.randomBytes(8).toString('hex'));

    function parseRange(h, size) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || '').trim());
        if (!m || (m[1] === '' && m[2] === '')) return null;
        let start, end;
        if (m[1] === '') { const n = Math.min(Number(m[2]), size); start = size - n; end = size - 1; }
        else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
        if (start >= size || start > end) throw new S3Error(416, 'InvalidRange', 'The requested range is not satisfiable');
        return { start, end };
    }

    // ----- operasi objek -----
    async function getObject(req, res, key, headOnly) {
        const m = await getMeta(key);
        if (!m) throw new S3Error(404, 'NoSuchKey', 'The specified key does not exist.');
        const etag = '"' + m.md5 + '"';
        const inm = req.headers['if-none-match'], im = req.headers['if-match'];
        if (im && im !== '*' && im !== etag) throw new S3Error(412, 'PreconditionFailed', 'At least one of the pre-conditions you specified did not hold');
        if (inm && (inm === '*' || inm === etag)) return send(res, 304, { ETag: etag, 'Last-Modified': new Date(m.mtime).toUTCString() });
        const range = parseRange(req.headers.range, m.size);
        const h = rawMetaHeaders(m);
        if (range) { h['Content-Range'] = `bytes ${range.start}-${range.end}/${m.size}`; h['Content-Length'] = String(range.end - range.start + 1); }
        if (headOnly) { res.writeHead(200, h); return res.end(); }
        res.writeHead(range ? 206 : 200, h);
        if (m.size === 0) return res.end();
        if (m.store === 'local') { // berkas di disk server: langsung dialirkan (tanpa cache)
            const rs = fs.createReadStream(m.localPath, range ? { start: range.start, end: range.end } : undefined);
            rs.on('error', () => { metaCache.delete(key); res.destroy(); });
            return void rs.pipe(res);
        }
        const cached = cache.get(key);
        if (cached) {
            const rs = fs.createReadStream(cached, range ? { start: range.start, end: range.end } : undefined);
            rs.on('error', () => res.destroy());
            return void rs.pipe(res);
        }
        const src = await drive.open(m, range);
        if (!src) { metaCache.delete(key); res.destroy(); return; }
        const body = Readable.fromWeb(src.body);
        const tee = !range && m.size <= cacheFileMax && cache.enabled;
        let tmp = null, ws = null, got = 0;
        if (tee) { tmp = tmpName(); ws = fs.createWriteStream(tmp); }
        body.on('data', (c) => { got += c.length; });
        body.on('error', () => { res.destroy(); if (ws) ws.destroy(); });
        res.on('close', () => { if (ws && got < m.size) { ws.destroy(); fsp.unlink(tmp).catch(() => {}); } });
        if (ws) {
            ws.on('finish', () => { if (got === m.size) cache.put(key, tmp, m.size).catch(() => {}); else fsp.unlink(tmp).catch(() => {}); });
            body.pipe(ws);
        }
        body.pipe(res);
    }

    async function putObject(req, res, key) {
        const tmp = tmpName();
        try {
            const { size, md5 } = await spoolBody(req, tmp, needsDecode(req.headers));
            const dec = req.headers['x-amz-decoded-content-length'];
            if (dec !== undefined && Number(dec) !== size) throw new S3Error(400, 'IncompleteBody', 'Ukuran badan tidak sesuai');
            const cmd5 = req.headers['content-md5'];
            if (cmd5 && Buffer.from(cmd5, 'base64').toString('hex') !== md5) throw new S3Error(400, 'BadDigest', 'Content-MD5 tidak cocok');
            const m = await drive.put(key, tmp, size, md5, { ct: req.headers['content-type'], cc: req.headers['cache-control'], meta: extractMeta(req.headers) });
            await cache.del(key); metaSet(key, m);
            send(res, 200, { ETag: '"' + m.md5 + '"' });
        } finally { fsp.unlink(tmp).catch(() => {}); }
    }

    async function copyObject(req, res, key) {
        let src = String(req.headers['x-amz-copy-source']);
        try { src = decodeURIComponent(src); } catch (e) { /* biarkan */ }
        src = src.replace(/^\//, '').split('?')[0];
        const sm = await getMeta(src);
        if (!sm) throw new S3Error(404, 'NoSuchKey', 'Sumber salinan tidak ditemukan');
        const replace = /^REPLACE$/i.test(req.headers['x-amz-metadata-directive'] || '');
        const o = replace ? { ct: req.headers['content-type'], cc: req.headers['cache-control'] || '', meta: extractMeta(req.headers) } : {};
        const m = await drive.copy(sm, key, o);
        await cache.del(key); metaSet(key, m);
        xml(res, 200, `<CopyObjectResult><LastModified>${new Date(m.mtime).toISOString()}</LastModified><ETag>"${m.md5}"</ETag></CopyObjectResult>`);
    }

    async function deleteObject(res, key) {
        await drive.delKey(key);
        await cache.del(key); metaCache.delete(key);
        send(res, 204, {});
    }

    async function deleteObjects(req, res) {
        const body = await readSmallBody(req);
        const keys = [...body.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'));
        const quiet = /<Quiet>\s*true\s*<\/Quiet>/i.test(body);
        const bucket = res.bucket;
        let out = '<DeleteResult>';
        for (const k of keys) {
            const full = bucket + '/' + k;
            try { await drive.delKey(full); await cache.del(full); metaCache.delete(full); if (!quiet) out += `<Deleted><Key>${xmlEsc(k)}</Key></Deleted>`; }
            catch (e) { out += `<Error><Key>${xmlEsc(k)}</Key><Code>InternalError</Code><Message>${xmlEsc(e.message)}</Message></Error>`; }
        }
        xml(res, 200, out + '</DeleteResult>');
    }

    // ----- multipart -----
    const mpuDir = (id) => path.join(spool, 'mpu', id);
    const validUploadId = (id) => /^[0-9a-f]{32}$/.test(id || '');
    async function mpuInfo(id) {
        if (!validUploadId(id)) throw new S3Error(404, 'NoSuchUpload', 'Upload tidak ada');
        try { return JSON.parse(await fsp.readFile(path.join(mpuDir(id), 'info.json'), 'utf8')); } catch (e) { throw new S3Error(404, 'NoSuchUpload', 'Upload tidak ada'); }
    }
    async function createMultipart(req, res, bucket, key) {
        const id = crypto.randomBytes(16).toString('hex');
        await fsp.mkdir(mpuDir(id), { recursive: true });
        await fsp.writeFile(path.join(mpuDir(id), 'info.json'), JSON.stringify({ key: bucket + '/' + key, ct: req.headers['content-type'], cc: req.headers['cache-control'], meta: extractMeta(req.headers), at: Date.now() }));
        req.resume();
        xml(res, 200, `<InitiateMultipartUploadResult><Bucket>${xmlEsc(bucket)}</Bucket><Key>${xmlEsc(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }
    async function uploadPart(req, res, id, partNo) {
        await mpuInfo(id);
        const n = Number(partNo);
        if (!Number.isInteger(n) || n < 1 || n > 10000) throw new S3Error(400, 'InvalidArgument', 'partNumber tidak valid');
        const dest = path.join(mpuDir(id), 'part-' + String(n).padStart(5, '0'));
        const { size, md5 } = await spoolBody(req, dest + '.tmp', needsDecode(req.headers));
        const dec = req.headers['x-amz-decoded-content-length'];
        if (dec !== undefined && Number(dec) !== size) { await fsp.unlink(dest + '.tmp').catch(() => {}); throw new S3Error(400, 'IncompleteBody', 'Ukuran badan tidak sesuai'); }
        await fsp.rename(dest + '.tmp', dest);
        await fsp.writeFile(dest + '.md5', md5);
        send(res, 200, { ETag: '"' + md5 + '"' });
    }
    async function listParts(res, id, bucket, key) {
        await mpuInfo(id);
        const files = (await fsp.readdir(mpuDir(id))).filter((f) => /^part-\d{5}$/.test(f)).sort();
        let out = `<ListPartsResult><Bucket>${xmlEsc(bucket)}</Bucket><Key>${xmlEsc(key)}</Key><UploadId>${id}</UploadId><IsTruncated>false</IsTruncated>`;
        for (const f of files) {
            const st = await fsp.stat(path.join(mpuDir(id), f));
            const md5 = await fsp.readFile(path.join(mpuDir(id), f + '.md5'), 'utf8').catch(() => '');
            out += `<Part><PartNumber>${Number(f.slice(5))}</PartNumber><LastModified>${st.mtime.toISOString()}</LastModified><ETag>"${md5}"</ETag><Size>${st.size}</Size></Part>`;
        }
        xml(res, 200, out + '</ListPartsResult>');
    }
    async function completeMultipart(req, res, id, bucket, key) {
        const info = await mpuInfo(id);
        const body = await readSmallBody(req);
        const wanted = [...body.matchAll(/<Part>([\s\S]*?)<\/Part>/g)].map((m) => ({ n: Number((/<PartNumber>(\d+)<\/PartNumber>/.exec(m[1]) || [])[1]), etag: ((/<ETag>([\s\S]*?)<\/ETag>/.exec(m[1]) || [])[1] || '').replace(/&quot;|"/g, '').trim() }));
        if (!wanted.length) throw new S3Error(400, 'MalformedXML', 'Daftar part kosong');
        for (let i = 1; i < wanted.length; i++) if (wanted[i].n <= wanted[i - 1].n) throw new S3Error(400, 'InvalidPartOrder', 'Urutan part harus naik');
        const out = tmpName();
        try {
            const md5 = crypto.createHash('md5');
            let size = 0;
            const ws = fs.createWriteStream(out);
            for (const w of wanted) {
                const f = path.join(mpuDir(id), 'part-' + String(w.n).padStart(5, '0'));
                const have = await fsp.readFile(f + '.md5', 'utf8').catch(() => null);
                if (have === null) throw new S3Error(400, 'InvalidPart', 'Part ' + w.n + ' tidak ditemukan');
                if (w.etag && w.etag !== have) throw new S3Error(400, 'InvalidPart', 'ETag part ' + w.n + ' tidak cocok');
                await new Promise((resolve, reject) => {
                    const rs = fs.createReadStream(f);
                    rs.on('data', (c) => { md5.update(c); size += c.length; });
                    rs.on('error', reject); rs.on('end', resolve);
                    rs.pipe(ws, { end: false });
                });
            }
            await new Promise((resolve, reject) => { ws.on('error', reject); ws.end(resolve); });
            const m = await drive.put(info.key, out, size, md5.digest('hex'), { ct: info.ct, cc: info.cc, meta: info.meta });
            await cache.del(info.key); metaSet(info.key, m);
            await fsp.rm(mpuDir(id), { recursive: true, force: true });
            xml(res, 200, `<CompleteMultipartUploadResult><Location>/${xmlEsc(bucket)}/${xmlEsc(key)}</Location><Bucket>${xmlEsc(bucket)}</Bucket><Key>${xmlEsc(key)}</Key><ETag>"${m.md5}"</ETag></CompleteMultipartUploadResult>`);
        } finally { fsp.unlink(out).catch(() => {}); }
    }
    async function abortMultipart(res, id) {
        if (validUploadId(id)) await fsp.rm(mpuDir(id), { recursive: true, force: true });
        send(res, 204, {});
    }

    // ----- daftar objek (jarang dipakai; memindai Drive) -----
    async function listObjects(res, bucket, params) {
        const prefix = params.get('prefix') || '', delimiter = params.get('delimiter') || '';
        const max = Math.min(Math.max(Number(params.get('max-keys')) || 1000, 1), 1000);
        const after = params.get('continuation-token') || params.get('start-after') || params.get('marker') || '';
        const pfx = bucket + '/' + prefix;
        const all = [];
        for await (const m of drive.scan()) if (m.key.startsWith(pfx)) all.push(m);
        all.sort((a, b) => (a.key < b.key ? -1 : 1));
        const contents = [], common = new Set();
        let truncated = false, last = '';
        for (const m of all) {
            const k = m.key.slice(bucket.length + 1);
            if (after && k <= after) continue;
            let cp = null;
            if (delimiter) { const i = k.indexOf(delimiter, prefix.length); if (i >= 0) cp = k.slice(0, i + delimiter.length); }
            if (cp) { if (common.has(cp)) continue; if (contents.length + common.size >= max) { truncated = true; break; } common.add(cp); last = cp; continue; }
            if (contents.length + common.size >= max) { truncated = true; break; }
            contents.push(m); last = k;
        }
        let out = `<ListBucketResult><Name>${xmlEsc(bucket)}</Name><Prefix>${xmlEsc(prefix)}</Prefix><KeyCount>${contents.length + common.size}</KeyCount><MaxKeys>${max}</MaxKeys><IsTruncated>${truncated}</IsTruncated>`;
        if (truncated) out += `<NextContinuationToken>${xmlEsc(last)}</NextContinuationToken>`;
        for (const m of contents) out += `<Contents><Key>${xmlEsc(m.key.slice(bucket.length + 1))}</Key><LastModified>${new Date(m.mtime).toISOString()}</LastModified><ETag>"${m.md5}"</ETag><Size>${m.size}</Size><StorageClass>STANDARD</StorageClass></Contents>`;
        for (const c of common) out += `<CommonPrefixes><Prefix>${xmlEsc(c)}</Prefix></CommonPrefixes>`;
        xml(res, 200, out + '</ListBucketResult>');
    }

    // ----- health + saklar penyimpanan -----
    let healthAt = 0, driveVal = null;
    async function driveHealth(force) {
        if (force || Date.now() - healthAt > 60000) {
            healthAt = Date.now();
            try { const qt = await driveRaw.quota(); driveVal = { ok: true, usage: Number(qt.usage || 0), limit: qt.limit ? Number(qt.limit) : null }; }
            catch (e) { driveVal = { ok: false, error: String(e.message).slice(0, 200) }; }
        }
        return driveVal;
    }
    async function localHealth() {
        if (!local) return null;
        try { await local.check(); return { ok: true, path: local.root, ...(await local.space()) }; }
        catch (e) { return { ok: false, path: local.root, error: String(e.message).slice(0, 200) }; }
    }
    async function health(res) {
        const d = await driveHealth(), l = await localHealth();
        const ok = modeState.mode === 'local' ? !!(l && l.ok) : d.ok;
        const body = { ok, mode: modeState.mode, drive: d.ok ? 'ok' : d.error, ...(d.ok ? { usage: d.usage, limit: d.limit } : {}), local: l, cacheBytes: cache.total, cacheFiles: cache.idx.size };
        send(res, ok ? 200 : 503, { 'Content-Type': 'application/json' }, JSON.stringify(body));
    }
    async function setMode(mode, by) {
        if (mode !== 'drive' && mode !== 'local') throw new S3Error(400, 'InvalidArgument', 'Mode harus "drive" atau "local".');
        if (mode === 'local') {
            if (!local) throw new S3Error(400, 'LocalNotConfigured', 'Penyimpanan server belum diatur (isi S3_LOCAL_DIR di .env lalu restart gerbang).');
            try { await local.check(); } catch (e) { throw new S3Error(400, 'LocalNotWritable', 'Folder penyimpanan server tidak bisa ditulis: ' + e.message); }
        } else {
            const d = await driveHealth(true);
            if (!d.ok) throw new S3Error(400, 'DriveUnavailable', 'Google Drive tidak bisa dipakai saat ini: ' + d.error);
        }
        modeState = { mode, changedAt: new Date().toISOString(), changedBy: by ? String(by).slice(0, 80) : null };
        if (cfg.modeFile) { const tmp = cfg.modeFile + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(modeState)); fs.renameSync(tmp, cfg.modeFile); }
        console.log('[S3] Saklar penyimpanan: unggahan baru ke ' + (mode === 'local' ? 'SERVER' : 'GOOGLE DRIVE'));
        return modeState;
    }
    const json = (res, st, o) => send(res, st, { 'Content-Type': 'application/json' }, JSON.stringify(o));
    async function admin(req, res, rawPath) {
        try {
            if (!/^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '')) throw new S3Error(403, 'AccessDenied', 'API admin hanya dapat diakses dari server ini.');
            const given = Buffer.from(String(req.headers['x-admin-token'] || '')), want = Buffer.from(cfg.adminToken || cfg.secretKey || '');
            if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new S3Error(403, 'AccessDenied', 'Token admin salah.');
            if (rawPath === '/__admin/status' && req.method === 'GET') {
                const d = await driveHealth(), l = await localHealth();
                return json(res, 200, { status: 'success', mode: modeState.mode, changedAt: modeState.changedAt, drive: d, local: l ? { available: true, ...l } : { available: false } });
            }
            if (rawPath === '/__admin/mode' && req.method === 'POST') {
                let body = {};
                try { body = JSON.parse((await readSmallBody(req, 4096)) || '{}'); } catch (e) { throw new S3Error(400, 'MalformedJSON', 'Badan permintaan bukan JSON.'); }
                const st = await setMode(body.mode, body.by);
                return json(res, 200, { status: 'success', mode: st.mode, changedAt: st.changedAt });
            }
            throw new S3Error(404, 'NotFound', 'Rute admin tidak ada.');
        } catch (e) {
            if (e instanceof S3Error) return json(res, e.status, { status: 'error', code: e.code, message: e.message });
            console.error('[S3] admin error: ' + e.message);
            return json(res, 500, { status: 'error', message: e.message });
        }
    }

    // ----- router -----
    const server = http.createServer((req, res) => {
        const [rawPath, rawQuery = ''] = req.url.split('?');
        handle(req, res, rawPath, rawQuery).catch((e) => sendError(res, e, rawPath));
    });
    server.requestTimeout = 0;
    server.headersTimeout = 60000;
    server.keepAliveTimeout = 65000;

    async function handle(req, res, rawPath, rawQuery) {
        if (rawPath === '/__health' && req.method === 'GET') return health(res);
        if (rawPath.startsWith('/__admin/')) return admin(req, res, rawPath);
        verifyRequest(req, rawPath, rawQuery, cfg);
        const params = new URLSearchParams(rawQuery);
        const segs = rawPath.split('/').filter((s, i) => i > 0);
        let bucket = '', key = '';
        try {
            bucket = decodeURIComponent(segs[0] || '');
            key = segs.slice(1).map(decodeURIComponent).join('/');
        } catch (e) { throw new S3Error(400, 'InvalidURI', 'Alamat tidak valid'); }
        res.bucket = bucket;
        const full = bucket + '/' + key;
        const m = req.method;
        log(m, rawPath + (rawQuery ? '?' + rawQuery : ''));
        if (!bucket) { if (m === 'GET') return xml(res, 200, '<ListAllMyBucketsResult><Buckets></Buckets></ListAllMyBucketsResult>'); throw new S3Error(405, 'MethodNotAllowed', 'Metode tidak didukung'); }
        if (!key) { // operasi tingkat bucket
            if (m === 'HEAD') return send(res, 200, {});
            if (m === 'GET' && params.has('location')) return xml(res, 200, '<LocationConstraint></LocationConstraint>');
            if (m === 'GET' && params.has('uploads')) return xml(res, 200, `<ListMultipartUploadsResult><Bucket>${xmlEsc(bucket)}</Bucket><IsTruncated>false</IsTruncated></ListMultipartUploadsResult>`);
            if (m === 'GET') return listObjects(res, bucket, params);
            if (m === 'POST' && params.has('delete')) return deleteObjects(req, res);
            if (m === 'PUT') { req.resume(); return send(res, 200, {}); }
            throw new S3Error(405, 'MethodNotAllowed', 'Metode tidak didukung');
        }
        const uploadId = params.get('uploadId');
        if (m === 'GET') return uploadId ? listParts(res, uploadId, bucket, key) : getObject(req, res, full, false);
        if (m === 'HEAD') return getObject(req, res, full, true);
        if (m === 'PUT') {
            if (uploadId && params.has('partNumber')) return uploadPart(req, res, uploadId, params.get('partNumber'));
            if (req.headers['x-amz-copy-source']) { req.resume(); return copyObject(req, res, full); }
            return putObject(req, res, full);
        }
        if (m === 'DELETE') return uploadId ? abortMultipart(res, uploadId) : deleteObject(res, full);
        if (m === 'POST') {
            if (params.has('uploads')) return createMultipart(req, res, bucket, key);
            if (uploadId) return completeMultipart(req, res, uploadId, bucket, key);
        }
        throw new S3Error(405, 'MethodNotAllowed', 'Metode tidak didukung');
    }

    // bersihkan sisa upload yang terputus (> 24 jam)
    async function sweepSpool() {
        const cutoff = Date.now() - 24 * 3600 * 1000;
        for (const sub of [spool, path.join(spool, 'mpu')]) {
            for (const n of await fsp.readdir(sub).catch(() => [])) {
                if (n === 'mpu') continue;
                const p = path.join(sub, n);
                const st = await fsp.stat(p).catch(() => null);
                if (st && st.mtimeMs < cutoff) await fsp.rm(p, { recursive: true, force: true }).catch(() => {});
            }
        }
    }
    sweepSpool();
    const sweeper = setInterval(sweepSpool, 3600 * 1000);
    sweeper.unref();

    return { server, drive: driveRaw, store: drive, local, getMode: () => modeState.mode, setMode, cache, sweepSpool, close: () => new Promise((r) => { clearInterval(sweeper); server.close(() => r()); server.closeAllConnections && server.closeAllConnections(); }) };
}

function configFromEnv() {
    const e = process.env;
    return {
        host: e.S3_GATEWAY_HOST || '0.0.0.0',
        port: Number(e.S3_GATEWAY_PORT) || 9100,
        accessKey: e.S3_GATEWAY_ACCESS_KEY || '',
        secretKey: e.S3_GATEWAY_SECRET_KEY || '',
        clientId: e.GOOGLE_CLIENT_ID || '',
        clientSecret: e.GOOGLE_CLIENT_SECRET || '',
        tokenFile: e.GDRIVE_TOKEN_FILE || path.join(__dirname, 'gdrive-token.json'),
        driveApi: e.GDRIVE_API_BASE || undefined, driveUpload: e.GDRIVE_UPLOAD_BASE || undefined, tokenUrl: e.GOOGLE_TOKEN_URL || undefined, // untuk uji dengan Drive tiruan
        rootName: e.S3_DRIVE_ROOT_NAME || 'Pusaka Storage',
        rootId: e.S3_DRIVE_ROOT_ID || '',
        cacheDir: e.S3_CACHE_DIR || path.join(os.tmpdir(), 'pusaka-drive-s3-cache'),
        cacheMaxMb: e.S3_CACHE_MAX_MB !== undefined ? Number(e.S3_CACHE_MAX_MB) : 1024,
        cacheFileMaxMb: Number(e.S3_CACHE_FILE_MAX_MB) || 25,
        spoolDir: e.S3_SPOOL_DIR || path.join(os.tmpdir(), 'pusaka-drive-s3-spool'),
        log: e.S3_LOG === '1',
        localDir: e.S3_LOCAL_DIR || '',
        modeFile: e.S3_MODE_FILE || path.join(__dirname, 'storage-mode.json'),
        defaultMode: e.S3_DEFAULT_MODE || 'drive',
        adminToken: e.S3_GATEWAY_ADMIN_TOKEN || '',
    };
}

module.exports = { createGateway, createDriveStore, createLocalStore, guessMime, configFromEnv, sigV4Signature, canonicalQuery, AwsChunkedDecoder, keyHash, loadDotEnv };

if (require.main === module) {
    loadDotEnv();
    const cfg = configFromEnv();
    const miss = ['accessKey', 'secretKey', 'clientId', 'clientSecret'].filter((k) => !cfg[k]);
    if (miss.length) {
        console.error('[S3] Env belum lengkap: ' + miss.map((k) => ({ accessKey: 'S3_GATEWAY_ACCESS_KEY', secretKey: 'S3_GATEWAY_SECRET_KEY', clientId: 'GOOGLE_CLIENT_ID', clientSecret: 'GOOGLE_CLIENT_SECRET' }[k])).join(', '));
        process.exit(1);
    }
    const gw = createGateway(cfg);
    gw.server.listen(cfg.port, cfg.host, () => console.log('[S3] Gerbang S3→Google Drive berjalan di ' + cfg.host + ':' + cfg.port + ' (mode unggahan: ' + gw.getMode() + (cfg.localDir ? ', folder server ' + cfg.localDir : ', S3_LOCAL_DIR belum diatur') + ', cache ' + cfg.cacheDir + ' maks ' + cfg.cacheMaxMb + ' MB)'));
    process.on('unhandledRejection', (e) => console.error('[S3] unhandledRejection:', e && e.message));
    const stop = () => gw.close().then(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
}
