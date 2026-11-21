/**
 * Pilihan jawaban (opsi A–E) soal PG boleh berisi gambar. Opsi yang hanya teks tetap disimpan sebagai
 * teks biasa (kompatibel dengan data lama); opsi yang berisi gambar/format disimpan sebagai HTML dari editor.
 */
const RICH_RE = /^\s*<(p|img|ul|ol|h[1-6]|strong|em|u)\b/i;

export const isRichOption = (v: string | null | undefined): boolean => RICH_RE.test(v || '');

export function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
export function unescapeHtml(t: string): string {
  return t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Nilai tersimpan -> isi awal editor (teks biasa dibungkus paragraf dan di-escape). */
export function optionToEditorHtml(v: string | null | undefined): string {
  if (!v) return '';
  return isRichOption(v) ? v : `<p>${escapeHtml(v)}</p>`;
}

/** Isi editor -> nilai yang disimpan: kosong => '', hanya teks => teks biasa, ada gambar/format => HTML. */
export function optionToStorage(html: string | null | undefined): string {
  const h = (html || '').trim();
  if (!h) return '';
  if (/<img\b/i.test(h) || /<(strong|em|u|ul|ol|li|h[1-6]|a)\b/i.test(h)) return h;
  const text = unescapeHtml(h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p[^>]*>/gi, '\n').replace(/<[^>]+>/g, '')).trim();
  if (isRichOption(text)) return h; // teks yang kebetulan berbentuk tag: simpan versi ter-escape agar tidak terbaca sebagai HTML
  return text;
}
