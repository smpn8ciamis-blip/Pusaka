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
const SUPABASE_URL = 'https://api.pusaka.smpn8ciamis.sch.id'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3NzQ1ODU1MzgsImV4cCI6MjA4OTk0NTUzOH0.54IUTBkELsSsEpkyzcfsKqZKA4C6xzMECh1WZva5qZA';  
const ADMIN_PHONE = '6281312760936';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket }
});

const app = express();
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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

async function startBot() {
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
            
            console.log(`[⚠️ KONEKSI TERPUTUS] Alasan: ${reason} | Kode: ${statusCode}`);

            // Jangan reconnect jika memang di-logout paksa oleh WhatsApp (401)
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
            
            if (shouldReconnect) {
                console.log('[🔄 RECONNECT] Menghubungkan ulang dalam 5 detik...');
                setTimeout(startBot, 5000);
            } else {
                console.log('[❌ LOGOUT] Sesi kedaluwarsa. Hapus folder baileys_auth dan lakukan /pair ulang.');
                try { fs.rmSync('baileys_auth', { recursive: true, force: true }); } catch (e) {}
            }
        } else if (connection === 'open') {
            isReady = true;
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
        const messageText = `📢 *NOTIFIKASI PRESENSI*\n\nYth. Orang Tua/Wali,\nAnanda *${student_name}* pada *${date || 'Hari ini'}* pukul *${time} WIB* statusnya: *${status}*.\n\n_SMP Negeri 8 Ciamis_`;
        enqueueTask(async () => await sendSafeMessage(targetJid, { text: messageText }));
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

app.get('/pair', async (req, res) => {
    if (isReady) return res.send('<h2 style="color:green;text-align:center;">✓ Bot Sudah Terhubung!</h2>');
    const rawNomor = req.query.nomor;
    if (!rawNomor) return res.send('<h3>Masukkan nomor pada URL: /pair?nomor=628xxx</h3>');
    try {
        const cleanNum = formatToInternational(rawNomor);
        const code = await sock.requestPairingCode(cleanNum);
        res.send(`<h1 style="text-align:center;color:#25D366;">Kode Pairing: ${code}</h1>`);
    } catch (err) { res.status(500).send('Error: ' + err.message); }
});

app.get('/', (req, res) => res.json({ service: 'Presensi Nedelcis', status: isReady ? 'Connected' : 'Disconnected' }));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
    startBot();
});BARU - BYPASS RLS)
// Bot mencari nomor WA sendiri via service role key
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
        const messageText = `📢 *NOTIFIKASI PRESENSI SISWA*\n\n`
            + `Yth. Bapak/Ibu Orang Tua/Wali,\n`
            + `Memberitahukan bahwa ananda:\n`
            + `• Nama: *${student.full_name}*\n`
            + `• Tanggal: *${date || 'Hari ini'}*\n`
            + `• Waktu: *${time || '-'} WIB*\n`
            + `• Status: *${typeText} - ${statusText}*\n\n`
            + `Terima kasih atas perhatiannya.\n_SMP Negeri 8 Ciamis_`;

        enqueueTask(async () => {
            console.log(`[QUEUE WA-ORTU] Mengirim ke ${student.parent_phone} (${student.full_name})...`);
            await sendSafeMessage(targetJid, { text: messageText });
        });

        return res.json({ status: 'success', message: `Notifikasi masuk antrian untuk ${student.full_name} (${student.parent_phone}).` });
    } catch (e) {
        console.error('[NOTIFY-PARENT ERROR]:', e.message);
        return res.status(500).json({ status: 'error', message: e.message });
    }
});

// =====================================================
// ENDPOINT UTILITAS
// =====================================================
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

app.get('/', (req, res) => res.json({
    service: 'Presensi Nedelcis Server',
    status: isReady ? 'Connected' : 'Disconnected',
    queue_length: taskQueue.length
}));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server API berjalan di port ${PORT}`);
    startBot();
});
