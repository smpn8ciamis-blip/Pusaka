export const ELEARNING_BUCKET = 'elearning-materials';
export const ELEARNING_MAX_BYTES = 20 * 1024 * 1024; // 20 MB, sama dengan batas bucket

export type ElearningKind = 'image' | 'pdf' | 'docx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ELEARNING_ACCEPT = `image/jpeg,image/png,image/webp,image/gif,application/pdf,${DOCX_MIME},.docx,.pdf`;

/** Jenis file yang diizinkan: gambar, PDF, DOCX. null bila tidak didukung. */
export function detectElearningKind(file: { name: string; type: string }): ElearningKind | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/') && /\.(jpe?g|png|webp|gif)$/.test(name)) return 'image';
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (file.type === DOCX_MIME || name.endsWith('.docx')) return 'docx';
  return null;
}

/** MIME yang dikirim ke storage (bucket membatasi tipe). */
export function elearningMime(kind: ElearningKind, file: { type: string }): string {
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'docx') return DOCX_MIME;
  return file.type || 'image/jpeg';
}

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(-80);
  return cleaned || 'file';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const KIND_LABEL: Record<ElearningKind, string> = {
  image: 'Gambar',
  pdf: 'PDF',
  docx: 'Word',
};

export interface ElearningMaterial {
  id: string;
  teacher_id: string;
  class_id: string;
  subject: string;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  file_type: ElearningKind;
  mime_type: string | null;
  file_size: number | null;
  is_published: boolean;
  created_at: string;
  classes?: { name: string } | null;
  teachers?: { profiles?: { full_name: string | null } | null } | null;
}
