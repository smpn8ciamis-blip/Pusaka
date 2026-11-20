// Pembantu cetak PDF administrasi ujian (jsPDF): teks yang selalu muat, gambar di-cache, warna kelas konsisten.

type RGB = { r: number; g: number; b: number; hex: string };

const hexToRgb = (hex: string): RGB => ({
  r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16), hex,
});

/** 12 warna yang mudah dibedakan (terang cukup untuk teks putih di atasnya). */
export const CLASS_PALETTE: RGB[] = [
  '#2563EB', '#16A34A', '#EA580C', '#DB2777', '#7C3AED', '#0D9488',
  '#CA8A04', '#DC2626', '#0891B2', '#65A30D', '#9333EA', '#475569',
].map(hexToRgb);

/** Warna per kelas menurut urutan nama (alami), jadi dua kelas berbeda tidak pernah berbagi warna selama ≤ 12 kelas. */
export function buildClassColorMap(classNames: string[]): Map<string, RGB> {
  const names = Array.from(new Set(classNames)).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  return new Map(names.map((n, i) => [n, CLASS_PALETTE[i % CLASS_PALETTE.length]]));
}

/** Potong teks dengan "…" sampai muat lebar maxW pada ukuran font saat ini. */
export function ellipsize(doc: any, text: string, maxW: number): string {
  const t = String(text ?? '');
  if (doc.getTextWidth(t) <= maxW) return t;
  let s = t;
  while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

/**
 * Atur ukuran font agar `text` muat satu baris selebar maxW: diperkecil bertahap sampai minFs, lalu dipotong dengan "…".
 * Mengembalikan teks yang harus digambar (font sudah diatur).
 */
export function fitText(doc: any, text: string, maxW: number, fontSize: number, minFs = 3): string {
  const t = String(text ?? '');
  let fs = fontSize;
  doc.setFontSize(fs);
  while (fs > minFs && doc.getTextWidth(t) > maxW) { fs -= 0.25; doc.setFontSize(fs); }
  return ellipsize(doc, t, maxW);
}

const DAY_SHORT: Record<string, string> = { senin: 'Sen', selasa: 'Sel', rabu: 'Rab', kamis: 'Kam', jumat: 'Jum', "jum'at": 'Jum', sabtu: 'Sab', minggu: 'Min' };
const MONTH_SHORT: Record<string, string> = {
  januari: 'Jan', februari: 'Feb', maret: 'Mar', april: 'Apr', mei: 'Mei', juni: 'Jun', juli: 'Jul',
  agustus: 'Agu', september: 'Sep', oktober: 'Okt', november: 'Nov', desember: 'Des',
};

/** "Senin" + "23 November 2026" -> "Sen, 23 Nov 2026" (singkat agar muat di tabel kecil). */
export function shortDateLabel(day: string, date: string): string {
  const d = DAY_SHORT[(day || '').trim().toLowerCase()] || (day || '').slice(0, 3);
  const parts = (date || '').trim().split(/\s+/);
  if (parts.length === 3) parts[1] = MONTH_SHORT[parts[1].toLowerCase()] || parts[1].slice(0, 3);
  const dd = parts.join(' ');
  return [d, dd].filter(Boolean).join(', ');
}

/** Pemuat gambar dengan cache per URL (logo, tanda tangan, stempel hanya dimuat sekali). */
export function createImageLoader() {
  const cache = new Map<string, Promise<string | null>>();
  return (url: string | null | undefined, type: 'png' | 'jpeg' = 'png'): Promise<string | null> => {
    if (!url) return Promise.resolve(null);
    const key = `${type}:${url}`;
    if (!cache.has(key)) {
      cache.set(key, new Promise<string | null>((resolve) => {
        try {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width; canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              if (!ctx) return resolve(null);
              if (type === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
              ctx.drawImage(img, 0, 0);
              resolve(canvas.toDataURL(type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.85));
            } catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = url;
        } catch { resolve(null); }
      }));
    }
    return cache.get(key)!;
  };
}
