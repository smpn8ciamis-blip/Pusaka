/**
 * Baca soal CBT dari hasil salin (Ctrl+C) dokumen Word: banyak soal sekaligus.
 *
 * Aturan format yang dikenali:
 *  - nomor soal   : "1." / "1)"  (urut 1,2,3…; nomor yang tidak berurutan dianggap isi soal)
 *  - pilihan      : "A." / "A)" / "(A)" sampai E; boleh satu per baris atau berderet dalam satu baris
 *  - kunci jawaban: pilihan yang ditulis dengan HURUF MERAH (font merah atau stabilo merah), atau baris "Kunci: B"
 *  - uraian       : soal tanpa pilihan; kunci uraian = paragraf berwarna merah / baris "Jawaban: …"
 *  - isi yang ikut: gambar, tabel, tebal/miring/garis bawah, pangkat/indeks, simbol (termasuk font Symbol)
 * Kode ini hanya membaca teks; tidak ada pengiriman ke server. Gambar dikembalikan sebagai rujukan (ImageRef)
 * dan diunggah belakangan oleh pemanggil.
 */

export interface ImageRef {
  id: string;
  kind: 'rtf' | 'data' | 'blob' | 'url';
  src: string;
  rtfIndex?: number;
}

export interface ParsedOption { html: string }
export interface ParsedQuestion {
  uid: string;
  number: number | null;
  type: 'multiple_choice' | 'essay';
  questionHtml: string;
  options: ParsedOption[];
  /** indeks pilihan kunci (0 = A) atau null bila belum ditandai */
  correct: number | null;
  essayKey: string;
  warnings: string[];
}
export interface ParseResult {
  questions: ParsedQuestion[];
  images: ImageRef[];
  warnings: string[];
}

// ------------------------------------------------------------------ simbol (font Symbol milik Word)
const SYMBOL_MAP: Record<number, string> = {
  0x41: 'Α', 0x42: 'Β', 0x43: 'Χ', 0x44: 'Δ', 0x45: 'Ε', 0x46: 'Φ', 0x47: 'Γ', 0x48: 'Η', 0x49: 'Ι', 0x4a: 'ϑ', 0x4b: 'Κ', 0x4c: 'Λ', 0x4d: 'Μ',
  0x4e: 'Ν', 0x4f: 'Ο', 0x50: 'Π', 0x51: 'Θ', 0x52: 'Ρ', 0x53: 'Σ', 0x54: 'Τ', 0x55: 'Υ', 0x56: 'ς', 0x57: 'Ω', 0x58: 'Ξ', 0x59: 'Ψ', 0x5a: 'Ζ',
  0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6a: 'ϕ', 0x6b: 'κ', 0x6c: 'λ', 0x6d: 'μ',
  0x6e: 'ν', 0x6f: 'ο', 0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x76: 'ϖ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7a: 'ζ',
  0xa3: '≤', 0xa5: '∞', 0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓', 0xb0: '°', 0xb1: '±', 0xb3: '≥', 0xb4: '×', 0xb5: '∝', 0xb6: '∂',
  0xb7: '•', 0xb8: '÷', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xc7: '∩', 0xc8: '∪', 0xc9: '⊃', 0xca: '⊇', 0xcb: '⊄', 0xcc: '⊂', 0xcd: '⊆', 0xce: '∈', 0xcf: '∉',
  0xd0: '∠', 0xd1: '∇', 0xd5: '∏', 0xd6: '√', 0xd7: '⋅', 0xd8: '¬', 0xd9: '∧', 0xda: '∨', 0xdb: '⇔', 0xdc: '⇐', 0xdd: '⇑', 0xde: '⇒', 0xdf: '⇓',
  0xe5: '∑', 0xf2: '∫', 0xa2: '′', 0xb2: '″', 0xc6: '∅', 0xc5: '⊕', 0xc4: '⊗', 0x22: '∀', 0x24: '∃', 0x27: '∍', 0x2d: '−', 0x40: '≅', 0x5c: '∴',
};

export function mapSymbolText(s: string, forced: boolean): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0xf020 && cp <= 0xf0ff) out += SYMBOL_MAP[cp - 0xf000] ?? '';
    else if (forced && cp < 0x100 && SYMBOL_MAP[cp] !== undefined && (cp > 0x40 || cp === 0x22 || cp === 0x24 || cp === 0x27 || cp === 0x2d || cp === 0x40)) out += SYMBOL_MAP[cp];
    else out += ch;
  }
  return out;
}

// ------------------------------------------------------------------ warna
const NAMED: Record<string, [number, number, number]> = {
  red: [255, 0, 0], darkred: [139, 0, 0], crimson: [220, 20, 60], firebrick: [178, 34, 34], maroon: [128, 0, 0],
};
export function parseColor(v: string | null | undefined): [number, number, number] | null {
  const s = (v || '').trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) return NAMED[s];
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
  const r = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(s);
  if (r) return [+r[1], +r[2], +r[3]];
  return null;
}
/** Merah tegas (FF0000, C00000, DD0000, "red"…), bukan oranye/merah muda/coklat. */
export function isRed(rgb: [number, number, number] | null): boolean {
  if (!rgb) return false;
  const [r, g, b] = rgb;
  return r >= 150 && g <= 90 && b <= 90 && r - Math.max(g, b) >= 100;
}

// ------------------------------------------------------------------ model inline
interface Fmt { red: boolean; b: boolean; i: boolean; u: boolean; sup: boolean; sub: boolean; sym: boolean }
type Item =
  | ({ k: 't'; s: string } & Fmt)
  | { k: 'img'; ref: string; red: false }
  | { k: 'br' };

const NOFMT: Fmt = { red: false, b: false, i: false, u: false, sup: false, sub: false, sym: false };

const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (t: string) => escapeHtml(t).replace(/"/g, '&quot;');

const styleOf = (el: Element): string => (el.getAttribute('style') || '').toLowerCase();
const prop = (st: string, name: string): string | null => {
  const m = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)').exec(st);
  return m ? m[1].trim() : null;
};

function fmtFor(el: Element, base: Fmt): Fmt {
  const f = { ...base };
  const tag = el.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong') f.b = true;
  if (tag === 'i' || tag === 'em') f.i = true;
  if (tag === 'u') f.u = true;
  if (tag === 'sup') f.sup = true;
  if (tag === 'sub') f.sub = true;
  const st = styleOf(el);
  const color = prop(st, 'color') ?? (tag === 'font' ? (el.getAttribute('color') || '').toLowerCase() : null);
  if (color) f.red = isRed(parseColor(color));
  // stabilo/latar merah juga dianggap penanda
  const bg = prop(st, 'background-color') ?? prop(st, 'background');
  const hl = prop(st, 'mso-highlight');
  const bgColor = bg ? (bg.split(/\s+/).map(parseColor).find(Boolean) ?? null) : null;
  if (isRed(bgColor) || (hl && isRed(parseColor(hl)))) f.red = true;
  const fw = prop(st, 'font-weight');
  if (fw && /^(bold|[6-9]00)$/.test(fw)) f.b = true;
  if (fw && /^(normal|[1-4]00)$/.test(fw)) f.b = false;
  const fs = prop(st, 'font-style');
  if (fs === 'italic' || fs === 'oblique') f.i = true;
  const td = prop(st, 'text-decoration') ?? prop(st, 'text-decoration-line');
  if (td && td.includes('underline')) f.u = true;
  const va = prop(st, 'vertical-align');
  if (va === 'super') { f.sup = true; f.sub = false; } else if (va === 'sub') { f.sub = true; f.sup = false; }
  const ff = prop(st, 'font-family') || '';
  if (/^["']?symbol["']?(\s*,|$)/.test(ff.trim()) || /mso-symbol-font-family\s*:\s*["']?symbol/.test(st) && /mso-char-type\s*:\s*symbol/.test(st)) f.sym = true;
  return f;
}

interface Ctx { images: ImageRef[]; rtfCount: number; seq: number; warnings: string[] }

function pushImg(el: Element, ctx: Ctx, out: Item[]) {
  const src = (el.getAttribute('src') || '').trim();
  if (!src) return;
  const id = 'img' + (++ctx.seq);
  if (/^file:/i.test(src)) ctx.images.push({ id, kind: 'rtf', src, rtfIndex: ctx.rtfCount++ });
  else if (/^data:image\//i.test(src)) ctx.images.push({ id, kind: 'data', src });
  else if (/^blob:/i.test(src)) ctx.images.push({ id, kind: 'blob', src });
  else if (/^https:\/\//i.test(src)) ctx.images.push({ id, kind: 'url', src });
  else { ctx.warnings.push('Ada gambar yang tidak bisa dibaca dan dilewati.'); return; }
  out.push({ k: 'img', ref: id, red: false });
}

const SKIP_TAGS = new Set(['script', 'style', 'head', 'meta', 'link', 'title', 'xml', 'o:p', 'object', 'iframe', 'svg', 'canvas', 'v:shapetype']);
const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'table', 'blockquote', 'pre', 'tr', 'td', 'th', 'tbody', 'thead', 'section', 'article', 'center']);

function walkInline(node: Node, f: Fmt, ctx: Ctx, out: Item[]) {
  if (node.nodeType === 3) {
    let t = (node.nodeValue || '').replace(/[\s ]+/g, ' ');
    if (!t) return;
    t = mapSymbolText(t, f.sym);
    if (t) out.push({ k: 't', s: t, ...f });
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return;
  const st = styleOf(el);
  if (/display\s*:\s*none/.test(st) || /mso-hide\s*:\s*all/.test(st)) return;
  if (tag === 'br') { out.push({ k: 'br' }); return; }
  if (tag === 'img') { pushImg(el, ctx, out); return; }
  const nf = fmtFor(el, f);
  el.childNodes.forEach((c) => walkInline(c, nf, ctx, out));
}

// ------------------------------------------------------------------ blok
type Block =
  | { type: 'p'; items: Item[]; text: string }
  | { type: 'table'; html: string };

const IMG_CH = '￼';
const itemsText = (items: Item[]): string => items.map((i) => (i.k === 't' ? i.s : i.k === 'img' ? IMG_CH : ' ')).join('');

function trimItems(items: Item[]): Item[] {
  const a = items.slice();
  while (a.length && (a[0].k === 'br' || (a[0].k === 't' && !a[0].s.trim()))) a.shift();
  while (a.length && (a[a.length - 1].k === 'br' || (a[a.length - 1].k === 't' && !(a[a.length - 1] as any).s.trim()))) a.pop();
  if (a.length && a[0].k === 't') a[0] = { ...(a[0] as any), s: (a[0] as any).s.replace(/^\s+/, '') };
  const l = a.length - 1;
  if (l >= 0 && a[l].k === 't') a[l] = { ...(a[l] as any), s: (a[l] as any).s.replace(/\s+$/, '') };
  return a;
}

/** Pecah item di <br> menjadi baris terpisah (pilihan sering diketik dengan Shift+Enter). */
function splitLines(items: Item[]): Item[][] {
  const lines: Item[][] = [[]];
  for (const it of items) { if (it.k === 'br') lines.push([]); else lines[lines.length - 1].push(it); }
  return lines.map(trimItems).filter((l) => l.length);
}

function pushParagraphs(items: Item[], blocks: Block[]) {
  for (const line of splitLines(items)) blocks.push({ type: 'p', items: line, text: itemsText(line) });
}

const alphaMarker = (n: number, upper: boolean, t: string): string => {
  const a = String.fromCharCode((upper ? 65 : 97) + ((n - 1) % 26));
  return t === 'a' || t === 'A' ? a + '.' : n + '.';
};

function walkBlocks(parent: Node, ctx: Ctx, blocks: Block[], list?: { ordered: boolean; n: number; type: string }) {
  let inline: Item[] = [];
  const flush = () => { if (inline.length) { pushParagraphs(inline, blocks); inline = []; } };
  parent.childNodes.forEach((child) => {
    if (child.nodeType === 3) { walkInline(child, NOFMT, ctx, inline); return; }
    if (child.nodeType !== 1) return;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    const st = styleOf(el);
    if (/display\s*:\s*none/.test(st) || /mso-hide\s*:\s*all/.test(st)) return;
    if (tag === 'table') { flush(); const html = tableHtml(el, ctx); if (html) blocks.push({ type: 'table', html }); return; }
    if (tag === 'ul' || tag === 'ol') {
      flush();
      const start = parseInt(el.getAttribute('start') || '1', 10) || 1;
      const state = { ordered: tag === 'ol', n: start - 1, type: el.getAttribute('type') || prop(st, 'list-style-type') || '1' };
      walkBlocks(el, ctx, blocks, state);
      return;
    }
    if (tag === 'li') {
      flush();
      if (list) list.n++;
      const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) && !/^(p|div)$/.test(c.tagName.toLowerCase()));
      const items: Item[] = [];
      if (list?.ordered) {
        const type = /alpha/.test(list.type) ? (/upper/.test(list.type) ? 'A' : 'a') : list.type;
        items.push({ k: 't', s: alphaMarker(list.n, type === 'A', type) + ' ', ...NOFMT });
      }
      if (hasBlockChild) {
        pushParagraphs(items, blocks);
        walkBlocks(el, ctx, blocks);
      } else {
        el.childNodes.forEach((c) => walkInline(c, fmtFor(el, NOFMT), ctx, items));
        pushParagraphs(items, blocks);
      }
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      flush();
      const hasBlockChild = Array.from(el.children).some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));
      if (hasBlockChild) walkBlocks(el, ctx, blocks);
      else {
        const items: Item[] = [];
        el.childNodes.forEach((c) => walkInline(c, fmtFor(el, NOFMT), ctx, items));
        pushParagraphs(items, blocks);
      }
      return;
    }
    walkInline(el, NOFMT, ctx, inline); // elemen inline di tingkat blok
  });
  flush();
}

// ------------------------------------------------------------------ tampilan HTML
function wrap(it: Item & { k: 't' }, inner: string): string {
  let h = inner;
  if (it.sub) h = `<sub>${h}</sub>`;
  if (it.sup) h = `<sup>${h}</sup>`;
  if (it.u) h = `<u>${h}</u>`;
  if (it.i) h = `<em>${h}</em>`;
  if (it.b) h = `<strong>${h}</strong>`;
  return h;
}
const fmtKey = (i: Item) => (i.k === 't' ? `${+i.b}${+i.i}${+i.u}${+i.sup}${+i.sub}` : 'x');

export function itemsToHtml(items: Item[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.k === 'img') { parts.push(`<img data-ref="${it.ref}">`); i++; continue; }
    if (it.k === 'br') { parts.push('<br>'); i++; continue; }
    let s = it.s; let j = i + 1;
    while (j < items.length && items[j].k === 't' && fmtKey(items[j]) === fmtKey(it)) { s += (items[j] as any).s; j++; }
    parts.push(wrap(it, escapeHtml(s)));
    i = j;
  }
  return parts.join('');
}

function tableHtml(table: Element, ctx: Ctx): string {
  const rows: string[] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    if (tr.closest('table') !== table) return; // tabel bersarang dilewati
    const cells: string[] = [];
    Array.from(tr.children).forEach((td) => {
      const t = td.tagName.toLowerCase();
      if (t !== 'td' && t !== 'th') return;
      const items: Item[] = [];
      td.childNodes.forEach((c) => {
        if (c.nodeType === 1 && /^(p|div|li|h[1-6])$/i.test((c as Element).tagName)) {
          const line: Item[] = [];
          (c as Element).childNodes.forEach((x) => walkInline(x, fmtFor(c as Element, NOFMT), ctx, line));
          const tl = trimItems(line);
          if (tl.length) { if (items.length) items.push({ k: 'br' }); items.push(...tl); }
        } else walkInline(c, NOFMT, ctx, items);
      });
      const cs = parseInt(td.getAttribute('colspan') || '1', 10);
      const rs = parseInt(td.getAttribute('rowspan') || '1', 10);
      const attrs = (cs > 1 ? ` colspan="${cs}"` : '') + (rs > 1 ? ` rowspan="${rs}"` : '');
      cells.push(`<td${attrs}>${itemsToHtml(trimItems(items))}</td>`);
    });
    if (cells.length) rows.push(`<tr>${cells.join('')}</tr>`);
  });
  return rows.length ? `<table><tbody>${rows.join('')}</tbody></table>` : '';
}

// ------------------------------------------------------------------ penanda soal / pilihan / kunci
const QRE = /^\s*(\d{1,3})\s*[.)](?!\d)\s*/;
const OPT_RE = /^\s*\(?([A-Ea-e])\s*[.)]\s*/;
const KEY_RE = /^\s*(?:kunci(?:\s+jawaban)?|jawaban|key)\s*[:=\-]?\s*\(?([A-Ea-e])\)?\s*[.)]?\s*$/i;
const ESSAY_KEY_RE = /^\s*(?:kunci(?:\s+jawaban)?|jawaban)\s*[:=]\s*/i;
const SKIP_LINE_RE = /^\s*(?:pembahasan|penjelasan|uraian pembahasan|catatan)\b/i;

function sliceItems(items: Item[], from: number, to = Infinity): Item[] {
  const out: Item[] = [];
  let pos = 0;
  for (const it of items) {
    if (it.k === 'img') { if (pos >= from && pos < to) out.push(it); pos += 1; continue; }
    if (it.k === 'br') { pos += 1; continue; }
    const len = it.s.length;
    const a = Math.max(from, pos), b = Math.min(to, pos + len);
    if (b > a) out.push({ ...it, s: it.s.slice(a - pos, b - pos) });
    pos += len;
  }
  return out;
}

const redRatio = (items: Item[]): number => {
  let red = 0, all = 0;
  for (const it of items) {
    if (it.k !== 't') continue;
    const n = it.s.replace(/\s+/g, '').length;
    all += n; if (it.red) red += n;
  }
  return all ? red / all : 0;
};
const hasContent = (items: Item[]) => items.some((i) => i.k === 'img' || (i.k === 't' && i.s.trim()));

interface OptSeg { letter: number; items: Item[]; markerRed: boolean }

/** Potong satu baris menjadi pilihan-pilihan berurutan mulai dari huruf `expect` (null bila baris bukan pilihan). */
function splitOptions(items: Item[], expect: number): OptSeg[] | null {
  const text = itemsText(items);
  const m = OPT_RE.exec(text);
  if (!m) return null;
  const first = m[1].toUpperCase().charCodeAt(0) - 65;
  if (first !== expect || first > 4) return null;
  const upper = m[1] === m[1].toUpperCase();
  const starts: { letter: number; at: number; end: number }[] = [{ letter: first, at: 0, end: m[0].length }];
  let from = m[0].length;
  for (let L = first + 1; L <= 4; L++) {
    const ch = String.fromCharCode((upper ? 65 : 97) + L);
    const re = new RegExp('\\s\\(?' + ch + '\\s*[.)]\\s*', 'g');
    re.lastIndex = from;
    const mm = re.exec(text);
    if (!mm) break;
    starts.push({ letter: L, at: mm.index + 1, end: mm.index + mm[0].length });
    from = mm.index + mm[0].length;
  }
  return starts.map((s, k) => {
    const to = k + 1 < starts.length ? starts[k + 1].at : Infinity;
    const marker = sliceItems(items, s.at, s.end);
    return { letter: s.letter, items: trimItems(sliceItems(items, s.end, to)), markerRed: marker.some((i) => i.k === 't' && i.red && /[A-Ea-e]/.test(i.s)) };
  });
}

/** Cari "A. … B. …" di tengah paragraf (setelah teks soal). Hanya bila ada minimal dua pilihan berurutan. */
function findInlineOptions(items: Item[]): { at: number; segs: OptSeg[] } | null {
  const text = itemsText(items);
  const re = /(?:^|\s)\(?[Aa]\s*[.)]\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index + (/^\s/.test(m[0]) ? 1 : 0);
    const segs = splitOptions(trimItems(sliceItems(items, at)), 0);
    if (segs && segs.length >= 2) return { at, segs };
  }
  return null;
}

interface Draft {
  number: number;
  stem: string[]; // html per paragraf/tabel
  opts: { letter: number; html: string; red: boolean; items: Item[] }[];
  essayKeyParts: string[];
  keyLetter: number | null;
  warnings: string[];
}

const pHtml = (items: Item[]) => `<p>${itemsToHtml(items)}</p>`;
const plain = (items: Item[]) => items.map((i) => (i.k === 't' ? i.s : i.k === 'img' ? ' ' : ' ')).join('').replace(/\s+/g, ' ').trim();

export function parseBlocks(blocks: Block[]): { questions: ParsedQuestion[]; warnings: string[] } {
  const warnings: string[] = [];
  // peta awal: urutan nomor, jumlah baris "A."
  const cand = (b: Block) => (b.type === 'p' ? QRE.exec(b.text) : null);
  let chain = 0, expectedChain: number | null = null, aCount = 0, lastA = -1;
  blocks.forEach((b, i) => {
    if (b.type !== 'p') return;
    const c = cand(b);
    if (c) { const n = +c[1]; if (expectedChain === null) { expectedChain = n; } if (n === expectedChain) { chain++; expectedChain++; } }
    const o = OPT_RE.exec(b.text);
    if (o && o[1].toUpperCase() === 'A') { aCount++; lastA = i; }
  });
  const mcMode = chain > 0 && aCount >= 0.6 * chain;

  const drafts: Draft[] = [];
  let cur: Draft | null = null;
  let expected: number | null = null;
  const preamble: string[] = [];

  blocks.forEach((b, i) => {
    if (b.type === 'p') {
      const c = cand(b);
      const isOptStart = !!OPT_RE.exec(b.text) && cur !== null && splitOptions(b.items, cur.opts.length ? cur.opts[cur.opts.length - 1].letter + 1 : 0) !== null;
      if (c && !isOptStart) {
        const n = +c[1];
        const ok = cur === null ? true : n === expected && (cur.opts.length >= 2 || cur.opts.length === 0 && (!mcMode || i > lastA));
        if (ok) {
          cur = { number: n, stem: [], opts: [], essayKeyParts: [], keyLetter: null, warnings: [] };
          drafts.push(cur);
          expected = n + 1;
          const rest = trimItems(sliceItems(b.items, c[0].length));
          // soal dan pilihan dalam satu paragraf ("2. Hewan mamalia: A. Ayam B. Ikan C. Paus D. Kelelawar")
          const inline = findInlineOptions(rest);
          const stemItems = inline ? trimItems(sliceItems(rest, 0, inline.at)) : rest;
          if (hasContent(stemItems)) cur.stem.push(pHtml(stemItems));
          if (inline) for (const sg of inline.segs) cur.opts.push({ letter: sg.letter, html: pHtml(sg.items), red: sg.markerRed || (redRatio(sg.items) >= 0.5 && hasContent(sg.items)), items: sg.items });
          return;
        }
      }
    }
    if (!cur) {
      if (b.type === 'p' && preamble.length < 3) preamble.push(plain(b.items).slice(0, 50));
      return;
    }
    const d: Draft = cur;
    if (b.type === 'table') {
      if (d.opts.length) d.opts[d.opts.length - 1].html += b.html; else d.stem.push(b.html);
      return;
    }
    const text = b.text;
    // 1) kunci jawaban tertulis
    const km = KEY_RE.exec(text);
    if (km && d.opts.length) { d.keyLetter = km[1].toUpperCase().charCodeAt(0) - 65; return; }
    // 2) pilihan baru
    const next = d.opts.length ? d.opts[d.opts.length - 1].letter + 1 : 0;
    const segs = next <= 4 ? splitOptions(b.items, next) : null;
    if (segs) {
      for (const s of segs) {
        const red = s.markerRed || redRatio(s.items) >= 0.5 && hasContent(s.items);
        d.opts.push({ letter: s.letter, html: pHtml(s.items), red, items: s.items });
      }
      return;
    }
    if (SKIP_LINE_RE.test(text)) { d.warnings.push('Baris pembahasan dilewati.'); return; }
    // 3) belum ada pilihan: isi soal / kunci uraian
    if (!d.opts.length) {
      const trimmed = trimItems(b.items);
      if (ESSAY_KEY_RE.test(text)) { d.essayKeyParts.push(plain(sliceItems(trimmed, (ESSAY_KEY_RE.exec(text) as RegExpExecArray)[0].length))); return; }
      if (redRatio(trimmed) >= 0.5 && plain(trimmed)) { d.essayKeyParts.push(plain(trimmed)); return; }
      d.stem.push(pHtml(trimmed));
      return;
    }
    // 4) setelah pilihan: gambar saja ikut pilihan terakhir; teks lain di luar format dilewati
    const onlyImg = b.items.every((x) => x.k === 'img' || (x.k === 't' && !x.s.trim()));
    if (onlyImg) { d.opts[d.opts.length - 1].html += pHtml(b.items); return; }
    d.warnings.push('Ada baris di luar format yang dilewati: "' + plain(b.items).slice(0, 40) + '…"');
  });

  if (!drafts.length) warnings.push('Tidak ditemukan nomor soal (1. 2. 3. …). Pastikan setiap soal diawali nomor.');
  else if (preamble.length) warnings.push('Teks sebelum soal nomor ' + drafts[0].number + ' dilewati.');

  const questions: ParsedQuestion[] = drafts.map((d, idx) => {
    const isMc = d.opts.length >= 2;
    const w = d.warnings.slice();
    let correct: number | null = null;
    if (isMc) {
      const reds = d.opts.map((o, k) => (o.red ? k : -1)).filter((k) => k >= 0);
      if (reds.length) { correct = reds[0]; if (reds.length > 1) w.push('Lebih dari satu pilihan berwarna merah; dipakai yang pertama. Periksa kunci.'); }
      else if (d.keyLetter !== null) { const k = d.opts.findIndex((o) => o.letter === d.keyLetter); if (k >= 0) correct = k; }
      if (correct === null) w.push('Kunci jawaban belum ditandai (huruf merah). Pilih kuncinya.');
    } else if (d.opts.length === 1) w.push('Hanya ada satu pilihan; dibaca sebagai uraian.');
    if (!d.stem.length || d.stem.every((s) => !s.replace(/<[^>]+>/g, '').trim() && !/<img|<table/.test(s))) w.push('Teks soal kosong.');
    const optsOut = isMc ? d.opts : [];
    return {
      uid: 'q' + (idx + 1),
      number: d.number,
      type: isMc ? 'multiple_choice' : 'essay',
      questionHtml: d.stem.join('') + (!isMc && d.opts.length === 1 ? d.opts[0].html : ''),
      options: optsOut.map((o) => ({ html: o.html })),
      correct,
      essayKey: isMc ? '' : d.essayKeyParts.join('\n'),
      warnings: w,
    };
  });
  return { questions, warnings };
}

// ------------------------------------------------------------------ masukan clipboard
/** HTML clipboard Word: ambil isi antara penanda StartFragment/EndFragment bila ada. */
function fragmentOf(html: string): string {
  const a = html.indexOf('<!--StartFragment-->');
  const b = html.indexOf('<!--EndFragment-->');
  if (a >= 0 && b > a) return html.slice(a + 20, b);
  return html;
}

export function parseWordClipboard(input: { html?: string; text?: string }): ParseResult {
  const html = input.html && input.html.trim() ? fragmentOf(input.html) : '';
  const src = html || (input.text || '').split(/\r?\n/).map((l) => `<p>${escapeHtml(l)}</p>`).join('');
  const doc = new DOMParser().parseFromString(src, 'text/html');
  const ctx: Ctx = { images: [], rtfCount: 0, seq: 0, warnings: [] };
  const blocks: Block[] = [];
  walkBlocks(doc.body, ctx, blocks);
  const r = parseBlocks(blocks);
  return { questions: r.questions, images: ctx.images, warnings: [...new Set([...ctx.warnings, ...r.warnings])] };
}

/** Isi HTML pertanyaan dengan gambar final: ganti <img data-ref> dengan <img src="urlFinal"> (ref tanpa URL = dibuang). */
export function fillImages(html: string, urls: Record<string, string>): string {
  return html.replace(/<img data-ref="([^"]+)">/g, (_m, id: string) => (urls[id] ? `<img src="${escapeAttr(urls[id])}">` : ''));
}
export const imageRefsIn = (html: string): string[] => Array.from(html.matchAll(/<img data-ref="([^"]+)">/g)).map((m) => m[1]);

/** Gabungkan soal ke soal sebelumnya (jika pemisahan keliru): dipakai UI. */
export function mergeQuestions(prev: ParsedQuestion, cur: ParsedQuestion): ParsedQuestion {
  const joined = prev.questionHtml + `<p>${cur.number ?? ''}.</p>` + cur.questionHtml;
  const opts = [...prev.options, ...cur.options];
  const isMc = opts.length >= 2;
  return {
    ...prev,
    questionHtml: joined,
    options: isMc ? opts : [],
    type: isMc ? 'multiple_choice' : 'essay',
    correct: cur.options.length && cur.correct !== null ? prev.options.length + cur.correct : prev.correct,
    essayKey: isMc ? '' : [prev.essayKey, cur.essayKey].filter(Boolean).join('\n'),
    warnings: [...prev.warnings, ...cur.warnings],
  };
}
