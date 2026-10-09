/** Bersihkan nomor HP: hanya angka (hapus +, -, spasi, titik, tanda kurung, dll). */
export function cleanPhoneNumber(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Nomor valid bila kosong (opsional) atau 9–15 digit. */
export function isValidPhoneNumber(clean: string): boolean {
  return clean === '' || (clean.length >= 9 && clean.length <= 15);
}
