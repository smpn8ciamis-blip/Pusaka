// Pernyataan yang diketik siswa (divalidasi di perangkat saja; tidak ada panggilan ke server).
// Tujuan: pernyataan kejujuran sebelum mulai dan konfirmasi sebelum mengirim jawaban. Mengetik juga menyebar waktu
// ratusan siswa yang menekan tombol hampir bersamaan.

export const CBT_PLEDGE_HONEST = 'Saya Mengerjakan Soal Dengan Jujur';
export const CBT_PLEDGE_SUBMIT = 'Saya yakin mengirim jawaban';

/** Samakan huruf besar/kecil, spasi ganda, tanda baca, dan aksen (keyboard HP sering menambah titik/spasi otomatis). */
export function normalizePhrase(s: string): string {
  return (s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const matchesPhrase = (input: string, phrase: string): boolean => normalizePhrase(input) === normalizePhrase(phrase);

/** Properti agar kolom ketik tidak bisa diisi dengan tempel (paste)/seret teks, dan tidak diubah otomatis oleh keyboard. */
export const typedOnlyInputProps = {
  onPaste: (e: { preventDefault: () => void }) => e.preventDefault(),
  onDrop: (e: { preventDefault: () => void }) => e.preventDefault(),
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
} as const;
