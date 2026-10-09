const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const crypto = require('crypto');

process.on('unhandledRejection', (err) => console.error('[CRASH] Unhandled Rejection:', err));
process.on('uncaughtException', (err) => console.error('[CRASH] Uncaught Exception:', err));

global.WebSocket = WebSocket;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api-pusaka.smpn8ciamis.sch.id';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzQ1ODU1MzgsImV4cCI6MjA4OTk0NTUzOH0.54IUTBkELsSsEpkyzcfsKqZKA4C6xzMECh1WZva5qZA';
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
    test_connection: `✅ *TES KONEKSI BERHASIL*\n\nHalo Bapak/Ibu,\n\nNomor WhatsApp ini adalah *Akun Resmi SMP Negeri 8 Ciamis* yang digunakan untuk mengirimkan:\n\n📅 *Notifikasi Jadwal Pelajaran*\n📢 *Notifikasi Presensi Siswa*\n🔔 *Pengingat Mengajar*\n📝 *Pengingat Pengisian Jurnal*\n\n━━━━━━━━━━━━━━━━━━\n\n⚠️ *PENTING:*\nSilakan *SIMPAN NOMOR INI* ke kontak WhatsApp Bapak/Ibu.\n\nJika nomor ini *TIDAK disimpan*, WhatsApp akan memblokir pesan dari nomor yang tidak dikenal, sehingga Bapak/Ibu *tidak akan menerima notifikasi* penting dari sekolah.\n\n━━━━━━━━━━━━━━━━━━\n\nTerima kasih atas perhatiannya.\n_SMP Negeri 8 Ciamis_`
};
const DEFAULT_BOT_SETTINGS = {
    teacher_reminder_enabled: true, reminder_lead_min: 10, reminder_followup_min: 15,
    reminder_scope: 'all',            // 'first' = jam pertama saja, 'all' = semua jam mengajar
    followup_journal: true,           // cek & ingatkan jurnal yang belum terisi
    followup_attendance: true,        // cek & ingatkan daftar hadir yang belum terisi
    daily_recap_enabled: false,       // kirim rekap jadwal harian ke guru
    daily_recap_time: '06:00'         // jam kirim rekap (WIB)
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
                if (senderPhone !== ADMIN_PHONE) { enqueueTask(() => sendSafeMessage(from, { text: 'Anda tidak memiliki akses.' }, { quoted: msg })); continue; }
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
            if (cleanText === 'batal') { regSessions.delete(from); enqueueTask(() => sendSafeMessage(from, { text: 'Pendaftaran dibatalkan.' }, { quoted: msg })); continue; }
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
            if (cleanText === 'daftar') { regSessions.set(from, { step: 'WAIT_NISN' }); enqueueTask(() => sendSafeMessage(from, { text: 'PENDAFTARAN PRESENSI\n\nMasukkan NISN:\n\n(Ketik BATAL untuk batal)' }, { quoted: msg })); continue; }
            const lastMsgTime = cooldowns.get(from) || 0;
            if (Date.now() - lastMsgTime < COOLDOWN_TIME) continue;
            cooldowns.set(from, Date.now());
            if (knownUsers.has(from)) enqueueTask(() => sendSafeMessage(from, { text: 'Kamu sudah terhubung dengan Layanan Presensi Nedelcis' }, { quoted: msg }));
            else enqueueTask(() => sendSafeMessage(from, { text: 'LAYANAN PRESENSI NEDELCIS\n\nHalo! Ketik DAFTAR untuk menghubungkan nomor WA.' }, { quoted: msg }));
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
        let q = supabase.from('schedules').select('id, teacher_id, class_id, subject, start_time, end_time, academic_year, semester').eq('day_of_week', now.dow);
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

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
    console.log('Server API berjalan di port ' + PORT);
    startBot();
    setInterval(runTeacherReminders, 60 * 1000);
});
