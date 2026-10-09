const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const express = require('express');
const pino = require('pino');
const fs = require('fs');

// PENTING: Mencegah bot mati mendadak (crash) jika ada error yang tidak tertangkap
process.on('unhandledRejection', (err) => {
    console.error('❌ [CRASH PREVENTION] Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
    console.error('❌ [CRASH PREVENTION] Uncaught Exception:', err);
});

global.WebSocket = WebSocket;

// --- KONFIGURASI SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://api.pusaka.smpn8ciamis.sch.id';
const SUPABASE_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzQ1ODU1MzgsImV4cCI6MjA4OTk0NTUzOH0.54IUTBkELsSsEpkyzcfsKqZKA4C6xzMECh1WZva5qZA';  
// Sebaiknya set lewat env SUPABASE_KEY dan ganti (rotate) key lama yang ada di repo.
const SUPABASE_KEY = process.env.SUPABASE_KEY || SUPABASE_KEY_FALLBACK;
const ADMIN_PHONE = '6281312760936';

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

const regSessions = new Map();
const cooldowns = new Map();
const COOLDOWN_TIME = 5 * 60 * 1000;

const KNOWN_USERS_FILE = '/srv/wa-bot/known_users.json';
let knownUsers = new Set();

if (fs.existsSync(KNOWN_USERS_FILE)) {
    try {
        knownUsers = new Set(JSON.parse(fs.readFileSync(KNOWN_USERS_FILE, 'utf-8')));
    } catch (e) {}
}

function saveKnownUsers() {
    try {
        fs.writeFileSync(KNOWN_USERS_FILE, JSON.stringify(Array.from(knownUsers)));
    } catch (e) {}
}

function formatToInternational(num) {
    let clean = String(num).replace(/\D/g, '');
    if (clean.startsWith('0')) clean = '62' + clean.slice(1);
    return clean;
}

function getSenderPhoneNumber(msg) {
    const candidates = [
        msg.key.remoteJidAlt,
        msg.key.participantAlt,
        msg.key.remoteJid,
        msg.key.participant
    ];

    for (const jid of candidates) {
        if (!jid) continue;
        if (jid.endsWith('@s.whatsapp.net')) {
            let clean = jid.split('@')[0].replace(/\D/g, '');
            if (clean.startsWith('0')) clean = '62' + clean.slice(1);
            if (clean.length >= 10 && clean.length <= 14) return clean;
        }
    }

    for (const jid of candidates) {
        if (!jid) continue;
        let clean = jid.split('@')[0].replace(/\D/g, '');
        if (clean && clean.length < 15) {
            if (clean.startsWith('0')) clean = '62' + clean.slice(1);
            return clean;
        }
    }

    let fallback = (msg.key.remoteJid || '').split('@')[0].replace(/\D/g, '');
    if (fallback.startsWith('0')) fallback = '62' + fallback.slice(1);
    return fallback;
}

function parseInputDate(input) {
    const clean = input.replace(/\D/g, '');
    if (clean.length !== 8) return null;
    const day = clean.slice(0, 2);
    const month = clean.slice(2, 4);
    const year = clean.slice(4, 8);
    return `${year}-${month}-${day}`;
}

// --- TEMPLATE PESAN & PENGATURAN BOT (dikelola admin lewat aplikasi Pusaka) ---
// Placeholder memakai format {{nama_variabel}}. Tabel: wa_message_templates, wa_bot_settings.
const DEFAULT_TEMPLATES = {
    parent_presence: `📢 *NOTIFIKASI PRESENSI SISWA*\n\nYth. Bapak/Ibu Orang Tua/Wali,\nMemberitahukan bahwa ananda:\n• Nama: *{{nama_siswa}}*\n• Tanggal: *{{tanggal}}*\n• Waktu: *{{waktu}} WIB*\n• Status: *{{jenis}} - {{status}}*\n\nTerima kasih atas perhatiannya.\n_SMP Negeri 8 Ciamis_`,
    attendance_batch: `📢 *NOTIFIKASI PRESENSI*\n\nYth. Orang Tua/Wali,\nAnanda *{{nama_siswa}}* pada *{{tanggal}}* pukul *{{waktu}} WIB* statusnya: *{{status}}*.\n\n_SMP Negeri 8 Ciamis_`,
    teacher_first: `⏰ *PENGINGAT JAM PERTAMA MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nHari ini jam pertama mengajar Anda:\n• Kelas: *{{kelas}}*\n• Mapel: *{{mapel}}*\n• Jam: *{{jam}}*\n\nMohon segera masuk kelas, lalu:\n1️⃣ Isi *absensi siswa*\n2️⃣ Isi *jurnal mengajar*\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
    teacher_next: `⏰ *PENGINGAT MENGAJAR*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nSebentar lagi jadwal mengajar Anda:\n• Kelas: *{{kelas}}*\n• Mapel: *{{mapel}}*\n• Jam: *{{jam}}*\n\nMohon masuk kelas tepat waktu dan jangan lupa mengisi *jurnal mengajar* setelah pembelajaran.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`,
    teacher_followup: `📝 *PENGINGAT PENGISIAN*\n\nYth. Bapak/Ibu *{{nama_guru}}*,\nData berikut belum terisi untuk kelas *{{kelas}}* ({{mapel}}, {{jam}}):\n{{belum_terisi}}\n\nMohon segera dilengkapi di aplikasi Pusaka.\n\nTerima kasih.\n_Pusaka - SMP Negeri 8 Ciamis_`
};

const DEFAULT_BOT_SETTINGS = { teacher_reminder_enabled: true, reminder_lead_min: 10, reminder_followup_min: 15 };

const CONFIG_TTL_MS = 30 * 1000;
let templateCache = { at: 0, rows: new Map() };
let settingsCache = { at: 0, value: { ...DEFAULT_BOT_SETTINGS } };

async function loadTemplates() {
    if (Date.now() - templateCache.at < CONFIG_TTL_MS) return templateCache.rows;
    try {
        const { data, error } = await supabase.from('wa_message_templates').select('key, body, is_enabled');
        if (error) throw error;
        templateCache = { at: Date.now(), rows: new Map((data || []).map(r => [r.key, r])) };
    } catch (e) {
        console.error('[TEMPLATE] Gagal memuat template (pakai bawaan):', e.message);
        templateCache.at = Date.now();
    }
    return templateCache.rows;
}

function fillTemplate(body, vars) {
    return String(body).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

// Mengembalikan teks pesan, atau null bila template dinonaktifkan admin
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
        settingsCache = { at: Date.now(), value: { ...DEFAULT_BOT_SETTINGS, ...(data || {}) } };
    } catch (e) {
        console.error('[SETTINGS] Gagal memuat pengaturan (pakai bawaan):', e.message);
        settingsCache.at = Date.now();
    }
    return settingsCache.value;
}

// Status koneksi & pairing (dipakai halaman admin)
const botState = { pairingCode: null, pairingPhone: null, pairingAt: 0, lastDisconnect: null };

// --- MESIN ANTRIAN CERDAS (SMART QUEUE SYSTEM) ---
const taskQueue = [];
let isProcessingQueue = false;

function enqueueTask(taskFn) {
    taskQueue.push(taskFn);
    processQueue();
}

async function processQueue() {
    if (isProcessingQueue || taskQueue.length === 0) return;
    isProcessingQueue = true;

    while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        try {
            await task();
        } catch (err) {
            console.error('[QUEUE ERROR]:', err.message);
        }
        
        const delay = Math.floor(Math.random() * 3000) + 3000;
        await new Promise(r => setTimeout(r, delay));
    }

    isProcessingQueue = false;
}

async function sendSafeMessage(jid, content, options = {}) {
    if (!sock || !isReady) return;
    try {
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, 1500));
        await sock.sendMessage(jid, content, options);
        await sock.sendPresenceUpdate('paused', jid);
    } catch (e) {
        console.error(`[SEND ERROR to ${jid}]:`, e.message);
    }
}

let botStarting = false;
async function startBot() {
    if (botStarting) return;
    botStarting = true;
    setTimeout(() => { botStarting = false; }, 3000);
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`[INFO] Menggunakan Baileys v${version.join('.')} (Terbaru: ${isLatest})`);

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'error' }), // Hanya log error agar terminal tidak penuh
        browser: ["Ubuntu", "Chrome", "22.0.04"],
        keepAliveIntervalMs: 25000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        emitOwnEvents: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            isReady = false;
            const reason = new Error(lastDisconnect?.error || 'Unknown').message;
            const statusCode = lastDisconnect?.error?.output?.statusCode || 0;
            
            botState.lastDisconnect = { reason, statusCode, at: new Date().toISOString() };
            console.log(`[⚠️ KONEKSI TERPUTUS] Alasan: ${reason} | Kode: ${statusCode}`);

            // Jangan reconnect jika memang di-logout paksa oleh WhatsApp (401)
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
            
            if (shouldReconnect) {
                console.log('[🔄 RECONNECT] Menghubungkan ulang dalam 5 detik...');
                setTimeout(startBot, 5000);
            } else {
                console.log('[❌ LOGOUT] Sesi kedaluwarsa. Hapus folder baileys_auth dan lakukan /pair ulang.');
                try { fs.rmSync('baileys_auth', { recursive: true, force: true }); } catch (e) {}
                // Mulai ulang dengan sesi bersih agar admin bisa menautkan lagi dari aplikasi
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            isReady = true;
            botState.pairingCode = null;
            console.log('[✅ SUCCESS] Bot terhubung ke WhatsApp. Siap menerima pesan.');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        // PENTING: Hanya proses pesan REAL-TIME. Abaikan pesan histori lama saat bot baru connect
        // Ini mencegah bot membalas ratusan pesan lama yang bisa memicu blokir WhatsApp
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            if (msg.messageStubType) continue; // Abaikan notifikasi sistem (misal: pesan dihapus)

            const from = msg.key.remoteJid;
            const isGroup = from ? from.endsWith('@g.us') : false;
            const isStatus = from ? from.includes('status@broadcast') : false;

            if (isGroup || isStatus) continue;

            console.log(`[📩 PESAN MASUK] Dari: ${from} | Tipe: ${Object.keys(msg.message)[0]}`);

            // Ekstrak teks dari berbagai jenis bungkus pesan (Disappearing messages, View once, dll)
            let messageContent = msg.message;
            if (messageContent.ephemeralMessage) messageContent = messageContent.ephemeralMessage.message;
            if (messageContent.viewOnceMessage) messageContent = messageContent.viewOnceMessage.message;
            if (messageContent.viewOnceMessageV2) messageContent = messageContent.viewOnceMessageV2.message;
            if (messageContent.viewOnceMessageV2Extension) messageContent = messageContent.viewOnceMessageV2Extension.message;
            if (messageContent.documentWithCaption) messageContent = messageContent.documentWithCaption.message;
            if (messageContent.editedMessage) messageContent = messageContent.editedMessage.message;

            const text = (messageContent.conversation || messageContent.extendedTextMessage?.text || '').trim();
            if (!text) continue;

            const cleanText = text.toLowerCase();
            const senderPhone = getSenderPhoneNumber(msg);

            await sock.readMessages([msg.key]).catch(() => {});

            // --- LOGIKA COMMAND (SAMA SEPERTI SEBELUMNYA) ---
            
            if (cleanText.startsWith('cek ') || cleanText.startsWith('info ')) {
                if (senderPhone !== ADMIN_PHONE) {
                    enqueueTask(() => sendSafeMessage(from, { text: '❌ Anda tidak memiliki akses.' }, { quoted: msg }));
                    continue;
                }
                const targetNisn = cleanText.replace(/^(cek|info)\s+/, '').replace(/\D/g, '');
                if (!targetNisn) {
                    enqueueTask(() => sendSafeMessage(from, { text: '⚠️ Format salah. Gunakan: *cek <NISN>*' }, { quoted: msg }));
                    continue;
                }
                enqueueTask(async () => {
                    try {
                        let { data: student, error } = await supabase.from('students').select('*, classes(name)').eq('nisn', targetNisn).maybeSingle();
                        if (error) throw error;
                        if (!student && targetNisn.length > 0) {
                            const { data: studentNum } = await supabase.from('students').select('*, classes(name)').eq('nisn', parseInt(targetNisn, 10)).maybeSingle();
                            if (studentNum) student = studentNum;
                        }
                        if (!student) {
                            await sendSafeMessage(from, { text: `⚠️ NISN *${targetNisn}* tidak ditemukan.` }, { quoted: msg });
                            return;
                        }
                        const className = student.classes?.name || '-';
                        const parentPhone = student.parent_phone ? `*${student.parent_phone}*` : '_Belum tertaut_';
                        await sendSafeMessage(from, { text: `🔍 *INFORMASI DATA NISN*\n\n• Nama: *${student.full_name}*\n• NISN: *${student.nisn}*\n• Kelas: *${className}*\n• Ortu: *${student.parent_name || '-'}*\n• Tgl Lahir: *${student.birth_date || '-'}*\n• No WA: ${parentPhone}` }, { quoted: msg });
                    } catch (e) {
                        console.error('[DB ERROR]:', e.message);
                        await sendSafeMessage(from, { text: '⚠️ Maaf, database sedang gangguan.' }, { quoted: msg });
                    }
                });
                continue;
            }

            if (cleanText.startsWith('hapus ') || cleanText.startsWith('reset ') || cleanText.startsWith('unreg ')) {
                if (senderPhone !== ADMIN_PHONE) continue;
                const targetNisn = cleanText.replace(/^(hapus|reset|unreg)\s+/, '').replace(/\D/g, '');
                enqueueTask(async () => {
                    try {
                        let { data: student } = await supabase.from('students').select('*, classes(name)').eq('nisn', targetNisn).maybeSingle();
                        if (!student && targetNisn.length > 0) {
                            const { data: studentNum } = await supabase.from('students').select('*, classes(name)').eq('nisn', parseInt(targetNisn, 10)).maybeSingle();
                            if (studentNum) student = studentNum;
                        }
                        if (!student) {
                            await sendSafeMessage(from, { text: `⚠️ NISN *${targetNisn}* tidak ditemukan.` }, { quoted: msg });
                            return;
                        }
                        if (!student.parent_phone) {
                            await sendSafeMessage(from, { text: `ℹ️ NISN *${targetNisn}* belum tertaut.` }, { quoted: msg });
                            return;
                        }
                        await supabase.from('students').update({ parent_phone: null }).eq('nisn', student.nisn);
                        await sendSafeMessage(from, { text: `✅ Tautan berhasil dihapus untuk *${student.full_name}*.` }, { quoted: msg });
                    } catch (e) {
                        console.error('[DB ERROR]:', e.message);
                    }
                });
                continue;
            }

            if (cleanText === 'batal') {
                regSessions.delete(from);
                enqueueTask(() => sendSafeMessage(from, { text: '❌ Pendaftaran dibatalkan.' }, { quoted: msg }));
                continue;
            }

            if (regSessions.has(from)) {
                const session = regSessions.get(from);
                if (session.step === 'WAIT_NISN') {
                    const nisnClean = text.replace(/\D/g, '');
                    enqueueTask(async () => {
                        try {
                            let { data: student } = await supabase.from('students').select('*, classes(name)').eq('nisn', nisnClean).maybeSingle();
                            if (!student && nisnClean.length > 0) {
                                const { data: studentNum } = await supabase.from('students').select('*, classes(name)').eq('nisn', parseInt(nisnClean, 10)).maybeSingle();
                                if (studentNum) student = studentNum;
                            }
                            if (!student) {
                                await sendSafeMessage(from, { text: `⚠️ NISN *${nisnClean}* tidak ditemukan.\nKetik *BATAL*.` }, { quoted: msg });
                                return;
                            }
                            if (student.parent_phone && String(student.parent_phone).trim() !== '') {
                                regSessions.delete(from);
                                await sendSafeMessage(from, { text: `⚠️ NISN *${student.nisn}* sudah tertaut.` }, { quoted: msg });
                                return;
                            }
                            session.step = 'WAIT_DOB';
                            session.nisn = student.nisn;
                            session.full_name = student.full_name;
                            session.parent_name = student.parent_name;
                            session.birth_date = student.birth_date;
                            session.rombel = student.classes?.name || '';

                            await sendSafeMessage(from, { text: `Data ditemukan!\nNama: *${student.full_name}*\nKelas: *${session.rombel}*\n\nMasukkan **Tanggal Lahir** (Format: **DDMMYYYY**):` }, { quoted: msg });
                        } catch (e) { console.error('[DB ERROR]:', e.message); }
                    });
                    continue;
                }

                if (session.step === 'WAIT_DOB') {
                    const formattedInputDate = parseInputDate(text);
                    enqueueTask(async () => {
                        try {
                            if (!formattedInputDate) {
                                await sendSafeMessage(from, { text: '⚠️ Format salah. Gunakan **DDMMYYYY**.' }, { quoted: msg });
                                return;
                            }
                            if (formattedInputDate === session.birth_date) {
                                const realPhone = getSenderPhoneNumber(msg);
                                await supabase.from('students').update({ parent_phone: realPhone }).eq('nisn', session.nisn);
                                knownUsers.add(from);
                                saveKnownUsers();
                                await sendSafeMessage(from, { text: `✅ *BERHASIL!*\nNomor (${realPhone}) tertaut dengan *${session.full_name}*.` }, { quoted: msg });
                                regSessions.delete(from);
                            } else {
                                await sendSafeMessage(from, { text: '❌ Tanggal lahir tidak sesuai. Ketik *BATAL*.' }, { quoted: msg });
                            }
                        } catch (e) { console.error('[DB ERROR]:', e.message); }
                    });
                    continue;
                }
            }

            if (cleanText === 'daftar') {
                regSessions.set(from, { step: 'WAIT_NISN' });
                enqueueTask(() => sendSafeMessage(from, { text: `*PENDAFTARAN PRESENSI NEDELCIS*\n\nSilahkan masukkan **NISN**:\n\n_(Ketik *BATAL* untuk membatalkan)_` }, { quoted: msg }));
                continue;
            }

            const lastMsgTime = cooldowns.get(from) || 0;
            const now = Date.now();
            if (now - lastMsgTime < COOLDOWN_TIME) continue;
            cooldowns.set(from, now);

            if (knownUsers.has(from)) {
                enqueueTask(() => sendSafeMessage(from, { text: 'Kamu sudah terhubung dengan Layanan Presensi Nedelcis' }, { quoted: msg }));
            } else {
                enqueueTask(async () => {
                    await sendSafeMessage(from, { text: `*LAYANAN PRESENSI NEDELCIS*\n\nHalo! Untuk menghubungkan nomor WA, ketik *DAFTAR*.` }, { quoted: msg });
                });
            }
        }
    });
}

// --- ENDPOINT API ---
app.post('/send-attendance', async (req, res) => {
    const { notifications } = req.body; 
    if (!Array.isArray(notifications) || notifications.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Payload invalid.' });
    }
    let enqueuedCount = 0;
    for (const item of notifications) {
        const { phone, student_name, time, status, date } = item;
        if (!phone) continue;
        const targetJid = formatToInternational(phone) + '@s.whatsapp.net';
        enqueueTask(async () => {
            const messageText = await renderMessage('attendance_batch', {
                nama_siswa: student_name, tanggal: date || 'Hari ini', waktu: time, status
            });
            if (messageText) await sendSafeMessage(targetJid, { text: messageText });
        });
        enqueuedCount++;
    }
    return res.json({ status: 'success', message: `${enqueuedCount} antrian masuk.` });
});

app.get('/test-db', async (req, res) => {
    const { nisn } = req.query;
    try {
        if (nisn) {
            const { data, error } = await supabase.from('students').select('*, classes(name)').eq('nisn', nisn);
            return res.json({ query_nisn: nisn, error, data });
        }
        const { data, error } = await supabase.from('students').select('*, classes(name)').limit(3);
        return res.json({ status: '3 Sampel Data', error, sample_data: data });
    } catch (e) { return res.status(500).json({ error: e.message }); }
});

// =====================================================
// /notify-parent : notifikasi presensi ke orang tua (bot mencari nomor WA sendiri via service role, bypass RLS)
// =====================================================
app.post('/notify-parent', async (req, res) => {
    const { student_id, type, status, time, date } = req.body;

    if (!student_id) {
        return res.status(400).json({ status: 'error', message: 'student_id wajib diisi.' });
    }

    try {
        const { data: student, error } = await supabase
            .from('students')
            .select('full_name, parent_phone')
            .eq('id', student_id)
            .maybeSingle();

        if (error) throw error;
        if (!student) return res.status(404).json({ status: 'error', message: 'Siswa tidak ditemukan.' });
        if (!student.parent_phone) return res.json({ status: 'skipped', message: `Nomor WA untuk ${student.full_name} belum tertaut.` });

        const typeText = type === 'check_out' ? 'Pulang' : 'Masuk';
        const statusText = status === 'terlambat' ? 'Terlambat' : 'Hadir';

        const targetJid = formatToInternational(student.parent_phone) + '@s.whatsapp.net';
        enqueueTask(async () => {
            const messageText = await renderMessage('parent_presence', {
                nama_siswa: student.full_name, tanggal: date || 'Hari ini', waktu: time || '-',
                jenis: typeText, status: statusText
            });
            if (!messageText) return;
            console.log(`[QUEUE WA-ORTU] Mengirim ke ${student.parent_phone} (${student.full_name})...`);
            await sendSafeMessage(targetJid, { text: messageText });
        });

        return res.json({ status: 'success', message: `Notifikasi masuk antrian untuk ${student.full_name} (${student.parent_phone}).` });
    } catch (e) {
        console.error('[NOTIFY-PARENT ERROR]:', e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/pair', async (req, res) => {
    if (isReady) return res.send('<h2 style="color:green;text-align:center;">✓ Bot Sudah Terhubung!</h2>');
    const rawNomor = req.query.nomor;
    if (!rawNomor) return res.send('<h3>Masukkan nomor: /pair?nomor=628xxx</h3>');
    try {
        const cleanNum = formatToInternational(rawNomor);
        const code = await sock.requestPairingCode(cleanNum);
        res.send(`<h1 style="text-align:center;color:#25D366;">Kode Pairing: ${code}</h1>`);
    } catch (err) { res.status(500).send('Error: ' + err.message); }
});

// =====================================================
// REMINDER WA GURU (jadwal mengajar, absensi & jurnal)
// =====================================================
// Env opsional: REMINDER_SENT_FILE
// Pengaturan (aktif/nonaktif, menit) diatur admin di aplikasi: tabel wa_bot_settings
const REMINDER_SENT_FILE = process.env.REMINDER_SENT_FILE || '/srv/wa-bot/reminders_sent.json';

let reminderSent = new Set();
let reminderSentDate = '';

function wibNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
    }).formatToParts(new Date());
    const g = (t) => parts.find(p => p.type === t).value;
    const dowMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    return {
        date: `${g('year')}-${g('month')}-${g('day')}`,
        minutes: parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10),
        dow: dowMap[g('weekday')]
    };
}

function hhmmToMin(t) {
    const [h, m] = String(t).split(':');
    return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function loadReminderState(date) {
    reminderSentDate = date;
    reminderSent = new Set();
    try {
        if (fs.existsSync(REMINDER_SENT_FILE)) {
            const d = JSON.parse(fs.readFileSync(REMINDER_SENT_FILE, 'utf-8'));
            if (d.date === date) reminderSent = new Set(d.keys || []);
        }
    } catch (e) {}
}

function markReminderSent(key) {
    reminderSent.add(key);
    try {
        fs.writeFileSync(REMINDER_SENT_FILE, JSON.stringify({ date: reminderSentDate, keys: Array.from(reminderSent) }));
    } catch (e) {}
}

let reminderRunning = false;
async function runTeacherReminders() {
    if (!isReady || reminderRunning) return;
    reminderRunning = true;
    try {
        const cfg = await getBotSettings();
        if (!cfg.teacher_reminder_enabled) return;
        const REMINDER_LEAD_MIN = cfg.reminder_lead_min;
        const REMINDER_FOLLOWUP_MIN = cfg.reminder_followup_min;
        const now = wibNow();
        if (reminderSentDate !== now.date) loadReminderState(now.date);
        if (now.dow > 6) return; // Minggu libur

        // Tahun ajaran & semester aktif
        const { data: st } = await supabase.from('school_settings')
            .select('academic_year, active_semester').limit(1).maybeSingle();

        let q = supabase.from('schedules')
            .select('id, teacher_id, class_id, subject, start_time, end_time, academic_year, semester')
            .eq('day_of_week', now.dow);
        if (st && st.academic_year) q = q.eq('academic_year', st.academic_year);
        if (st && st.active_semester) q = q.eq('semester', st.active_semester);
        const { data: schedules, error } = await q;
        if (error) throw error;
        if (!schedules || schedules.length === 0) return;

        // Hanya proses jadwal yang relevan pada menit ini (pengingat awal / tindak lanjut)
        const relevant = schedules.filter(s => {
            const start = hhmmToMin(s.start_time);
            const remindAt = start - REMINDER_LEAD_MIN;
            const followAt = start + REMINDER_FOLLOWUP_MIN;
            return (now.minutes >= remindAt && now.minutes < start + 5) ||
                   (now.minutes >= followAt && now.minutes < hhmmToMin(s.end_time));
        });
        if (relevant.length === 0) return;

        const teacherIds = [...new Set(schedules.map(s => s.teacher_id))];
        const classIds = [...new Set(relevant.map(s => s.class_id))];
        const [{ data: teachers }, { data: classes }] = await Promise.all([
            supabase.from('teachers').select('id, user_id').in('id', teacherIds),
            supabase.from('classes').select('id, name').in('id', classIds)
        ]);
        const userIds = (teachers || []).map(t => t.user_id);
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, phone').in('id', userIds);
        const profById = new Map((profiles || []).map(p => [p.id, p]));
        const teacherById = new Map((teachers || []).map(t => [t.id, profById.get(t.user_id)]));
        const className = new Map((classes || []).map(c => [c.id, c.name]));

        // Jam pertama = jadwal paling awal milik guru pada hari ini
        const firstOfTeacher = new Map();
        for (const s of schedules) {
            const cur = firstOfTeacher.get(s.teacher_id);
            if (!cur || hhmmToMin(s.start_time) < hhmmToMin(cur.start_time)) firstOfTeacher.set(s.teacher_id, s);
        }

        for (const s of relevant) {
            const prof = teacherById.get(s.teacher_id);
            if (!prof || !prof.phone) continue;
            const start = hhmmToMin(s.start_time);
            const isFirst = firstOfTeacher.get(s.teacher_id).id === s.id;
            const jam = `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)} WIB`;
            const kelas = className.get(s.class_id) || '-';
            const jid = formatToInternational(prof.phone) + '@s.whatsapp.net';

            if (now.minutes < start + 5) {
                const key = `pre:${s.id}`;
                if (reminderSent.has(key)) continue;
                markReminderSent(key);
                const tplKey = isFirst ? 'teacher_first' : 'teacher_next';
                const vars = { nama_guru: prof.full_name, kelas, mapel: s.subject, jam };
                enqueueTask(async () => {
                    const text = await renderMessage(tplKey, vars);
                    if (!text) return;
                    console.log(`[REMINDER] ${prof.full_name} - ${kelas} ${jam}`);
                    await sendSafeMessage(jid, { text });
                });
            } else {
                // Tindak lanjut: jurnal (dan absensi jam pertama) belum terisi
                const key = `post:${s.id}`;
                if (reminderSent.has(key)) continue;
                const { data: jr } = await supabase.from('teaching_journals')
                    .select('id').eq('schedule_id', s.id).eq('date', now.date).limit(1);
                const journalDone = jr && jr.length > 0;
                let attDone = true;
                if (isFirst) {
                    const { data: at } = await supabase.from('attendance')
                        .select('id').eq('schedule_id', s.id).eq('date', now.date).limit(1);
                    attDone = at && at.length > 0;
                }
                markReminderSent(key);
                if (journalDone && attDone) continue;
                const todo = [];
                if (!attDone) todo.push('*absensi siswa*');
                if (!journalDone) todo.push('*jurnal mengajar*');
                const vars = { nama_guru: prof.full_name, kelas, mapel: s.subject, jam, belum_terisi: todo.map(t => '• ' + t).join('\n') };
                enqueueTask(async () => {
                    const text = await renderMessage('teacher_followup', vars);
                    if (!text) return;
                    console.log(`[REMINDER-LANJUT] ${prof.full_name} - ${kelas}`);
                    await sendSafeMessage(jid, { text });
                });
            }
        }
    } catch (e) {
        console.error('[TEACHER REMINDER ERROR]:', e.message);
    } finally {
        reminderRunning = false;
    }
}

app.post('/run-teacher-reminders', async (req, res) => {
    runTeacherReminders();
    res.json({ status: 'started' });
});

// =====================================================
// ENDPOINT ADMIN (dipakai halaman "WhatsApp Bot" di aplikasi Pusaka)
// Otentikasi: header Authorization: Bearer <JWT login Supabase>, harus role admin/super_admin
// =====================================================
// Verifikasi JWT login. Prioritas: SUPABASE_JWT_SECRET (lokal, HS256) -> GoTrue /auth/v1/user
const crypto = require('crypto');
function verifyJwtLocal(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('format token salah');
    const expected = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64url');
    const a = Buffer.from(expected), b = Buffer.from(parts[2]);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('tanda tangan tidak cocok (JWT secret berbeda)');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('token kedaluwarsa');
    if (!payload.sub) throw new Error('token tanpa user');
    return payload.sub;
}

async function resolveUserId(token) {
    if (process.env.SUPABASE_JWT_SECRET) return verifyJwtLocal(token, process.env.SUPABASE_JWT_SECRET);
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` }
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.id) throw new Error(`GoTrue ${r.status}: ${body.msg || body.message || body.error_description || 'ditolak'}`);
    return body.id;
}

async function requireAdmin(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token) return res.status(401).json({ status: 'error', message: 'Token tidak ada.' });
        let userId;
        try {
            userId = await resolveUserId(token);
        } catch (e) {
            console.error('[ADMIN AUTH] Token ditolak:', e.message);
            return res.status(401).json({ status: 'error', message: `Token tidak valid (${e.message}).` });
        }
        const { data: roles, error: rErr } = await supabase.from('user_roles').select('role').eq('user_id', userId);
        if (rErr) throw rErr;
        if (!(roles || []).some(r => r.role === 'admin' || r.role === 'super_admin')) {
            return res.status(403).json({ status: 'error', message: 'Hanya admin.' });
        }
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
        const phone = formatToInternational((req.body || {}).phone || '');
        if (phone.length < 10) return res.status(400).json({ status: 'error', message: 'Nomor WhatsApp tidak valid.' });
        if (!sock) startBot();
        await new Promise(r => setTimeout(r, 2500)); // beri waktu soket siap
        if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
            return res.status(400).json({ status: 'error', message: 'Sesi sudah terdaftar. Putuskan tautan lalu coba lagi.' });
        }
        const code = await sock.requestPairingCode(phone);
        botState.pairingCode = code;
        botState.pairingPhone = phone;
        botState.pairingAt = Date.now();
        res.json({ status: 'success', code, phone });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.post('/admin/logout', requireAdmin, async (req, res) => {
    try {
        try { if (sock) await sock.logout(); } catch (e) { /* sesi mungkin sudah putus */ }
        isReady = false;
        botState.pairingCode = null;
        try { fs.rmSync('baileys_auth', { recursive: true, force: true }); } catch (e) {}
        // event 'close' (loggedOut) akan memulai ulang sesi bersih; pastikan tetap berjalan
        setTimeout(() => { if (!isReady) startBot(); }, 4000);
        res.json({ status: 'success', message: 'Tautan WhatsApp diputus.' });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.post('/admin/test-send', requireAdmin, async (req, res) => {
    const { phone, template_key, vars, text } = req.body || {};
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

app.post('/admin/reload-config', requireAdmin, (req, res) => {
    templateCache.at = 0;
    settingsCache.at = 0;
    res.json({ status: 'success' });
});

app.get('/', (req, res) => res.json({
    service: 'Presensi Nedelcis Server',
    status: isReady ? 'Connected' : 'Disconnected',
    queue_length: taskQueue.length
}));

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
    startBot();
    setInterval(runTeacherReminders, 60 * 1000);
});
