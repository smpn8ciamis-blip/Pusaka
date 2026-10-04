import QRCode from 'qrcode';

/**
 * Token acak 256-bit (base64url, ~43 char).
 * Tidak dapat di-brute force (2^256 kemungkinan).
 */
export function generateSecureToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * SHA-256 → hex. Yang disimpan di DB hanya hash, bukan token mentah.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Bangun URL verifikasi publik (HTTPS).
 */
export function buildVerificationUrl(rawToken: string): string {
  const base =
    (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base.replace(/\/+$/, '')}/verify/${rawToken}`;
}

/**
 * Tempel QR ke PDF + label kecil di bawahnya.
 */
export async function addVerificationQR(
  doc: any,
  url: string,
  x: number,
  y: number,
  size = 32,
): Promise<void> {
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 512,
    color: { dark: '#000000', light: '#FFFFFF' },
  });
  doc.addImage(dataUrl, 'PNG', x, y, size, size, undefined, 'FAST');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 90);
  doc.text('Scan untuk verifikasi', x + size / 2, y + size + 3, { align: 'center' });
  doc.setTextColor(0, 0, 0);
}