import JSZip from 'jszip';

export interface DocxPreview {
  paragraphs: string[];
  /** gambar di dalam dokumen sebagai blob (pemanggil wajib URL.revokeObjectURL) */
  images: { name: string; blob: Blob }[];
  truncated: boolean;
}

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const MAX_PARAGRAPHS = 800;
const MAX_IMAGES = 12;

/**
 * Pratinjau sederhana berkas .docx tanpa unggahan ke layanan luar: teks per paragraf + gambar yang
 * tertanam. Tata letak, tabel, dan format tidak ditampilkan persis seperti di Word.
 */
export async function readDocxPreview(data: ArrayBuffer): Promise<DocxPreview> {
  const zip = await JSZip.loadAsync(data);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Bukan berkas Word (.docx) yang valid');

  const xml = new DOMParser().parseFromString(await docFile.async('string'), 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Isi dokumen tidak terbaca');

  const paragraphs: string[] = [];
  const ps = xml.getElementsByTagNameNS('*', 'p');
  for (let i = 0; i < ps.length && paragraphs.length < MAX_PARAGRAPHS; i++) {
    let text = '';
    const walk = (node: Element) => {
      for (const child of Array.from(node.children)) {
        const n = child.localName;
        if (n === 't') text += child.textContent ?? '';
        else if (n === 'tab') text += '\t';
        else if (n === 'br' || n === 'cr') text += '\n';
        else if (n !== 'p') walk(child);
      }
    };
    walk(ps[i]);
    paragraphs.push(text);
  }
  // buang baris kosong berurutan agar ringkas
  const compact = paragraphs.filter((t, i) => t.trim() !== '' || (i > 0 && paragraphs[i - 1].trim() !== ''));

  const images: DocxPreview['images'] = [];
  const mediaNames = Object.keys(zip.files).filter((n) => /^word\/media\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(n)).sort();
  for (const name of mediaNames.slice(0, MAX_IMAGES)) {
    const ext = name.split('.').pop()!.toLowerCase();
    const buf = await zip.file(name)!.async('arraybuffer');
    images.push({ name: name.split('/').pop()!, blob: new Blob([buf], { type: IMAGE_MIME[ext] ?? 'image/png' }) });
  }

  return { paragraphs: compact, images, truncated: ps.length > MAX_PARAGRAPHS || mediaNames.length > MAX_IMAGES };
}
