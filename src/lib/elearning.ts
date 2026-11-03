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
  accepts_submissions: boolean;
  /** Jenis penilaian tujuan nilai jawaban siswa (kunci bawaan: tugas/kuis/uts/uas/praktik) */
  grade_legacy_key?: string | null;
  /** …atau nama jenis penilaian buatan guru */
  grade_component_name?: string | null;
  created_at: string;
  classes?: { name: string } | null;
  teachers?: { profiles?: { full_name: string | null } | null } | null;
}

export const SUBMISSION_BUCKET = 'elearning-submissions';

export interface ElearningSubmission {
  id: string;
  material_id: string;
  student_id: string;
  answer_text: string | null;
  file_path: string | null;
  file_name: string | null;
  file_type: ElearningKind | null;
  mime_type: string | null;
  file_size: number | null;
  score: number | null;
  teacher_feedback: string | null;
  graded_at: string | null;
  submitted_at: string;
  updated_at: string;
}

/** Pilihan jenis penilaian dari RPC elearning_grade_targets. */
export interface GradeTargetOption {
  key: string; // 'legacy:tugas' | 'name:Portofolio'
  label: string;
  weight: number;
  category?: string;
}

export const NO_GRADE_TARGET = 'none';

/** Kunci pilihan (untuk <Select>) dari pemetaan yang tersimpan pada materi. */
export function gradeTargetKeyOf(m: { grade_legacy_key?: string | null; grade_component_name?: string | null }): string {
  if (m.grade_legacy_key) return `legacy:${m.grade_legacy_key}`;
  if (m.grade_component_name) return `name:${m.grade_component_name}`;
  return NO_GRADE_TARGET;
}

/** Kolom basis data dari kunci pilihan. */
export function gradeTargetFields(key: string): { grade_legacy_key: string | null; grade_component_name: string | null } {
  if (key.startsWith('legacy:')) return { grade_legacy_key: key.slice(7), grade_component_name: null };
  if (key.startsWith('name:')) return { grade_legacy_key: null, grade_component_name: key.slice(5) };
  return { grade_legacy_key: null, grade_component_name: null };
}

const LEGACY_LABEL: Record<string, string> = { tugas: 'Tugas', kuis: 'Kuis', uts: 'UTS', uas: 'UAS', praktik: 'Praktik' };

/** Nama tampilan pemetaan (tanpa memuat daftar jenis penilaian). */
export function gradeTargetLabel(key: string): string {
  if (key.startsWith('legacy:')) return LEGACY_LABEL[key.slice(7)] ?? key.slice(7);
  if (key.startsWith('name:')) return key.slice(5);
  return '';
}
