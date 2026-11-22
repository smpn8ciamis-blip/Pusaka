// Alarm pelanggaran CBT: getar + bunyi di perangkat siswa. Dirancang ringan:
//  - satu klip WAV mini (±38 KB) dibuat sekali di memori (tanpa berkas/unduhan tambahan),
//  - tanpa interval/polling; hanya satu timer pendek saat alarm berbunyi,
//  - memakai elemen <audio> (jalur "media"), bukan nada dering/notifikasi, sehingga tetap berbunyi saat HP mode senyap/getar
//    selama volume media tidak 0.
// Batas peramban (tidak bisa dilewati web): volume media 0 tetap hening; iPhone/Safari tidak mendukung getar;
// getar hanya jalan saat halaman terlihat (Chrome menahannya bila aplikasi sedang di latar belakang).

const RATE = 8000;
export const ALARM_SECONDS = 2.4;
/** pola getar (ms): getar-jeda-getar... total ±2,3 detik */
export const VIBRATE_PATTERN = [400, 120, 400, 120, 400, 120, 700];

/** WAV mono 16-bit: dua nada gelombang kotak bergantian (1200 Hz / 800 Hz) tiap 0,2 dtk dengan celah singkat. */
export function buildAlarmWav(seconds = ALARM_SECONDS): Uint8Array {
  const n = Math.round(RATE * seconds);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  const seg = Math.round(RATE * 0.2);
  const gap = Math.round(RATE * 0.02);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / seg);
    const pos = i % seg;
    const freq = k % 2 === 0 ? 1200 : 800;
    let s = Math.sin((2 * Math.PI * freq * i) / RATE) >= 0 ? 1 : -1; // gelombang kotak = nyaring dan menembus
    // celah/penghalus di awal-akhir tiap segmen agar tidak berbunyi "tak" yang menyakitkan
    const edge = Math.min(pos, seg - 1 - pos);
    if (edge < gap) s *= edge / gap;
    v.setInt16(44 + i * 2, Math.round(s * 0.85 * 32767), true);
  }
  return new Uint8Array(buf);
}

let audio: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let lastAt = 0;

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (audio) return audio;
  try {
    const url = URL.createObjectURL(new Blob([buildAlarmWav()], { type: 'audio/wav' }));
    audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = 1;
    return audio;
  } catch { return null; }
}

/**
 * Panggil dari tindakan siswa (klik "Mulai ujian"): membuka izin putar suara untuk alarm berikutnya
 * (kebijakan autoplay peramban, terutama iOS). Senyap dan tanpa efek bila gagal.
 */
export function primeAlarm(): void {
  const a = ensureAudio();
  if (!a) return;
  try {
    a.muted = true;
    const p = a.play();
    const done = () => { try { a.pause(); a.currentTime = 0; } catch { /* abaikan */ } a.muted = false; };
    if (p && typeof p.then === 'function') p.then(done, () => { a.muted = false; });
    else done();
  } catch { a.muted = false; }
}

export function stopAlarm(): void {
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  try { audio?.pause(); if (audio) audio.currentTime = 0; } catch { /* abaikan */ }
  try { navigator.vibrate?.(0); } catch { /* abaikan */ }
}

/** Getar + bunyi. final = pelanggaran terakhir (ujian diakhiri): bunyi dua kali lebih lama. Aman dipanggil berulang. */
export function fireAlarm(final = false): void {
  const now = Date.now();
  if (now - lastAt < 1200) return; // jangan menumpuk bila beberapa pelanggaran datang beruntun
  lastAt = now;
  try { navigator.vibrate?.(final ? [...VIBRATE_PATTERN, 200, ...VIBRATE_PATTERN] : VIBRATE_PATTERN); } catch { /* abaikan */ }
  const a = ensureAudio();
  if (!a) return;
  try {
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    a.muted = false; a.volume = 1; a.loop = final; a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* diblokir peramban: getar tetap jalan */ });
    stopTimer = setTimeout(stopAlarm, final ? ALARM_SECONDS * 2000 : ALARM_SECONDS * 1000 + 100);
  } catch { /* abaikan */ }
}
