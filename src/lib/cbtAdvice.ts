// Kalimat nasihat yang tampil saat siswa menunggu (jeda acak) di halaman ujian CBT.
export const CBT_ADVICE: string[] = [
  'Tarik napas dalam-dalam dan tenangkan diri. Kamu sudah belajar dengan baik.',
  'Kerjakan dengan jujur. Nilai hasil usaha sendiri jauh lebih berharga.',
  'Berdoalah terlebih dahulu, lalu mulailah dengan hati yang tenang.',
  'Baca setiap soal dengan teliti sebelum menjawab.',
  'Tidak perlu terburu-buru. Kerjakan soal yang mudah lebih dulu.',
  'Percayalah pada kemampuanmu sendiri. Kejujuran adalah kunci keberhasilan.',
  'Menyontek hanya menipu diri sendiri. Jadilah pribadi yang jujur dan bertanggung jawab.',
  'Jika ragu, tenangkan pikiran, baca ulang soalnya, lalu pilih jawaban terbaikmu.',
];

/** Kalimat ke-i (berputar). */
export const adviceAt = (i: number): string => CBT_ADVICE[((i % CBT_ADVICE.length) + CBT_ADVICE.length) % CBT_ADVICE.length];

/** Lebar progres (0–100) untuk hitung mundur: bergerak halus tiap detik; total ≤ 0 = tidak diketahui. */
export function waitPercent(left: number, total: number): number {
  if (!(total > 0)) return 0;
  const done = total - Math.max(0, Math.min(total, left));
  return Math.max(4, Math.min(100, Math.round(((done + 1) / total) * 100)));
}
