const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// Baca file .env (tanpa dependensi tambahan). Variabel yang sudah diset di environment/systemd/docker TIDAK ditimpa.
// Dicari berurutan: ENV_FILE, .env di folder server.js, lalu .env di folder kerja saat ini.
(function loadDotEnv() {
    const candidates = [process.env.ENV_FILE, path.join(__dirname, '.env'), path.join(process.cwd(), '.env')].filter(Boolean);
    const seen = new Set();
    for (const file of candidates) {
        const abs = path.resolve(file);
        if (seen.has(abs)) continue;
        seen.add(abs);
        let text;
        try { text = fs.readFileSync(abs, 'utf-8'); } catch (e) { continue; }
        let n = 0;
        for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
            if (!m) continue;
            let val = m[2].trim();
            if ((val.startsWith('"') && val.endsWith('"') && val.length >= 2) || (val.startsWith("'") && val.endsWith("'") && val.length >= 2)) {
                const q = val[0];
                val = val.slice(1, -1);
                if (q === '"') val = val.replace(/\\n/g, '\n').replace(/\\"/g, '"');
            } else {
                val = val.replace(/\s+#.*$/, ''); // komentar di akhir baris
            }
            if (process.env[m[1]] === undefined) { process.env[m[1]] = val; n++; }
        }
        console.log('[ENV] ' + abs + ' dimuat (' + n + ' variabel)');
    }
})();

process.on('unhandledRejection', (err) => console.error('[CRASH] Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('[CRASH] Uncaught Exception:', err));

global.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api-pusaka.smpn8ciamis.sch.id';
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''; // WAJIB lewat environment variable (service_role key). Jangan ditulis di kode.
if (!SUPABASE_KEY) { console.error('[FATAL] SUPABASE_KEY belum diset di environment server.'); process.exit(1); }
const ADMIN_PHONE = '6281312760936';
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('JWT_SECRET tersedia:', !!SUPABASE_JWT_SECRET);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
});

const app = express();
app.use(express.json());

// ===================== WEB PUSH (notifikasi layar kunci saat absen tercatat) =====================
// Butuh: npm i web-push, dan env VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (npx web-push generate-vapid-keys).
let webpush = null;
try { webpush = require('web-push'); } catch (e) { console.log('[PUSH] paket web-push belum terpasang; notifikasi absen dimatikan'); }
const PUSH_ENABLED = !!(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_ENABLED) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@smpn8ciamis.sch.id', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    console.log('[PUSH] Web Push aktif');
}
app.get('/push/public-key', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ key: PUSH_ENABLED ? process.env.VAPID_PUBLIC_KEY : null });
});

const PUSH_TEXT = { check_in: 'Absen masuk', late: 'Absen masuk (terlambat)', check_out: 'Absen pulang', staff: 'Absen tercatat' };
// Kirim notifikasi ke semua perangkat pemilik akun. Gagal tidak boleh mengganggu pemrosesan absensi.
async function notifyPunch(sn, pin, at, result) {
    if (!PUSH_ENABLED || !PUSH_TEXT[result]) return;
    if (Date.now() - at.getTime() > 15 * 60 * 1000) return;      // log lama (mesin mengirim ulang antrean) tidak dinotifikasikan
    const { data: log } = await supabase.from('fingerprint_logs').select('person_type, person_id')
        .eq('device_sn', sn).eq('pin', pin).eq('punched_at', at.toISOString()).maybeSingle();
    if (!log || !log.person_id) return;
    let userId = null, name = '';
    if (log.person_type === 'student') {
        const [{ data: sa }, { data: st }] = await Promise.all([
            supabase.from('student_accounts').select('user_id').eq('student_id', log.person_id).maybeSingle(),
            supabase.from('students').select('full_name').eq('id', log.person_id).maybeSingle(),
        ]);
        userId = sa && sa.user_id; name = (st && st.full_name) || '';
    } else if (log.person_type === 'teacher') {
        const { data: t } = await supabase.from('teachers').select('user_id').eq('id', log.person_id).maybeSingle();
        userId = t && t.user_id;
        if (userId) { const { data: p } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(); name = (p && p.full_name) || ''; }
    } else if (log.person_type === 'staff') {
        const { data: st } = await supabase.from('staff').select('user_id, full_name').eq('id', log.person_id).maybeSingle();
        userId = st && st.user_id; name = (st && st.full_name) || '';
    }
    if (!userId) return;
    const { data: subs } = await supabase.from('web_push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
    if (!subs || !subs.length) return;
    const hhmm = at.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
    const payload = JSON.stringify({
        title: 'PUSAKA · ' + PUSH_TEXT[result],
        body: (name ? name + ' · ' : '') + hhmm + ' WIB',
        url: '/', tag: 'absen-' + log.person_id, timestamp: at.getTime(),
    });
    for (const s of subs) {
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: 'high' });
        } catch (e) {
            if (e && (e.statusCode === 404 || e.statusCode === 410)) await supabase.from('web_push_subscriptions').delete().eq('id', s.id);
            else console.error('[PUSH] gagal kirim:', e && e.message);
        }
    }
}

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

let sock = null;
let isReady = false;
let botStarting = false;
const regSessions = new Map();
const cooldowns = new Map();
const COOLDOWN_TIME = 5 * 60 * 1000;
const REG_SESSION_TTL = 15 * 60 * 1000; // sesi pendaftaran kedaluwarsa setelah 15 menit tanpa selesai
const botState = { pairingCode: null, pairingPhone: null, pairingAt: 0, lastDisconnect: null };

const KNOWN_USERS_FILE = '/srv/wa-bot/known_users.json';
let knownUsers = new Set();
try { if (fs.existsSync(KNOWN_USERS_FILE)) knownUsers = new Set(JSON.parse(fs.readFileSync(KNOWN_USERS_FILE, 'utf-8'))); } catch (e) {}
function saveKnownUsers() { try { fs.writeFileSync(KNOWN_USERS_FILE, JSON.stringify(Array.from(knownUsers))); } catch (e) {} }

function formatToInternational(num) {
    let clean = String(num).replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    return clean;
}
function getSenderPhoneNumber(msg) {
    const candidates = [msg.key.remoteJidAlt, msg.key.participantAlt, msg.key.remoteJid, msg.key.participant];
    for (const jid of candidates) {
        if (jid && jid.endsWith('@s.whatsapp.net')) {
            let clean = jid.split('@')[0].replace(/\D/g, '');
            if (clean.startsWith('0')) clean = '62' + clean.slice(1);
            if (clean.length >= 10 && clean.length <= 14) return clean;
        }
    }
    for (const jid of candidates) {
        if (jid) {
            let clean = jid.split('@')[0].replace(/\D/g, '');
            if (clean && clean.length < 15) {
                if (clean.startsWith('0')) clean = '62' + clean.slice(1);
                return clean;
            }
        }
    }
    return '';
}
function parseInputDate(input) {
    const clean = input.replace(/\D/g, '');
    if (clean.length !== 8) return null;
    return clean.slice(4,8) + '-' + clean.slice(2,4) + '-' + clean.slice(0,2);
}

const DEFAULT_TEMPLATES = {
    parent_presence: `📢 *NOTIFIKASI PRESENSI SISWA*\n\nYth. Bapak/Ibu Orang Tua/Wali,\nMemberitahukan bahwa ananda:\n• Nama: *{{nama_siswa}}*\n• Tanggal: *{{tanggal}}*\n• Waktu: *{{waktu}} WIB*\n• Status: *{{jenis}} - {{status}}*\n\nTerima kasih atas perhatiannya.\n_SMP Negeri 8 Ciamis_`,
    attendance_batch: `📢 *NOTIFIKASI PRESENSI*\n\nYth. Orang Tua/Wali,\nAnanda *{{nama_siswa}}* pada *{{tanggal}}* pukul *{{waktu}} WIB* statusnya: *{{status}}*.\n\n_SMP Negeri 8 Ciamis_`,
    teacher_first: `⏰ *PENGINGAT JAM PERTAMA MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nHari ini jam pertama mengajar Anda:\n• Kelas: *{{kelas}}*\n• Mapel: *{{mapel}}*\n• Jam: *{{jam}}*\n\nMohon segera masuk kelas, lalu:\n1️⃣ Isi *absensi siswa*\n2️⃣ Isi *jurnal mengajar*\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
    teacher_next: `⏰ *PENGINGAT MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nSebentar lagi jadwal mengajar Anda:\n• Kelas: *{{kelas}}*\n• Mapel: *{{mapel}}*\n• Jam: *{{jam}}*\n\nMohon masuk kelas tepat waktu dan jangan lupa mengisi *jurnal mengajar* setelah pembelajaran.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
    teacher_followup: `📝 *PENGINGAT PENGISIAN*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nData berikut belum terisi untuk kelas *{{kelas}}* ({{mapel}}, {{jam}}):\n{{belum_terisi}}\n\nMohon segera dilengkapi di aplikasi Pusaka.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
    teacher_daily_recap: `📅 *REKAP JADWAL MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nJadwal mengajar Anda hari *{{hari}}, {{tanggal}}* ({{jumlah_jam}} sesi):\n\n{{rekap}}\n\nJangan lupa mengisi *absensi* dan *jurnal mengajar*.\n_Pusaka - SMP Negeri 8 Ciamis_`,
    test_connection: `✅ *TES KONEKSI BERHASIL*\n\nHalo Bapak/Ibu,\n\nNomor WhatsApp ini adalah *Akun Resmi SMP Negeri 8 Ciamis* yang digunakan untuk mengirimkan:\n\n📅 *Notifikasi Jadwal Pelajaran*\n📢 *Notifikasi Presensi Siswa*\n🔔 *Pengingat Mengajar*\n📝 *Pengingat Pengisian Jurnal*\n\n━━━━━━━━━━━━━━━━━━\n\n⚠️ *PENTING:*\nSilakan *SIMPAN NOMOR INI* ke kontak WhatsApp Bapak/Ibu.\n\nJika nomor ini *TIDAK disimpan*, WhatsApp akan memblokir pesan dari nomor yang tidak dikenal, sehingga Bapak/Ibu *tidak akan menerima notifikasi* penting dari sekolah.\n\n━━━━━━━━━━━━━━━━━━\n\nTerima kasih atas perhatiannya.\n_SMP Negeri 8 Ciamis_`,
    class_attendance_recap: `📊 *REKAP ABSENSI SISWA PER KELAS*\n{{hari}}, {{tanggal}}\n\n{{tabel_rekap}}\nKls=Kelas, Sis=Siswa, H=Hadir, S=Sakit, I=Izin, A=Alfa, Jml=Jumlah tidak sekolah\n\n*REKAP SEMUA KELAS* ({{jumlah_kelas}} kelas, {{total_siswa}} siswa)\n• Hadir: *{{total_hadir}}* ({{persen_hadir}}%)\n• Sakit: *{{total_sakit}}*\n• Izin: *{{total_izin}}*\n• Alfa: *{{total_alfa}}*\n• Jml tidak hadir: *{{total_tidak_hadir}}*\n\n_Pusaka - SMP Negeri 8 Ciamis_`
};
DEFAULT_TEMPLATES.class_group_recap = `📊 *ABSENSI KELAS {{kelas}}*\n{{hari}}, {{tanggal}}\n\nJumlah siswa: *{{total_siswa}}*\n✅ Hadir: *{{hadir}}*\n🤒 Sakit: *{{sakit}}*\n📝 Izin: *{{izin}}*\n❌ Alfa: *{{alpa}}*\n\n{{daftar_tidak_hadir}}\n\n_Pusaka - SMP Negeri 8 Ciamis_`;
DEFAULT_TEMPLATES.teacher_saturday_greeting = `🌿 *SELAMAT AKHIR PEKAN*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\n\nTerima kasih atas dedikasi dan kerja keras Bapak/Ibu dalam mendidik anak-anak kita sepanjang pekan ini.\n\nHari {{hari}} adalah waktu untuk berhenti sejenak. Nikmatilah akhir pekan bersama keluarga, karena keluarga adalah sumber kekuatan terbesar seorang pendidik. Istirahatlah yang cukup dan siapkan energi terbaik untuk mengajar kembali di hari Senin.\n\nSemoga sehat dan bahagia selalu. 🙏\n_Pusaka - SMP Negeri 8 Ciamis_`;
const DEFAULT_BOT_SETTINGS = {
    teacher_reminder_enabled: true, reminder_lead_min: 10, reminder_followup_min: 15,
    reminder_scope: 'all',            // 'first' = jam pertama saja, 'all' = semua jam mengajar
    followup_journal: true,           // cek & ingatkan jurnal yang belum terisi
    followup_attendance: true,        // cek & ingatkan daftar hadir yang belum terisi
    followup_attendance_next_teachers: true, // false = guru jam ke-2 dst TIDAK diingatkan bila kelas itu sudah diabsen guru sebelumnya
    daily_recap_enabled: false,       // kirim rekap jadwal harian ke guru
    daily_recap_time: '06:00',        // jam kirim rekap (WIB)
    class_recap_enabled: false,       // kirim rekap absensi per kelas ke grup saat semua kelas sudah terabsen
    class_recap_group_jid: '',        // JID grup tujuan (xxx@g.us)
    class_group_recap_enabled: false, // kirim rekap ke grup MASING-MASING kelas (tabel wa_class_groups)
    saturday_greeting_enabled: true,  // ucapan akhir pekan ke guru yang tidak mengajar hari Sabtu
    saturday_greeting_time: '07:00'   // jam kirim (WIB)
};
const CONFIG_TTL_MS = 30 * 1000;
let templateCache = { at: 0, rows: new Map() };
let settingsCache = { at: 0, value: Object.assign({}, DEFAULT_BOT_SETTINGS) };

async function loadTemplates() {
    if (Date.now() - templateCache.at < CONFIG_TTL_MS) return templateCache.rows;
    try {
        const { data, error } = await supabase.from('wa_message_templates').select('key, body, is_enabled');
        if (error) throw error;
        templateCache = { at: Date.now(), rows: new Map((data || []).map(r => [r.key, r])) };
    } catch (e) { templateCache.at = Date.now(); }
    return templateCache.rows;
}
function fillTemplate(body, vars) {
    return String(body).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}
async function renderMessage(key, vars) {
    const rows = await loadTemplates();
    const row = rows.get(key);
    if (row && row.is_enabled === false) return null;
    const body = row && row.body && row.body.trim() ? row.body : DEFAULT_TEMPLATES[key];
    return fillTemplate(body, vars);
}
async function getBotSettings() {
    if (Date.now() - settingsCache.at < CONFIG_TTL_MS) return settingsCache.value;
    try {
        const { data, error } = await supabase.from('wa_bot_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        settingsCache = { at: Date.now(), value: Object.assign({}, DEFAULT_BOT_SETTINGS, data || {}) };
    } catch (e) { settingsCache.at = Date.now(); }
    return settingsCache.value;
}

const taskQueue = [];
let isProcessingQueue = false;
function enqueueTask(taskFn) { taskQueue.push(taskFn); processQueue(); }
async function processQueue() {
    if (isProcessingQueue || taskQueue.length === 0) return;
    isProcessingQueue = true;
    while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        try { await task(); } catch (err) { console.error('[QUEUE ERROR]:', err.message); }
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 3000) + 3000));
    }
    isProcessingQueue = false;
}
async function sendSafeMessage(jid, content, options) {
    options = options || {};
    if (!sock || !isReady) return;
    try {
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, 1500));
        await sock.sendMessage(jid, content, options);
        await sock.sendPresenceUpdate('paused', jid);
    } catch (e) { console.error('[SEND ERROR to ' + jid + ']:', e.message); }
}

async function startBot() {
    if (botStarting) return;
    botStarting = true;
    setTimeout(() => { botStarting = false; }, 3000);
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const { version } = await fetchLatestBaileysVersion();
    console.log('[INFO] Baileys v' + version.join('.'));
    sock = makeWASocket({
        version: version, auth: state, logger: pino({ level: 'error' }),
        browser: ["Ubuntu", "Chrome", "22.0.04"],
        keepAliveIntervalMs: 25000, connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000, emitOwnEvents: false
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (update) => {
        const connection = update.connection;
        const lastDisconnect = update.lastDisconnect;
        if (connection === 'close') {
            isReady = false;
            const statusCode = (lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode) || 0;
            botState.lastDisconnect = { statusCode: statusCode, at: new Date().toISOString() };
            console.log('[TERPUTUS] Kode: ' + statusCode);
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
            if (shouldReconnect) setTimeout(startBot, 5000);
            else {
                try { fs.rmSync('baileys_auth', { recursive: true, force: true }); } catch (e) {}
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            isReady = true;
            botState.pairingCode = null;
            console.log('[SUCCESS] Bot terhubung ke WhatsApp.');
        }
    });
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe || msg.messageStubType) continue;
            const from = msg.key.remoteJid;
            if (!from || from.endsWith('@g.us') || from.includes('status@broadcast')) continue;
            console.log('[PESAN] Dari: ' + from);
            let messageContent = msg.message;
            if (messageContent.ephemeralMessage) messageContent = messageContent.ephemeralMessage.message;
            if (messageContent.viewOnceMessage) messageContent = messageContent.viewOnceMessage.message;
            if (messageContent.viewOnceMessageV2) messageContent = messageContent.viewOnceMessageV2.message;
            if (messageContent.documentWithCaption) messageContent = messageContent.documentWithCaption.message;
            if (messageContent.editedMessage) messageContent = messageContent.editedMessage.message;
            const text = (messageContent.conversation || (messageContent.extendedTextMessage && messageContent.extendedTextMessage.text) || '').trim();
            if (!text) continue;
            const cleanText = text.toLowerCase();
            const senderPhone = getSenderPhoneNumber(msg);
            await sock.readMessages([msg.key]).catch(() => {});
            if (cleanText.startsWith('cek ') || cleanText.startsWith('info ')) {
                if (senderPhone !== ADMIN_PHONE) continue; // bukan admin: abaikan tanpa membalas
                const targetNisn = cleanText.replace(/^(cek|info)\s+/, '').replace(/\D/g, '');
                if (!targetNisn) { enqueueTask(() => sendSafeMessage(from, { text: 'Format: cek NISN' }, { quoted: msg })); continue; }
                enqueueTask(async () => {
                    try {
                        let res1 = await supabase.from('students').select('*, classes(name)').eq('nisn', targetNisn).maybeSingle();
                        let student = res1.data;
                        if (!student) {
                            let res2 = await supabase.from('students').select('*, classes(name)').eq('nisn', parseInt(targetNisn, 10)).maybeSingle();
                            student = res2.data;
                        }
                        if (!student) { await sendSafeMessage(from, { text: 'NISN ' + targetNisn + ' tidak ditemukan.' }, { quoted: msg }); return; }
                        const className = (student.classes && student.classes.name) || '-';
                        const parentPhone = student.parent_phone ? '*' + student.parent_phone + '*' : '_Belum tertaut_';
                        await sendSafeMessage(from, { text: 'DATA NISN\n\nNama: ' + student.full_name + '\nNISN: ' + student.nisn + '\nKelas: ' + className + '\nOrtu: ' + (student.parent_name || '-') + '\nTgl Lahir: ' + (student.birth_date || '-') + '\nNo WA: ' + parentPhone }, { quoted: msg });
                    } catch (e) { await sendSafeMessage(from, { text: 'Database gangguan.' }, { quoted: msg }); }
                });
                continue;
            }
            if (cleanText.startsWith('hapus ') || cleanText.startsWith('reset ') || cleanText.startsWith('unreg ')) {
                if (senderPhone !== ADMIN_PHONE) continue;
                const targetNisn = cleanText.replace(/^(hapus|reset|unreg)\s+/, '').replace(/\D/g, '');
                enqueueTask(async () => {
                    try {
                        let res1 = await supabase.from('students').select('*, classes(name)').eq('nisn', targetNisn).maybeSingle();
                        let student = res1.data;
                        if (!student) {
                            let res2 = await supabase.from('students').select('*, classes(name)').eq('nisn', parseInt(targetNisn, 10)).maybeSingle();
                            student = res2.data;
                        }
                        if (!student) { await sendSafeMessage(from, { text: 'NISN ' + targetNisn + ' tidak ditemukan.' }, { quoted: msg }); return; }
                        if (!student.parent_phone) { await sendSafeMessage(from, { text: 'NISN ' + targetNisn + ' belum tertaut.' }, { quoted: msg }); return; }
                        await supabase.from('students').update({ parent_phone: null }).eq('nisn', student.nisn);
                        await sendSafeMessage(from, { text: 'Tautan dihapus untuk ' + student.full_name + '.' }, { quoted: msg });
                    } catch (e) {}
                });
                continue;
            }
            if (cleanText === 'batal') { if (regSessions.has(from)) { regSessions.delete(from); enqueueTask(() => sendSafeMessage(from, { text: 'Pendaftaran dibatalkan.' }, { quoted: msg })); } continue; }
            if (regSessions.has(from) && Date.now() - (regSessions.get(from).at || 0) > REG_SESSION_TTL) regSessions.delete(from);
            if (regSessions.has(from)) {
                const session = regSessions.get(from);
                if (session.step === 'WAIT_NISN') {
                    const nisnClean = text.replace(/\D/g, '');
                    enqueueTask(async () => {
                        try {
                            let res1 = await supabase.from('students').select('*, classes(name)').eq('nisn', nisnClean).maybeSingle();
                            let student = res1.data;
                            if (!student) {
                                let res2 = await supabase.from('students').select('*, classes(name)').eq('nisn', parseInt(nisnClean, 10)).maybeSingle();
                                student = res2.data;
                            }
                            if (!student) { await sendSafeMessage(from, { text: 'NISN ' + nisnClean + ' tidak ditemukan.\nKetik BATAL.' }, { quoted: msg }); return; }
                            if (student.parent_phone && String(student.parent_phone).trim() !== '') { regSessions.delete(from); await sendSafeMessage(from, { text: 'NISN ' + student.nisn + ' sudah tertaut.' }, { quoted: msg }); return; }
                            session.step = 'WAIT_DOB'; session.nisn = student.nisn; session.full_name = student.full_name; session.birth_date = student.birth_date;
                            const rombel = (student.classes && student.classes.name) || '';
                            await sendSafeMessage(from, { text: 'Data ditemukan!\nNama: ' + student.full_name + '\nKelas: ' + rombel + '\n\nMasukkan Tanggal Lahir (DDMMYYYY):' }, { quoted: msg });
                        } catch (e) {}
                    });
                    continue;
                }
                if (session.step === 'WAIT_DOB') {
                    const formattedInputDate = parseInputDate(text);
                    enqueueTask(async () => {
                        try {
                            if (!formattedInputDate) { await sendSafeMessage(from, { text: 'Format salah. Gunakan DDMMYYYY.' }, { quoted: msg }); return; }
                            if (formattedInputDate === session.birth_date) {
                                const realPhone = getSenderPhoneNumber(msg);
                                await supabase.from('students').update({ parent_phone: realPhone }).eq('nisn', session.nisn);
                                knownUsers.add(from); saveKnownUsers();
                                await sendSafeMessage(from, { text: 'BERHASIL!\nNomor (' + realPhone + ') tertaut dengan ' + session.full_name + '.' }, { quoted: msg });
                                regSessions.delete(from);
                            } else { await sendSafeMessage(from, { text: 'Tanggal lahir tidak sesuai. Ketik BATAL.' }, { quoted: msg }); }
                        } catch (e) {}
                    });
                    continue;
                }
            }
            if (cleanText === 'daftar') { regSessions.set(from, { step: 'WAIT_NISN', at: Date.now() }); enqueueTask(() => sendSafeMessage(from, { text: 'PENDAFTARAN PRESENSI\n\nMasukkan NISN:\n\n(Ketik BATAL untuk batal)' }, { quoted: msg })); continue; }
            // Pesan lain di luar perintah yang ditentukan (daftar, batal, cek/info/hapus/reset/unreg khusus admin, dan alur pendaftaran) diabaikan: bot tidak membalas.
        }
    });
}

app.post('/send-attendance', async (req, res) => {
    const notifications = (req.body && req.body.notifications) || [];
    if (!Array.isArray(notifications) || notifications.length === 0) return res.status(400).json({ status: 'error', message: 'Payload invalid.' });
    let enqueuedCount = 0;
    for (const item of notifications) {
        const phone = item.phone, student_name = item.student_name, time = item.time, status = item.status, date = item.date;
        if (!phone) continue;
        const targetJid = formatToInternational(phone) + '@s.whatsapp.net';
        enqueueTask(async () => {
            const messageText = await renderMessage('attendance_batch', { nama_siswa: student_name, tanggal: date || 'Hari ini', waktu: time, status: status });
            if (messageText) await sendSafeMessage(targetJid, { text: messageText });
        });
        enqueuedCount++;
    }
    return res.json({ status: 'success', message: enqueuedCount + ' antrian masuk.' });
});

app.post('/notify-parent', async (req, res) => {
    const student_id = req.body && req.body.student_id;
    const type = req.body && req.body.type;
    const status = req.body && req.body.status;
    const time = req.body && req.body.time;
    const date = req.body && req.body.date;
    if (!student_id) return res.status(400).json({ status: 'error', message: 'student_id wajib diisi.' });
    try {
        const result = await supabase.from('students').select('full_name, parent_phone').eq('id', student_id).maybeSingle();
        const student = result.data, error = result.error;
        if (error) throw error;
        if (!student) return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan.' });
        if (!student.parent_phone) return res.json({ status: 'skipped', message: 'Nomor WA untuk ' + student.full_name + ' belum tertaut.' });
        const typeText = type === 'check_out' ? 'Pulang' : 'Masuk';
        const statusText = status === 'terlambat' ? 'Terlambat' : 'Hadir';
        const targetJid = formatToInternational(student.parent_phone) + '@s.whatsapp.net';
        enqueueTask(async () => {
            const messageText = await renderMessage('parent_presence', { nama_siswa: student.full_name, tanggal: date || 'Hari ini', waktu: time || '-', jenis: typeText, status: statusText });
            if (messageText) await sendSafeMessage(targetJid, { text: messageText });
        });
        return res.json({ status: 'success', message: 'Notifikasi masuk antrian untuk ' + student.full_name + '.' });
    } catch (e) { return res.status(500).json({ status: 'error', message: e.message }); }
});

app.get('/pair', async (req, res) => {
    if (isReady) return res.send('<h2 style="color:green;text-align:center;">Bot Sudah Terhubung!</h2>');
    const rawNomor = req.query.nomor;
    if (!rawNomor) return res.send('<h3>Masukkan nomor: /pair?nomor=628xxx</h3>');
    try {
        const cleanNum = formatToInternational(rawNomor);
        if (!sock) startBot();
        await new Promise(r => setTimeout(r, 2500));
        if (!sock) return res.status(500).send('Bot belum siap. Coba lagi.');
        const code = await sock.requestPairingCode(cleanNum);
        res.send('<h1 style="text-align:center;color:#25D366;">Kode Pairing: ' + code + '</h1>');
    } catch (err) { res.status(500).send('Error: ' + err.message); }
});

const REMINDER_SENT_FILE = process.env.REMINDER_SENT_FILE || '/srv/wa-bot/reminders_sent.json';
let reminderSent = new Set();
let reminderSentDate = '';
function wibNow() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date());
    const g = function(t) { return parts.find(function(p){ return p.type === t; }).value; };
    const dowMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return { date: g('year') + '-' + g('month') + '-' + g('day'), minutes: parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10), dow: dowMap[g('weekday')] };
}
function hhmmToMin(t) { const parts = String(t).split(':'); return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10); }
function loadReminderState(date) {
    reminderSentDate = date; reminderSent = new Set();
    try { if (fs.existsSync(REMINDER_SENT_FILE)) { const d = JSON.parse(fs.readFileSync(REMINDER_SENT_FILE, 'utf-8')); if (d.date === date) reminderSent = new Set(d.keys || []); } } catch (e) {}
}
function markReminderSent(key) {
    reminderSent.add(key);
    try { fs.writeFileSync(REMINDER_SENT_FILE, JSON.stringify({ date: reminderSentDate, keys: Array.from(reminderSent) })); } catch (e) {}
}
let reminderRunning = false;
async function runTeacherReminders() {
    if (!isReady || reminderRunning) return;
    reminderRunning = true;
    try {
        const cfg = await getBotSettings();
        if (!cfg.teacher_reminder_enabled) return;
        const now = wibNow();
        if (reminderSentDate !== now.date) loadReminderState(now.date);
        if (now.dow > 6) return;
        const stRes = await supabase.from('school_settings').select('academic_year, active_semester').limit(1).maybeSingle();
        const st = stRes.data;
        let q = supabase.from('schedules').select('id, teacher_id, class_id, subject, start_time, end_time, academic_year, semester').eq('is_active', true).eq('day_of_week', now.dow);
        if (st && st.academic_year) q = q.eq('academic_year', st.academic_year);
        if (st && st.active_semester) q = q.eq('semester', st.active_semester);
        const res = await q;
        const schedules = res.data, error = res.error;
        if (error || !schedules || schedules.length === 0) return;
        const recapMin = hhmmToMin(cfg.daily_recap_time || '06:00');
        const lastEnd = Math.max.apply(null, schedules.map(function(s) { return hhmmToMin(s.end_time); }));
        const needRecap = cfg.daily_recap_enabled && now.minutes >= recapMin && now.minutes < lastEnd && !reminderSent.has('recap:done');
        let relevant = schedules.filter(function(s) {
            const start = hhmmToMin(s.start_time);
            return (now.minutes >= start - cfg.reminder_lead_min && now.minutes < start + 5) || (now.minutes >= start + cfg.reminder_followup_min && now.minutes < hhmmToMin(s.end_time));
        });
        // Cakupan: hanya jam pertama guru, atau semua jam
        const firstOfTeacher = new Map();
        for (const s of schedules) { const cur = firstOfTeacher.get(s.teacher_id); if (!cur || hhmmToMin(s.start_time) < hhmmToMin(cur.start_time)) firstOfTeacher.set(s.teacher_id, s); }
        if (cfg.reminder_scope === 'first') relevant = relevant.filter(function(s) { return firstOfTeacher.get(s.teacher_id).id === s.id; });
        if (relevant.length === 0 && !needRecap) return;
        const teacherIds = Array.from(new Set(schedules.map(function(s){ return s.teacher_id; })));
        const classIds = Array.from(new Set((needRecap ? schedules : relevant).map(function(s){ return s.class_id; })));
        const prom = await Promise.all([
            supabase.from('teachers').select('id, user_id').in('id', teacherIds),
            supabase.from('classes').select('id, name').in('id', classIds)
        ]);
        const teachers = prom[0].data, classes = prom[1].data;
        const userIds = (teachers || []).map(function(t){ return t.user_id; });
        const profRes = await supabase.from('profiles').select('id, full_name, phone').in('id', userIds);
        const profiles = profRes.data;
        const profById = new Map((profiles || []).map(function(p){ return [p.id, p]; }));
        const teacherById = new Map((teachers || []).map(function(t){ return [t.id, profById.get(t.user_id)]; }));
        const className = new Map((classes || []).map(function(c){ return [c.id, c.name]; }));
        if (needRecap) {
            const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
            const byTeacher = new Map();
            for (const s of schedules) { if (!byTeacher.has(s.teacher_id)) byTeacher.set(s.teacher_id, []); byTeacher.get(s.teacher_id).push(s); }
            const tgl = now.date.split('-').reverse().join('/');
            for (const [tid, list] of byTeacher) {
                const prof = teacherById.get(tid);
                if (!prof || !prof.phone) continue;
                const key = 'recap:' + tid; if (reminderSent.has(key)) continue; markReminderSent(key);
                list.sort(function(x, y) { return hhmmToMin(x.start_time) - hhmmToMin(y.start_time); });
                const rekap = list.map(function(x, i) { return (i + 1) + '. ' + String(x.start_time).slice(0, 5) + '-' + String(x.end_time).slice(0, 5) + ' | ' + (className.get(x.class_id) || '-') + ' | ' + x.subject; }).join('\n');
                const vars = { nama_guru: prof.full_name, hari: HARI[now.dow], tanggal: tgl, jumlah_jam: list.length, rekap: rekap };
                const jid = formatToInternational(prof.phone) + '@s.whatsapp.net';
                enqueueTask(async () => { const text = await renderMessage('teacher_daily_recap', vars); if (text) await sendSafeMessage(jid, { text: text }); });
            }
            markReminderSent('recap:done');
        }
        for (const s of relevant) {
            const prof = teacherById.get(s.teacher_id);
            if (!prof || !prof.phone) continue;
            const start = hhmmToMin(s.start_time);
            const isFirst = firstOfTeacher.get(s.teacher_id).id === s.id;
            const jam = String(s.start_time).slice(0, 5) + '-' + String(s.end_time).slice(0, 5) + ' WIB';
            const kelas = className.get(s.class_id) || '-';
            const jid = formatToInternational(prof.phone) + '@s.whatsapp.net';
            if (now.minutes < start + 5) {
                const key = 'pre:' + s.id; if (reminderSent.has(key)) continue; markReminderSent(key);
                const tplKey = isFirst ? 'teacher_first' : 'teacher_next';
                const vars = { nama_guru: prof.full_name, kelas: kelas, mapel: s.subject, jam: jam };
                enqueueTask(async () => { const text = await renderMessage(tplKey, vars); if (text) await sendSafeMessage(jid, { text: text }); });
            } else {
                const key = 'post:' + s.id; if (reminderSent.has(key)) continue;
                let journalDone = true, attDone = true;
                if (cfg.followup_journal) { const jrRes = await supabase.from('teaching_journals').select('id').eq('schedule_id', s.id).eq('date', now.date).limit(1); journalDone = !!(jrRes.data && jrRes.data.length > 0); }
                if (cfg.followup_attendance) { const atRes = await supabase.from('attendance').select('id').eq('schedule_id', s.id).eq('date', now.date).limit(1); attDone = !!(atRes.data && atRes.data.length > 0); }
                if (cfg.followup_attendance && !attDone && cfg.followup_attendance_next_teachers === false) {
                    // Guru jam berikutnya: bila kelas ini sudah diabsen pada jam lain hari ini, tidak perlu diingatkan lagi.
                    const classScheds = schedules.filter(function(x) { return x.class_id === s.class_id; });
                    const firstOfClass = classScheds.reduce(function(a, b) { return hhmmToMin(b.start_time) < hhmmToMin(a.start_time) ? b : a; }, classScheds[0]);
                    if (firstOfClass && firstOfClass.id !== s.id) {
                        const ids = classScheds.map(function(x) { return x.id; }).join(',');
                        const cr = await supabase.from('attendance').select('id').eq('date', now.date).or('sched_class_id.eq.' + s.class_id + ',schedule_id.in.(' + ids + ')').limit(1);
                        if (!cr.error && cr.data && cr.data.length > 0) attDone = true;
                    }
                }
                markReminderSent(key);
                if (journalDone && attDone) continue;
                const todo = []; if (!attDone) todo.push('*absensi siswa*'); if (!journalDone) todo.push('*jurnal mengajar*');
                const vars = { nama_guru: prof.full_name, kelas: kelas, mapel: s.subject, jam: jam, belum_terisi: todo.map(function(t){ return '- ' + t; }).join('\n') };
                enqueueTask(async () => { const text = await renderMessage('teacher_followup', vars); if (text) await sendSafeMessage(jid, { text: text }); });
            }
        }
    } catch (e) { console.error('[REMINDER ERROR]:', e.message); }
    finally { reminderRunning = false; }
}
// Ucapan akhir pekan: hari Sabtu dikirim ke guru yang TIDAK punya jadwal mengajar hari itu (sekali per guru per hari)
let saturdayRunning = false;
async function runSaturdayGreeting() {
    if (!isReady || saturdayRunning) return;
    saturdayRunning = true;
    try {
        const cfg = await getBotSettings();
        if (!cfg.saturday_greeting_enabled) return;
        const now = wibNow();
        if (now.dow !== 6) return;
        const startMin = hhmmToMin(cfg.saturday_greeting_time || '07:00');
        if (now.minutes < startMin || now.minutes >= 12 * 60) return; // lewat tengah hari tidak dikirim lagi
        if (reminderSentDate !== now.date) loadReminderState(now.date);
        if (reminderSent.has('sat:done')) return;
        const stRes = await supabase.from('school_settings').select('academic_year, active_semester').limit(1).maybeSingle();
        const st = stRes.data;
        let q = supabase.from('schedules').select('teacher_id').eq('is_active', true).eq('day_of_week', 6);
        if (st && st.academic_year) q = q.eq('academic_year', st.academic_year);
        if (st && st.active_semester) q = q.eq('semester', st.active_semester);
        const sRes = await q;
        if (sRes.error) throw sRes.error;
        const teaching = new Set((sRes.data || []).map(function(r) { return r.teacher_id; }));
        const tRes = await supabase.from('teachers').select('id, user_id');
        if (tRes.error) throw tRes.error;
        const targets = (tRes.data || []).filter(function(t) { return !teaching.has(t.id) && t.user_id; });
        const pRes = await supabase.from('profiles').select('id, full_name, phone').in('id', targets.map(function(t) { return t.user_id; }));
        if (pRes.error) throw pRes.error;
        const profById = new Map((pRes.data || []).map(function(p) { return [p.id, p]; }));
        for (const t of targets) {
            const prof = profById.get(t.user_id);
            if (!prof || !prof.phone) continue;
            const key = 'sat:' + t.id; if (reminderSent.has(key)) continue; markReminderSent(key);
            const vars = { nama_guru: prof.full_name, hari: 'Sabtu' };
            const jid = formatToInternational(prof.phone) + '@s.whatsapp.net';
            enqueueTask(async () => { const text = await renderMessage('teacher_saturday_greeting', vars); if (text) await sendSafeMessage(jid, { text: text }); });
        }
        markReminderSent('sat:done');
    } catch (e) { console.error('[SATURDAY GREETING ERROR]:', e.message); }
    finally { saturdayRunning = false; }
}
app.post('/run-saturday-greeting', async (req, res) => { runSaturdayGreeting(); res.json({ status: 'started' }); });
app.post('/run-teacher-reminders', async (req, res) => { runTeacherReminders(); res.json({ status: 'started' }); });

function verifyJwtLocal(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('format token salah');
    const expected = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64url');
    const a = Buffer.from(expected), b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('tanda tangan tidak cocok');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('token kedaluwarsa');
    if (!payload.sub) throw new Error('token tanpa user');
    return payload.sub;
}

async function resolveUserId(token) {
    if (SUPABASE_JWT_SECRET) {
        try { return verifyJwtLocal(token, SUPABASE_JWT_SECRET); } catch (e) { console.log('[AUTH] Lokal gagal:', e.message); }
    }
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token }
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.id) throw new Error('GoTrue ' + r.status + ': ' + (body.msg || body.message || 'ditolak'));
    return body.id;
}

async function requireAdmin(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token) return res.status(401).json({ status: 'error', message: 'Token tidak ada.' });
        let userId;
        try { userId = await resolveUserId(token); }
        catch (e) { return res.status(401).json({ status: 'error', message: 'Token tidak valid (' + e.message + ').' }); }
        const roleRes = await supabase.from('user_roles').select('role').eq('user_id', userId);
        const roles = roleRes.data, rErr = roleRes.error;
        if (rErr) throw rErr;
        const isAdmin = (roles || []).some(function(r){ return r.role === 'admin' || r.role === 'super_admin'; });
        if (!isAdmin) return res.status(403).json({ status: 'error', message: 'Hanya admin.' });
        req.adminUserId = userId;
        next();
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
}

async function requireUser(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token) return res.status(401).json({ status: 'error', message: 'Token tidak ada.' });
        try { req.userId = await resolveUserId(token); }
        catch (e) { return res.status(401).json({ status: 'error', message: 'Token tidak valid (' + e.message + ').' }); }
        next();
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
}

function botPhone() {
    const id = sock && sock.user && sock.user.id;
    return id ? String(id).split(':')[0].split('@')[0] : null;
}

app.get('/admin/status', requireAdmin, (req, res) => {
    const pairingValid = botState.pairingCode && Date.now() - botState.pairingAt < 2 * 60 * 1000;
    res.json({
        status: 'success',
        connected: isReady,
        phone: isReady ? botPhone() : null,
        name: isReady && sock.user ? sock.user.name || null : null,
        queue_length: taskQueue.length,
        pairing_code: pairingValid ? botState.pairingCode : null,
        pairing_phone: pairingValid ? botState.pairingPhone : null,
        last_disconnect: botState.lastDisconnect
    });
});

app.post('/admin/pair', requireAdmin, async (req, res) => {
    try {
        if (isReady) return res.status(400).json({ status: 'error', message: 'Bot sudah terhubung. Putuskan dulu bila ingin mengganti nomor.' });
        const phone = formatToInternational((req.body && req.body.phone) || '');
        if (phone.length < 10) return res.status(400).json({ status: 'error', message: 'Nomor WhatsApp tidak valid.' });
        if (!sock) startBot();
        await new Promise(r => setTimeout(r, 2500));
        if (!sock) return res.status(500).json({ status: 'error', message: 'Bot belum siap. Coba lagi.' });
        if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
            return res.status(400).json({ status: 'error', message: 'Sesi sudah terdaftar. Putuskan tautan lalu coba lagi.' });
        }
        const code = await sock.requestPairingCode(phone);
        botState.pairingCode = code; botState.pairingPhone = phone; botState.pairingAt = Date.now();
        res.json({ status: 'success', code: code, phone: phone });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/admin/logout', requireAdmin, async (req, res) => {
    try {
        try { if (sock) await sock.logout(); } catch (e) {}
        isReady = false;
        botState.pairingCode = null;
        try { fs.rmSync('baileys_auth', { recursive: true, force: true }); } catch (e) {}
        setTimeout(function() { if (!isReady) startBot(); }, 4000);
        res.json({ status: 'success', message: 'Tautan WhatsApp diputus.' });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/admin/test-send', requireAdmin, async (req, res) => {
    const phone = req.body && req.body.phone;
    const template_key = req.body && req.body.template_key;
    const vars = req.body && req.body.vars;
    const text = req.body && req.body.text;
    if (!isReady) return res.status(400).json({ status: 'error', message: 'Bot belum terhubung.' });
    if (!phone) return res.status(400).json({ status: 'error', message: 'Nomor tujuan wajib diisi.' });
    let message = text;
    if (!message && template_key && DEFAULT_TEMPLATES[template_key]) {
        message = fillTemplate(DEFAULT_TEMPLATES[template_key], vars || {});
    }
    if (!message) return res.status(400).json({ status: 'error', message: 'Pesan kosong.' });
    const jid = formatToInternational(phone) + '@s.whatsapp.net';
    enqueueTask(async () => { await sendSafeMessage(jid, { text: message }); });
    res.json({ status: 'success', message: 'Pesan uji masuk antrian.' });
});

async function loadTeacherContacts() {
    const { data: teachers, error } = await supabase.from('teachers').select('id, user_id');
    if (error) throw error;
    const userIds = (teachers || []).map(t => t.user_id).filter(Boolean);
    if (userIds.length === 0) return { total: 0, contacts: [] };
    const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, phone').in('id', userIds);
    if (pErr) throw pErr;
    const seen = new Set();
    const contacts = [];
    for (const p of (profiles || [])) {
        if (!p.phone) continue;
        const num = formatToInternational(p.phone);
        if (!num || num.length < 10 || seen.has(num)) continue;
        seen.add(num);
        contacts.push({ name: p.full_name, phone: num });
    }
    return { total: userIds.length, contacts };
}

app.get('/admin/teacher-contacts', requireAdmin, async (req, res) => {
    try {
        const { total, contacts } = await loadTeacherContacts();
        res.json({ status: 'success', total, with_phone: contacts.length, without_phone: total - contacts.length });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// Kirim pesan "test_connection" (template dari tabel wa_message_templates) ke semua guru yang punya nomor WA
app.post('/admin/test-connection-teachers', requireAdmin, async (req, res) => {
    try {
        if (!isReady) return res.status(400).json({ status: 'error', message: 'Bot belum terhubung.' });
        templateCache.at = 0; // pakai isi template terbaru
        const probe = await renderMessage('test_connection', { nama_guru: 'Bapak/Ibu' });
        if (!probe) return res.status(400).json({ status: 'error', message: 'Template tes koneksi dinonaktifkan.' });
        const { total, contacts } = await loadTeacherContacts();
        if (contacts.length === 0) return res.status(400).json({ status: 'error', message: 'Tidak ada guru dengan nomor WhatsApp.' });
        for (const c of contacts) {
            const jid = c.phone + '@s.whatsapp.net';
            enqueueTask(async () => {
                const text = await renderMessage('test_connection', { nama_guru: c.name || 'Bapak/Ibu' });
                if (!text) return;
                console.log('[TES KONEKSI] ' + c.name + ' (' + c.phone + ')');
                await sendSafeMessage(jid, { text });
            });
        }
        res.json({ status: 'success', queued: contacts.length, skipped_no_phone: total - contacts.length,
            message: contacts.length + ' pesan masuk antrian (jeda 3-6 detik per pesan).' });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ===== Rekap absensi per kelas ke grup (dipicu frontend, bot TIDAK polling) =====
const CLASS_RECAP_FILE = process.env.CLASS_RECAP_FILE || '/srv/wa-bot/class_recap_sent.json';
const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
function classRecapSentFor(date) {
    try { if (fs.existsSync(CLASS_RECAP_FILE)) { const d = JSON.parse(fs.readFileSync(CLASS_RECAP_FILE, 'utf-8')); return d.date === date; } } catch (e) {}
    return false;
}
function markClassRecapSent(date) { try { fs.writeFileSync(CLASS_RECAP_FILE, JSON.stringify({ date: date })); } catch (e) {} }
function dateIdn(iso) { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function dowOfIso(iso) { const d = new Date(iso + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; }

async function loadClassCompletion(date) {
    const r = await supabase.rpc('get_class_attendance_completion', { p_date: date });
    if (r.error) throw r.error;
    return r.data || [];
}
// Singkatan kelas: dua karakter depan (angka romawi diubah ke angka: "VII A" -> "7A", "VIII B" -> "8B")
function shortClassName(name) {
    let n = String(name || '').trim().toUpperCase();
    const m = n.match(/^(VIII|VII|IX)\s*([A-Z0-9]*)/);
    if (m) n = ({ VII: '7', VIII: '8', IX: '9' })[m[1]] + m[2];
    return n.replace(/\s+/g, '').slice(0, 2);
}
function buildClassRecapVars(rows, date) {
    const num = function(v) { return Number(v) || 0; };
    const tot = { siswa: 0, hadir: 0, sakit: 0, izin: 0, alpa: 0 };
    const cells = rows.map(function(c) {
        const h = num(c.hadir), sk = num(c.sakit), iz = num(c.izin), al = num(c.alpa), sw = num(c.total_students);
        tot.siswa += sw; tot.hadir += h; tot.sakit += sk; tot.izin += iz; tot.alpa += al;
        return [shortClassName(c.class_name), sw, h, sk, iz, al, sk + iz + al];
    });
    const tidakHadir = tot.sakit + tot.izin + tot.alpa;
    const header = ['Kls', 'Sis', 'H', 'S', 'I', 'A', 'Jml'];
    const total = ['Tot', tot.siswa, tot.hadir, tot.sakit, tot.izin, tot.alpa, tidakHadir];
    // Lebar tiap kolom menyesuaikan isi terpanjang; tabel dibuat sesempit mungkin agar tidak terpotong di layar HP
    const w = header.map(function(h, i) {
        return Math.max(String(h).length, String(total[i]).length, cells.reduce(function(m, r) { return Math.max(m, String(r[i]).length); }, 0));
    });
    const fmt = function(r) { return '|' + r.map(function(v, i) { return i === 0 ? String(v).padEnd(w[i]) : String(v).padStart(w[i]); }).join('|') + '|'; };
    const border = '+' + w.map(function(x) { return '-'.repeat(x); }).join('+') + '+';
    const tabel = '```\n' + [border, fmt(header), border].concat(cells.map(fmt), [border, fmt(total), border]).join('\n') + '\n```';
    const terabsen = tot.hadir + tidakHadir;
    const persen = terabsen > 0 ? (Math.round(tot.hadir / terabsen * 1000) / 10).toString().replace('.', ',') : '0';
    // Variabel lama (rekap_kelas, total_hadir, total_siswa, jumlah_kelas) tetap disediakan agar template buatan sendiri tidak rusak
    const lama = rows.map(function(c) { return '• *' + c.class_name + '*: H ' + num(c.hadir) + ' | S ' + num(c.sakit) + ' | I ' + num(c.izin) + ' | A ' + num(c.alpa); }).join('\n');
    return { hari: DAY_NAMES[dowOfIso(date)], tanggal: dateIdn(date), tabel_rekap: tabel, rekap_kelas: lama,
        total_siswa: tot.siswa, total_hadir: tot.hadir, total_sakit: tot.sakit, total_izin: tot.izin, total_alfa: tot.alpa,
        total_tidak_hadir: tidakHadir, persen_hadir: persen, jumlah_kelas: rows.length };
}
async function queueClassRecap(rows, date, jid) {
    const text = await renderMessage('class_attendance_recap', buildClassRecapVars(rows, date));
    if (!text) return false;
    enqueueTask(async () => { console.log('[REKAP KELAS] kirim ke grup ' + jid); await sendSafeMessage(jid, { text: text }); });
    return true;
}

// Dipanggil frontend setelah absen disimpan. Bot cek SEKALI (bukan terus-menerus); kirim hanya jika semua kelas sudah terisi.
app.post('/attendance-complete', requireUser, async (req, res) => {
    try {
        const cfg = await getBotSettings();
        if (!cfg.class_recap_enabled || !cfg.class_recap_group_jid) return res.json({ status: 'disabled' });
        const date = wibNow().date; // selalu hari ini (WIB), abaikan tanggal dari klien
        if (classRecapSentFor(date)) return res.json({ status: 'already_sent' });
        if (!isReady) return res.status(503).json({ status: 'error', message: 'Bot belum terhubung.' });
        const rows = await loadClassCompletion(date);
        if (rows.length === 0 || rows.some(function(c) { return !c.filled; })) {
            const belum = rows.filter(function(c) { return !c.filled; }).map(function(c) { return c.class_name; });
            console.log('[REKAP KELAS] belum lengkap (' + (rows.length - belum.length) + '/' + rows.length + '). Belum absen: ' + (belum.join(', ') || '(tidak ada kelas berjadwal aktif hari ini)'));
            return res.json({ status: 'not_complete', filled: rows.filter(function(c) { return c.filled; }).length, total: rows.length });
        }
        if (classRecapSentFor(date)) return res.json({ status: 'already_sent' });
        markClassRecapSent(date); // tandai dulu supaya request bersamaan tidak mengirim dobel
        const ok = await queueClassRecap(rows, date, cfg.class_recap_group_jid);
        res.json({ status: ok ? 'queued' : 'template_disabled', total: rows.length });
    } catch (e) { console.error('[REKAP KELAS ERROR]:', e.message); res.status(500).json({ status: 'error', message: e.message }); }
});

app.get('/admin/groups', requireAdmin, async (req, res) => {
    try {
        if (!isReady) return res.status(400).json({ status: 'error', message: 'Bot belum terhubung.' });
        const all = await sock.groupFetchAllParticipating();
        const groups = Object.values(all || {}).map(function(g) { return { id: g.id, name: g.subject, size: (g.participants || []).length }; })
            .sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
        res.json({ status: 'success', groups: groups });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// Admin: kirim rekap saat ini ke grup secara manual (walau belum lengkap)
app.post('/admin/send-class-recap', requireAdmin, async (req, res) => {
    try {
        if (!isReady) return res.status(400).json({ status: 'error', message: 'Bot belum terhubung.' });
        settingsCache.at = 0;
        const cfg = await getBotSettings();
        if (!cfg.class_recap_group_jid) return res.status(400).json({ status: 'error', message: 'Grup tujuan belum dipilih.' });
        // Uji coba: pakai data absensi TERAKHIR yang tercatat (tidak perlu jadwal aktif / hari ini)
        const r = await supabase.rpc('get_last_class_attendance_recap');
        if (r.error) {
            const hint = /get_last_class_attendance_recap/.test(r.error.message || '') ? ' Jalankan migrasi 20261011190000_wa_last_attendance_recap.sql dulu.' : '';
            return res.status(500).json({ status: 'error', message: r.error.message + hint });
        }
        const rows = r.data || [];
        if (rows.length === 0) return res.status(400).json({ status: 'error', message: 'Belum ada data absensi sama sekali.' });
        const date = String(rows[0].recap_date).slice(0, 10);
        const ok = await queueClassRecap(rows, date, cfg.class_recap_group_jid);
        if (!ok) return res.status(400).json({ status: 'error', message: 'Template rekap dinonaktifkan.' });
        res.json({ status: 'success', message: 'Rekap uji coba (data absensi ' + dateIdn(date) + ') masuk antrian.' });
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

// ===== Rekap absensi ke grup MASING-MASING kelas (jumlah + nama siswa yang tidak masuk) =====
const CLASS_GROUP_SENT_FILE = process.env.CLASS_GROUP_SENT_FILE || '/srv/wa-bot/class_group_recap_sent.json';
const ABSENT_LABEL = { sakit: 'Sakit', izin: 'Izin', alpa: 'Alfa' };
const classGroupInflight = new Set(); // cegah kirim ganda bila ada beberapa request bersamaan
function loadClassGroupSent(date) {
    try { if (fs.existsSync(CLASS_GROUP_SENT_FILE)) { const d = JSON.parse(fs.readFileSync(CLASS_GROUP_SENT_FILE, 'utf-8')); if (d.date === date) return new Set(d.class_ids || []); } } catch (e) {}
    return new Set();
}
function saveClassGroupSent(date, set) { try { fs.writeFileSync(CLASS_GROUP_SENT_FILE, JSON.stringify({ date: date, class_ids: Array.from(set) })); } catch (e) {} }

function buildClassGroupVars(c, absent, date) {
    const num = function(v) { return Number(v) || 0; };
    let daftar;
    if (absent.length === 0) {
        daftar = 'Alhamdulillah, semua siswa yang tercatat hari ini *hadir* 🎉';
    } else {
        daftar = '*Siswa yang tidak masuk (' + absent.length + '):*\n' + absent.map(function(s, i) {
            return (i + 1) + '. ' + s.full_name + ' (' + (ABSENT_LABEL[s.status] || s.status) + ')';
        }).join('\n');
    }
    return { kelas: c.class_name, hari: DAY_NAMES[dowOfIso(date)], tanggal: dateIdn(date),
        total_siswa: num(c.total_students), hadir: num(c.hadir), sakit: num(c.sakit), izin: num(c.izin), alpa: num(c.alpa),
        jumlah_tidak_hadir: absent.length, daftar_tidak_hadir: daftar };
}

// opts: { classId?: string, force?: boolean }. Kelas yang absennya sudah terisi & punya grup dikirim SEKALI per hari.
async function runClassGroupRecaps(date, opts) {
    opts = opts || {};
    const result = { queued: [], already_sent: [], not_filled: [], no_group: [] };
    const [rows, mapRes, absRes] = await Promise.all([
        loadClassCompletion(date),
        supabase.from('wa_class_groups').select('class_id, group_jid, group_name').eq('enabled', true),
        supabase.rpc('get_class_absent_students', { p_date: date })
    ]);
    if (mapRes.error) throw mapRes.error;
    if (absRes.error) throw absRes.error;
    const groupOf = new Map((mapRes.data || []).map(function(m) { return [m.class_id, m]; }));
    const absentOf = new Map();
    (absRes.data || []).forEach(function(a) { if (!absentOf.has(a.class_id)) absentOf.set(a.class_id, []); absentOf.get(a.class_id).push(a); });
    const sent = loadClassGroupSent(date);
    for (const c of rows) {
        if (opts.classId && c.class_id !== opts.classId) continue;
        const g = groupOf.get(c.class_id);
        if (!g) { result.no_group.push(c.class_name); continue; }
        if (!c.filled) { result.not_filled.push(c.class_name); continue; }
        if (!opts.force && (sent.has(c.class_id) || classGroupInflight.has(c.class_id))) { result.already_sent.push(c.class_name); continue; }
        const text = await renderMessage('class_group_recap', buildClassGroupVars(c, absentOf.get(c.class_id) || [], date));
        if (!text) continue; // template dinonaktifkan
        classGroupInflight.add(c.class_id);
        sent.add(c.class_id); saveClassGroupSent(date, sent); // tandai dulu; dibatalkan bila kirim gagal
        result.queued.push(c.class_name);
        enqueueTask(async function() {
            try {
                if (!sock || !isReady) throw new Error('bot tidak terhubung');
                console.log('[REKAP GRUP KELAS] ' + c.class_name + ' -> ' + g.group_jid);
                await sock.sendPresenceUpdate('composing', g.group_jid);
                await new Promise(function(r) { setTimeout(r, 1500); });
                await sock.sendMessage(g.group_jid, { text: text });
                await sock.sendPresenceUpdate('paused', g.group_jid);
            } catch (e) {
                console.error('[REKAP GRUP KELAS GAGAL ' + c.class_name + ']:', e.message);
                sent.delete(c.class_id); saveClassGroupSent(date, sent); // boleh dicoba lagi pada simpan absen berikutnya
            } finally { classGroupInflight.delete(c.class_id); }
        });
    }
    return result;
}

// Dipanggil frontend setiap kali absen disimpan. Idempoten: tiap kelas hanya terkirim sekali per hari.
app.post('/attendance-class-saved', requireUser, async (req, res) => {
    try {
        const cfg = await getBotSettings();
        if (!cfg.class_group_recap_enabled) return res.json({ status: 'disabled' });
        if (!isReady) return res.status(503).json({ status: 'error', message: 'Bot belum terhubung.' });
        const r = await runClassGroupRecaps(wibNow().date, {});
        res.json(Object.assign({ status: 'ok' }, r));
    } catch (e) { console.error('[REKAP GRUP KELAS ERROR]:', e.message); res.status(500).json({ status: 'error', message: e.message }); }
});

// Admin: kirim sekarang (hari ini). body: { class_id?: uuid, force?: boolean }  -- force = kirim ulang walau sudah terkirim
app.post('/admin/send-class-group-recaps', requireAdmin, async (req, res) => {
    try {
        if (!isReady) return res.status(400).json({ status: 'error', message: 'Bot belum terhubung.' });
        const body = req.body || {};
        const r = await runClassGroupRecaps(wibNow().date, { classId: body.class_id, force: !!body.force });
        res.json(Object.assign({ status: 'success' }, r));
    } catch (e) { res.status(500).json({ status: 'error', message: e.message }); }
});

app.post('/admin/reload-config', requireAdmin, (req, res) => {
    templateCache.at = 0;
    settingsCache.at = 0;
    res.json({ status: 'success' });
});

app.get('/', (req, res) => res.json({
    service: 'Presensi Nedelcis Server',
    status: isReady ? 'Connected' : 'Disconnected',
    queue_length: taskQueue.length,
    bot_started: !!sock
}));

// ===================== MESIN FINGERPRINT (ZKTeco / Solution, protokol ADMS "push") =====================
// Mesin yang mengirim data ke server ini. Di mesin: Menu > Comm. > Cloud Server Setting
//   Server Address = domain/IP server ini, Port = port HTTP bot (atau port nginx yang meneruskan /iclock/ ke bot)
// Mesin baru otomatis terdaftar "menunggu"; admin mengaktifkannya di halaman Mesin Fingerprint.
const fpSeen = new Map(); // sn -> { at, active }
const rawText = express.text({ type: function() { return true; }, limit: '5mb' });
async function fpDevice(sn, ip) {
    const c = fpSeen.get(sn);
    if (c && Date.now() - c.at < 30000) return c.active;
    let active = false;
    try {
        const r = await supabase.from('fingerprint_devices').select('is_active').eq('serial_number', sn).maybeSingle();
        if (r.error) throw r.error;
        if (!r.data) {
            await supabase.from('fingerprint_devices').insert({ serial_number: sn, name: 'Mesin ' + sn, is_active: false, last_seen_at: new Date().toISOString(), last_ip: ip });
            console.log('[FINGERPRINT] Mesin baru terdeteksi (menunggu aktivasi admin): ' + sn);
        } else {
            active = !!r.data.is_active;
            await supabase.from('fingerprint_devices').update({ last_seen_at: new Date().toISOString(), last_ip: ip }).eq('serial_number', sn);
        }
    } catch (e) { console.error('[FINGERPRINT] cek mesin gagal:', e.message); throw e; }
    fpSeen.set(sn, { at: Date.now(), active: active });
    return active;
}
function fpSn(req) { return String(req.query.SN || req.query.sn || '').trim().slice(0, 64); }
function fpIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim().slice(0, 64); }

// Jabat tangan awal + konfigurasi
app.get('/iclock/cdata', async (req, res) => {
    try {
        const sn = fpSn(req);
        if (!sn) return res.status(400).send('ERROR: SN required');
        await fpDevice(sn, fpIp(req));
        res.type('text/plain').send([
            'GET OPTION FROM: ' + sn, 'ErrorDelay=60', 'Delay=10', 'TransTimes=00:00;12:00', 'TransInterval=1',
            'TransFlag=TransData AttLog', 'TimeZone=7', 'Realtime=1', 'Encrypt=0'
        ].join('\n') + '\n');
    } catch (e) { res.status(500).send('ERROR'); }
});
// Detak jantung mesin + pengiriman perintah dari antrean (fingerprint_commands), mis. DATA UPDATE USERINFO
app.get('/iclock/getrequest', async (req, res) => {
    try {
        const sn = fpSn(req);
        if (!sn) return res.type('text/plain').send('OK');
        const active = await fpDevice(sn, fpIp(req));
        if (!active) return res.type('text/plain').send('OK');
        const q = await supabase.from('fingerprint_commands').select('id, command').eq('device_sn', sn).eq('status', 'pending').order('id').limit(20);
        if (q.error || !q.data || !q.data.length) return res.type('text/plain').send('OK');
        // Perintah rekam (ENROLL_*) membuka layar rekam di mesin: dikirim SATU per satu, dan tidak ditumpuk
        // sebelum rekam sebelumnya selesai (atau kedaluwarsa 3 menit), agar mesin tidak macet.
        const isEnroll = function(c) { return /^ENROLL_/i.test(c.command); };
        let batch = [];
        if (isEnroll(q.data[0])) {
            const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
            const busy = await supabase.from('fingerprint_commands').select('id').eq('device_sn', sn).eq('status', 'sent').like('command', 'ENROLL_%').gte('sent_at', since).limit(1);
            if (busy.data && busy.data.length) return res.type('text/plain').send('OK');
            batch = [q.data[0]];
        } else {
            for (const c of q.data) { if (isEnroll(c)) break; batch.push(c); }
        }
        const ids = batch.map(function(c) { return c.id; });
        await supabase.from('fingerprint_commands').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', ids);
        console.log('[FINGERPRINT] ' + sn + ': mengirim ' + ids.length + ' perintah');
        res.type('text/plain').send(batch.map(function(c) { return 'C:' + c.id + ':' + c.command; }).join('\n') + '\n');
    } catch (e) { res.status(500).send('ERROR'); }
});
// Hasil perintah dari mesin: baris "ID=12&Return=0&CMD=DATA" (Return=0 berarti sukses)
app.post('/iclock/devicecmd', rawText, async (req, res) => {
    try {
        const sn = fpSn(req);
        const lines = String(req.body || '').split(/\r?\n/);
        for (const line of lines) {
            const m = line.match(/(?:^|&)ID=(\d+)/);
            if (!m) continue;
            const rc = line.match(/(?:^|&)Return=(-?\d+)/);
            const code = rc ? parseInt(rc[1], 10) : 0;
            await supabase.from('fingerprint_commands').update({
                status: code === 0 ? 'done' : 'failed', return_code: code, done_at: new Date().toISOString()
            }).eq('id', parseInt(m[1], 10)).eq('device_sn', sn);
        }
        res.type('text/plain').send('OK');
    } catch (e) { console.error('[FINGERPRINT devicecmd]:', e.message); res.type('text/plain').send('OK'); }
});
app.get('/iclock/ping', (req, res) => res.type('text/plain').send('OK'));
// Terima log absen: tiap baris "PIN \t YYYY-MM-DD HH:MM:SS \t Status \t Verify \t ..."
app.post('/iclock/cdata', rawText, async (req, res) => {
    try {
        const sn = fpSn(req);
        if (!sn) return res.status(400).send('ERROR: SN required');
        const active = await fpDevice(sn, fpIp(req));
        const table = String(req.query.table || '').toUpperCase();
        if (table !== 'ATTLOG') return res.type('text/plain').send('OK'); // OPERLOG / USER dll: diabaikan
        // Mesin belum diaktifkan: balas error agar mesin menyimpan & mengirim ulang nanti (data tidak hilang)
        if (!active) return res.status(403).type('text/plain').send('ERROR: device not activated');
        const lines = String(req.body || '').split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
        let n = 0;
        for (const line of lines) {
            const f = line.split('\t');
            const pin = String(f[0] || '').trim();
            const m = String(f[1] || '').trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
            if (!pin || !m) continue;
            const at = new Date(m[1] + 'T' + m[2] + '+07:00'); // jam mesin = WIB
            if (isNaN(at.getTime())) continue;
            const r = await supabase.rpc('fp_process_punch', {
                p_sn: sn, p_pin: pin, p_punched_at: at.toISOString(),
                p_verify: Number.isNaN(parseInt(f[3], 10)) ? null : parseInt(f[3], 10), p_state: Number.isNaN(parseInt(f[2], 10)) ? null : parseInt(f[2], 10)
            });
            if (r.error) throw r.error; // kegagalan -> mesin mengirim ulang (aman, proses idempoten)
            n++;
            if (r.data && r.data.result) notifyPunch(sn, pin, at, r.data.result).catch((e) => console.error('[PUSH]', e && e.message));
        }
        if (n) console.log('[FINGERPRINT] ' + sn + ': ' + n + ' log diproses');
        res.type('text/plain').send('OK: ' + n);
    } catch (e) { console.error('[FINGERPRINT ERROR]:', e.message); res.status(500).type('text/plain').send('ERROR'); }
});
// Admin: aktifkan/nonaktifkan mesin menghapus cache agar langsung berlaku
app.post('/admin/fingerprint/reload', requireAdmin, (req, res) => { fpSeen.clear(); res.json({ status: 'success' }); });

// ===================== AUTO BACKUP KE GOOGLE DRIVE =====================
// Database (pg_dump -> .sql.gz) dan isi tiap bucket Storage (.tar.gz) diunggah ke Google Drive sesuai jadwal di tabel backup_settings.
// Akses Drive lewat OAuth (scope drive.file: bot hanya dapat mengakses berkas/folder yang dibuatnya sendiri).
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (opsional), BACKUP_DB_COMMAND / BACKUP_DATABASE_URL / BACKUP_DB_CONTAINER (opsional).
const { spawn } = require('child_process');
const os = require('os');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://pusaka.smpn8ciamis.sch.id/wa-api/backup/oauth/callback';
const GDRIVE_TOKEN_FILE = process.env.GDRIVE_TOKEN_FILE || path.join(__dirname, 'gdrive-token.json');
const APP_BACKUP_PAGE = process.env.APP_BACKUP_PAGE_URL || 'https://pusaka.smpn8ciamis.sch.id/database-backup';
const DEFAULT_BACKUP_SETTINGS = { enabled: false, schedule_time: '02:00', days: [1, 2, 3, 4, 5, 6, 7], include_db: true, include_storage: true, keep_count: 7, drive_folder_id: null, last_run_date: null };

let backupRunning = false;
let gAccess = { token: '', exp: 0 };
const oauthStates = new Map(); // state -> kedaluwarsa (ms)

function readGdriveToken() { try { return JSON.parse(fs.readFileSync(GDRIVE_TOKEN_FILE, 'utf8')); } catch (e) { return null; } }
function writeGdriveToken(obj) { fs.writeFileSync(GDRIVE_TOKEN_FILE, JSON.stringify(obj), { mode: 0o600 }); try { fs.chmodSync(GDRIVE_TOKEN_FILE, 0o600); } catch (e) { /* abaikan */ } }
function escHtml(t) { return String(t).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

async function gdriveAccessToken() {
    if (gAccess.token && Date.now() < gAccess.exp - 60000) return gAccess.token;
    const t = readGdriveToken();
    if (!t || !t.refresh_token) throw new Error('Google Drive belum dihubungkan.');
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diset di server.');
    const body = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: t.refresh_token, grant_type: 'refresh_token' });
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body });
    const j = await r.json().catch(function() { return {}; });
    if (!r.ok) throw new Error('Gagal memperbarui token Google: ' + (j.error_description || j.error || r.status) + (j.error === 'invalid_grant' ? ' (hubungkan ulang Google Drive; pastikan aplikasi OAuth berstatus "In production")' : ''));
    gAccess = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
    return gAccess.token;
}
async function gfetch(url, init) {
    const token = await gdriveAccessToken();
    const i = init || {};
    return fetch(url, Object.assign({}, i, { headers: Object.assign({ Authorization: 'Bearer ' + token }, i.headers || {}) }));
}
async function gjson(url, init) {
    const r = await gfetch(url, init);
    const j = await r.json().catch(function() { return {}; });
    if (!r.ok) throw new Error('Google Drive: ' + ((j.error && (j.error.message || j.error)) || r.status));
    return j;
}
async function loadBackupSettings() {
    const r = await supabase.from('backup_settings').select('*').eq('id', 1).maybeSingle();
    if (r.error) throw r.error;
    const v = Object.assign({}, DEFAULT_BACKUP_SETTINGS, r.data || {});
    v.days = Array.isArray(v.days) ? v.days.map(Number) : DEFAULT_BACKUP_SETTINGS.days;
    return v;
}
// Folder induk di Drive: dibuat otomatis oleh bot ("Pusaka Backup") dan id-nya disimpan di backup_settings.
async function gdriveEnsureFolder(cfg) {
    if (cfg.drive_folder_id) {
        try {
            const f = await gjson('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(cfg.drive_folder_id) + '?fields=id,trashed');
            if (f && f.id && !f.trashed) return f.id;
        } catch (e) { /* folder hilang/dihapus: buat baru */ }
    }
    const f = await gjson('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Pusaka Backup', mimeType: 'application/vnd.google-apps.folder' })
    });
    await supabase.from('backup_settings').upsert({ id: 1, drive_folder_id: f.id });
    return f.id;
}
// Unggah resumable per potongan 8 MiB (aman untuk berkas besar, ulang otomatis bila gagal sementara)
async function gdriveUpload(filePath, name, parentId) {
    const size = fs.statSync(filePath).size;
    const init = await gfetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(size) },
        body: JSON.stringify({ name: name, parents: [parentId] })
    });
    if (!init.ok) { const t = await init.text().catch(function() { return ''; }); throw new Error('Google Drive menolak unggahan (' + init.status + '): ' + t.slice(0, 200)); }
    const session = init.headers.get('location');
    if (!session) throw new Error('Google Drive tidak memberi alamat unggahan.');
    if (size === 0) {
        const r0 = await fetch(session, { method: 'PUT', headers: { 'Content-Length': '0' } });
        if (!r0.ok) throw new Error('Unggah berkas kosong gagal (' + r0.status + ')');
        return await r0.json();
    }
    const CHUNK = 8 * 1024 * 1024;
    const fd = fs.openSync(filePath, 'r');
    try {
        let start = 0;
        while (start < size) {
            const len = Math.min(CHUNK, size - start);
            const buf = Buffer.alloc(len);
            fs.readSync(fd, buf, 0, len, start);
            let res = null, lastErr = null;
            for (let attempt = 1; attempt <= 4; attempt++) {
                try {
                    res = await fetch(session, { method: 'PUT', headers: { 'Content-Length': String(len), 'Content-Range': 'bytes ' + start + '-' + (start + len - 1) + '/' + size }, body: buf });
                    if (res.status === 308 || res.status === 200 || res.status === 201) { lastErr = null; break; }
                    lastErr = new Error('HTTP ' + res.status);
                    if (res.status < 500 && res.status !== 429) break;
                } catch (e) { lastErr = e; }
                await new Promise(function(r) { setTimeout(r, attempt * 2000); });
            }
            if (lastErr || !res) throw new Error('Unggah terhenti pada ' + Math.round(start / 1048576) + ' MB: ' + (lastErr ? lastErr.message : 'tanpa respons'));
            start += len;
            if (res.status === 200 || res.status === 201) return await res.json();
        }
        throw new Error('Unggah selesai tetapi Google Drive tidak mengonfirmasi berkas.');
    } finally { fs.closeSync(fd); }
}
// Simpan hanya N backup terakhir untuk tiap awalan nama berkas (yang lebih lama dihapus)
async function gdriveCleanup(folderId, prefix, keep) {
    const q = "'" + folderId + "' in parents and trashed=false and name contains '" + prefix.replace(/'/g, "\\'") + "'";
    const j = await gjson('https://www.googleapis.com/drive/v3/files?pageSize=200&orderBy=createdTime%20desc&fields=files(id,name,createdTime)&q=' + encodeURIComponent(q));
    const files = (j.files || []).filter(function(f) { return String(f.name).startsWith(prefix); });
    let deleted = 0;
    for (const f of files.slice(keep)) {
        const r = await gfetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(f.id), { method: 'DELETE' });
        if (r.ok || r.status === 204) deleted++;
    }
    return deleted;
}

function dbDumpCommand() {
    if (process.env.BACKUP_DB_COMMAND) return process.env.BACKUP_DB_COMMAND;                       // perintah bebas, hasil SQL lewat stdout
    if (process.env.BACKUP_DATABASE_URL) return 'pg_dump --no-owner --no-privileges "$BACKUP_DATABASE_URL"';
    return 'docker exec ' + (process.env.BACKUP_DB_CONTAINER || 'supabase-db') + ' pg_dump -U postgres -d postgres --no-owner --no-privileges';
}
async function dumpDatabase(dir, stamp) {
    const out = path.join(dir, 'pusaka-db-' + stamp + '.sql.gz');
    await new Promise(function(resolve, reject) {
        const child = spawn('sh', ['-c', dbDumpCommand()], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let err = '';
        child.stderr.on('data', function(d) { if (err.length < 800) err += d.toString(); });
        const gz = zlib.createGzip();
        const ws = fs.createWriteStream(out);
        const done = pipeline(child.stdout, gz, ws);
        const exited = new Promise(function(res) { child.on('close', res); child.on('error', function(e) { err += e.message; res(-1); }); });
        Promise.all([done, exited]).then(function(r) {
            if (r[1] !== 0) return reject(new Error('Perintah dump database gagal (kode ' + r[1] + '): ' + err.trim().slice(0, 300)));
            resolve();
        }).catch(reject);
    });
    if (fs.statSync(out).size < 200) throw new Error('Hasil dump database kosong/terlalu kecil. Periksa BACKUP_DB_COMMAND / nama kontainer database.');
    return out;
}
async function listAllStorageFiles(bucket, prefix, out) {
    for (let offset = 0; ; offset += 1000) {
        const r = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset: offset, sortBy: { column: 'name', order: 'asc' } });
        if (r.error) throw r.error;
        const items = r.data || [];
        for (const it of items) {
            const p = prefix ? prefix + '/' + it.name : it.name;
            if (it.id === null || it.id === undefined) await listAllStorageFiles(bucket, p, out); else out.push(p);
        }
        if (items.length < 1000) break;
    }
}
function runTar(outFile, cwd, dirName) {
    return new Promise(function(resolve, reject) {
        const c = spawn('tar', ['-czf', outFile, '-C', cwd, dirName], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        c.stderr.on('data', function(d) { if (err.length < 500) err += d.toString(); });
        c.on('error', reject);
        c.on('close', function(code) { code === 0 ? resolve() : reject(new Error('tar gagal: ' + err.trim())); });
    });
}
async function archiveBucket(dir, bucket, stamp) {
    const files = [];
    await listAllStorageFiles(bucket, '', files);
    if (files.length === 0) return { empty: true };
    const root = path.join(dir, 'bucket-' + bucket);
    let skipped = 0, next = 0;
    async function worker() {
        while (next < files.length) {
            const f = files[next++];
            try {
                const d = await supabase.storage.from(bucket).download(f);
                if (d.error) throw d.error;
                const target = path.join(root, f);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.writeFileSync(target, Buffer.from(await d.data.arrayBuffer()));
            } catch (e) { skipped++; console.error('[BACKUP] lewati ' + bucket + '/' + f + ': ' + e.message); }
        }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    const out = path.join(dir, 'pusaka-storage-' + bucket + '-' + stamp + '.tar.gz');
    await runTar(out, dir, 'bucket-' + bucket);
    fs.rmSync(root, { recursive: true, force: true });
    return { file: out, count: files.length, skipped: skipped };
}
function fmtMB(n) { return (n / 1048576).toFixed(1) + ' MB'; }

async function runBackup(trigger) {
    if (backupRunning) throw new Error('Backup sedang berjalan.');
    backupRunning = true;
    const startedAt = new Date();
    let runId = null;
    const details = { files: [], errors: [] };
    let status = 'success', message = '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pusaka-backup-'));
    try {
        const ins = await supabase.from('backup_runs').insert({ trigger: trigger, status: 'running', started_at: startedAt.toISOString() }).select('id').single();
        if (ins.data) runId = ins.data.id;
        const cfg = await loadBackupSettings();
        if (!cfg.include_db && !cfg.include_storage) throw new Error('Tidak ada yang dipilih untuk di-backup (database/bucket).');
        const folderId = await gdriveEnsureFolder(cfg);
        const w = wibNow();
        const stamp = w.date + '_' + String(Math.floor(w.minutes / 60)).padStart(2, '0') + String(w.minutes % 60).padStart(2, '0');
        const keep = Math.max(1, Number(cfg.keep_count) || 7);
        const stage = async function(file, prefix, extra) {
            const name = path.basename(file);
            const size = fs.statSync(file).size;
            await gdriveUpload(file, name, folderId);
            fs.rmSync(file, { force: true });
            let deleted = 0;
            try { deleted = await gdriveCleanup(folderId, prefix, keep); } catch (e) { details.errors.push('Pembersihan backup lama gagal: ' + e.message); }
            details.files.push(Object.assign({ name: name, size: size, old_deleted: deleted }, extra || {}));
            console.log('[BACKUP] terunggah: ' + name + ' (' + fmtMB(size) + ')');
        };
        if (cfg.include_db) {
            try { await stage(await dumpDatabase(tmp, stamp), 'pusaka-db-'); }
            catch (e) { details.errors.push('Database: ' + e.message); console.error('[BACKUP] database gagal:', e.message); }
        }
        if (cfg.include_storage) {
            let buckets = [];
            try {
                const b = await supabase.storage.listBuckets();
                if (b.error) throw b.error;
                buckets = (b.data || []).map(function(x) { return x.name; });
            } catch (e) { details.errors.push('Daftar bucket: ' + e.message); }
            for (const bucket of buckets) {
                try {
                    const a = await archiveBucket(tmp, bucket, stamp);
                    if (a.empty) { details.files.push({ name: 'bucket ' + bucket, size: 0, note: 'kosong, dilewati' }); continue; }
                    await stage(a.file, 'pusaka-storage-' + bucket + '-', { files: a.count, skipped: a.skipped });
                    if (a.skipped) details.errors.push('Bucket ' + bucket + ': ' + a.skipped + ' berkas gagal diunduh dan dilewati');
                } catch (e) { details.errors.push('Bucket ' + bucket + ': ' + e.message); console.error('[BACKUP] bucket ' + bucket + ' gagal:', e.message); }
            }
        }
        const uploaded = details.files.filter(function(f) { return f.size > 0; }).length;
        if (uploaded === 0) { status = 'failed'; message = details.errors.join(' | ') || 'Tidak ada berkas yang diunggah.'; }
        else if (details.errors.length) { status = 'partial'; message = details.errors.join(' | '); }
        else message = uploaded + ' berkas terunggah (' + fmtMB(details.files.reduce(function(a, f) { return a + f.size; }, 0)) + ').';
    } catch (e) {
        status = 'failed'; message = e.message; console.error('[BACKUP ERROR]:', e.message);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* abaikan */ }
        if (runId) await supabase.from('backup_runs').update({ status: status, message: message.slice(0, 1500), finished_at: new Date().toISOString(), details: details }).eq('id', runId);
        backupRunning = false;
    }
    return { status: status, message: message };
}
// Pemeriksa jadwal (1 query ringan per menit). Dimulai hanya pada jam terjadwal (toleransi 3 jam), maksimal sekali per hari.
function shouldRunBackup(cfg, now) {
    if (!cfg.enabled) return false;
    if (String(cfg.last_run_date || '').slice(0, 10) === now.date) return false;
    if (cfg.days.indexOf(now.dow) === -1) return false;
    const at = hhmmToMin(cfg.schedule_time || '02:00');
    return now.minutes >= at && now.minutes <= at + 180;
}
async function checkBackupSchedule() {
    try {
        if (backupRunning) return;
        const cfg = await loadBackupSettings();
        const now = wibNow();
        if (!shouldRunBackup(cfg, now)) return;
        await supabase.from('backup_settings').upsert({ id: 1, last_run_date: now.date }); // tandai dulu agar tidak berulang bila gagal
        console.log('[BACKUP] memulai backup terjadwal');
        runBackup('schedule').catch(function(e) { console.error('[BACKUP]', e.message); });
    } catch (e) { console.error('[BACKUP SCHEDULE ERROR]:', e.message); }
}

app.get('/admin/backup/status', requireAdmin, function(req, res) {
    const t = readGdriveToken();
    res.json({ status: 'success', google_configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET), connected: !!(t && t.refresh_token), email: (t && t.email) || null, running: backupRunning, redirect_uri: GOOGLE_REDIRECT_URI });
});
app.post('/admin/backup/auth-url', requireAdmin, function(req, res) {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return res.status(400).json({ status: 'error', message: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET belum diset di server bot.' });
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, Date.now() + 10 * 60 * 1000);
    const params = new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI, response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: state });
    res.json({ status: 'success', url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() });
});
// Tujuan pengalihan dari Google (dibuka di browser admin, tanpa header login): dilindungi parameter state sekali pakai
app.get('/backup/oauth/callback', async function(req, res) {
    const page = function(ok, msg) {
        res.status(ok ? 200 : 400).type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google Drive</title>' +
            '<body style="font-family:system-ui;max-width:480px;margin:15vh auto;padding:0 20px;text-align:center"><h2>' + (ok ? 'Google Drive terhubung' : 'Gagal menghubungkan') + '</h2><p>' + escHtml(msg) + '</p>' +
            '<p><a href="' + escHtml(APP_BACKUP_PAGE) + '">Kembali ke halaman Backup</a></p>' + (ok ? '<script>setTimeout(function(){location.href=' + JSON.stringify(APP_BACKUP_PAGE) + '},2500)</script>' : '') + '</body>');
    };
    try {
        const state = String(req.query.state || '');
        const exp = oauthStates.get(state);
        oauthStates.delete(state);
        if (!exp || exp < Date.now()) return page(false, 'Sesi otorisasi tidak valid atau kedaluwarsa. Ulangi dari halaman Backup.');
        if (req.query.error) return page(false, 'Google: ' + String(req.query.error));
        const code = String(req.query.code || '');
        if (!code) return page(false, 'Kode otorisasi tidak ada.');
        const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ code: code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' }) });
        const j = await r.json().catch(function() { return {}; });
        if (!r.ok) return page(false, 'Google menolak kode: ' + (j.error_description || j.error || r.status));
        if (!j.refresh_token) return page(false, 'Google tidak memberi refresh token. Cabut akses aplikasi di myaccount.google.com/permissions lalu hubungkan ulang.');
        gAccess = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
        let email = null;
        try { const about = await gjson('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'); email = about.user && about.user.emailAddress; } catch (e) { /* tidak wajib */ }
        writeGdriveToken({ refresh_token: j.refresh_token, email: email, connected_at: new Date().toISOString() });
        page(true, email ? 'Akun: ' + email : 'Berhasil.');
    } catch (e) { console.error('[BACKUP OAUTH ERROR]:', e.message); page(false, e.message); }
});
app.post('/admin/backup/disconnect', requireAdmin, function(req, res) {
    try { fs.rmSync(GDRIVE_TOKEN_FILE, { force: true }); } catch (e) { /* abaikan */ }
    gAccess = { token: '', exp: 0 };
    res.json({ status: 'success' });
});
app.post('/admin/backup/run', requireAdmin, function(req, res) {
    if (backupRunning) return res.status(409).json({ status: 'error', message: 'Backup sedang berjalan.' });
    if (!readGdriveToken()) return res.status(400).json({ status: 'error', message: 'Hubungkan Google Drive dulu.' });
    runBackup('manual').catch(function(e) { console.error('[BACKUP]', e.message); });
    res.json({ status: 'success', message: 'Backup dimulai. Hasilnya muncul di riwayat di bawah.' });
});

// ===== Snapshot jumlah siswa akhir bulan (riwayat per rombel/tingkat) =====
// Dijalankan pada hari terakhir tiap bulan pukul 23:50 WIB; RPC bersifat idempotent (menimpa snapshot periode yang sama).
let studentSnapshotDoneDate = '';
async function checkStudentSnapshot() {
    try {
        const now = wibNow();
        if (studentSnapshotDoneDate === now.date || now.minutes < 23 * 60 + 50) return;
        const y = parseInt(now.date.slice(0, 4), 10), m = parseInt(now.date.slice(5, 7), 10), d = parseInt(now.date.slice(8, 10), 10);
        const lastDay = new Date(y, m, 0).getDate();
        if (d !== lastDay) return;
        studentSnapshotDoneDate = now.date;
        const r = await supabase.rpc('capture_all_student_snapshots', { _period: now.date });
        if (r.error) { studentSnapshotDoneDate = ''; console.error('[SNAPSHOT SISWA] gagal:', r.error.message); return; }
        console.log('[SNAPSHOT SISWA] ' + now.date + ': ' + r.data + ' rombel direkam');
    } catch (e) { studentSnapshotDoneDate = ''; console.error('[SNAPSHOT SISWA ERROR]:', e.message); }
}

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
    console.log('Server API berjalan di port ' + PORT);
    startBot();
    setInterval(runTeacherReminders, 60 * 1000);
    setInterval(runSaturdayGreeting, 60 * 1000);
    setInterval(checkBackupSchedule, 60 * 1000);
    setInterval(checkStudentSnapshot, 60 * 1000);
});
