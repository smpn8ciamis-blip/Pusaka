// Jeda acak CBT: mencegah ratusan perangkat menghubungi server pada detik yang sama
// (saat mengunduh soal, mengumpulkan jawaban, dan mencoba ulang setelah gagal).

/** Batas jeda (detik). Diubah di sini bila perlu. */
export const CBT_DOWNLOAD_DELAY = { min: 2, max: 45 } as const;       // setelah token dimasukkan, sebelum soal diunduh
export const CBT_DOWNLOAD_RETRY_DELAY = { min: 1, max: 6 } as const;  // sebelum "Coba Lagi" mengunduh soal
export const CBT_SUBMIT_DELAY_MANUAL = { min: 0, max: 10 } as const;  // siswa menekan Selesai / diakhiri pengawas
export const CBT_SUBMIT_DELAY_TIMEOUT = { min: 0, max: 45 } as const; // waktu habis (semua siswa selesai di detik yang sama)

/**
 * Denyut (heartbeat) ujian. PENTING: batas "tidak aktif 3 menit" pada fungsi SQL cbt_finish_or_request
 * (lalu cbt_force_finish) dihitung dari denyut terakhir, jadi bergantung pada interval ini.
 * Interval + jeda acak harus tetap jauh di bawah 3 menit (sekarang 60 dtk + maks 10 dtk = ~70 dtk);
 * bila diperbesar, siswa yang masih online bisa dianggap tidak aktif dan dipaksa selesai.
 */
export const CBT_HEARTBEAT_MS = 60000;
export const CBT_HEARTBEAT_JITTER_MS = 10000;
export const CBT_HEARTBEAT_PAUSED_MS = 15000; // saat dijeda pengawas: cek status lebih sering

/** Bilangan bulat acak antara min dan max (keduanya ikut). */
export function randomDelaySeconds(range: { min: number; max: number }, rand: () => number = Math.random): number {
  const lo = Math.max(0, Math.floor(range.min));
  const hi = Math.max(lo, Math.floor(range.max));
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** Jeda ulang eksponensial (1, 2, 4, 8 dtk, maks 8) dengan variasi acak ±40% agar percobaan ulang tidak serentak. */
export function retryDelayMs(attempt: number, rand: () => number = Math.random): number {
  return Math.round(Math.min(8000, 1000 * 2 ** Math.max(0, attempt)) * (0.6 + rand() * 0.8));
}

/**
 * Menunggu `ms` milidetik sambil memanggil onTick(sisaDetik) setiap sisa detik berubah.
 * Memakai jam dinding (Date.now) sehingga tetap akurat walau tab di latar belakang melambat.
 */
export function waitWithCountdown(ms: number, onTick?: (secondsLeft: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const end = Date.now() + Math.max(0, ms);
    let last = -1;
    const step = () => {
      const left = end - Date.now();
      if (left <= 0) { if (last !== 0) onTick?.(0); resolve(); return; }
      const sec = Math.ceil(left / 1000);
      if (sec !== last) { last = sec; onTick?.(sec); }
      setTimeout(step, Math.min(250, left));
    };
    step();
  });
}
