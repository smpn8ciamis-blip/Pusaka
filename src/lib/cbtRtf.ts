// Ambil gambar PNG/JPEG yang tertanam di RTF hasil salin dari Word. HTML hasil salin Word hanya memuat
// alamat berkas lokal (file:///…/clip_image001.png) yang tidak bisa dibaca peramban; datanya ada di RTF.
export interface RtfImage { mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array }

const hexToBytes = (hex: string): Uint8Array => {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Gambar PNG/JPEG dalam urutan kemunculannya. Format lain (EMF/WMF) dilewati. */
export function extractRtfImages(rtf: string): RtfImage[] {
  const out: RtfImage[] = [];
  let from = 0;
  for (;;) {
    const start = rtf.indexOf('{\\pict', from);
    if (start < 0) break;
    // cari kurung penutup grup (data heksadesimal tidak mengandung kurung)
    let depth = 0, end = -1;
    for (let i = start; i < rtf.length; i++) {
      const c = rtf.charCodeAt(i);
      if (c === 92) { i++; continue; } // \ : lewati karakter yang di-escape
      if (c === 123) depth++;
      else if (c === 125 && --depth === 0) { end = i; break; }
    }
    if (end < 0) break;
    from = end + 1;
    let body = rtf.slice(start + 1, end);
    const isPng = /\\pngblip/.test(body), isJpg = /\\jpegblip/.test(body);
    if (!isPng && !isJpg) continue;
    body = body.replace(/\{[^{}]*\}/g, ' '); // buang grup bersarang (mis. \*\blipuid)
    let hexStart = 0;
    const re = /\\[a-zA-Z]+-?\d*[ \r\n]?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) hexStart = m.index + m[0].length;
    const hex = body.slice(hexStart).replace(/[^0-9a-fA-F]/g, '');
    if (hex.length < 40 || hex.length % 2) continue;
    const bytes = hexToBytes(hex);
    const okMagic = isPng ? (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) : (bytes[0] === 0xff && bytes[1] === 0xd8);
    if (okMagic) out.push({ mime: isPng ? 'image/png' : 'image/jpeg', bytes });
  }
  return out;
}
