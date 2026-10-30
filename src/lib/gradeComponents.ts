// Jenis penilaian & bobot per mata pelajaran (jadwal).
// Komponen bawaan (legacy_key) memakai kolom lama di tabel grades (tugas/kuis/uts/uas/praktik),
// tempat nilai CBT masuk. Komponen buatan guru disimpan di tabel grade_scores.

export const LEGACY_KEYS = ['tugas', 'kuis', 'uts', 'uas', 'praktik'] as const;
export type LegacyKey = (typeof LEGACY_KEYS)[number];

export const LEGACY_LABEL: Record<LegacyKey, string> = {
  tugas: 'Tugas',
  kuis: 'Kuis',
  uts: 'UTS',
  uas: 'UAS',
  praktik: 'Praktik',
};

export const MAX_COMPONENTS = 12;

export const CATEGORIES = ['pengetahuan', 'keterampilan', 'sikap'] as const;
export type GradeCategory = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<GradeCategory, string> = {
  pengetahuan: 'Pengetahuan',
  keterampilan: 'Keterampilan',
  sikap: 'Sikap',
};

export interface GradeComponent {
  /** id di database; null untuk komponen bawaan yang belum disimpan */
  id: string | null;
  name: string;
  weight: number;
  legacy_key: LegacyKey | null;
  /** kelompok nilai: dirata-ratakan terpisah per kategori; nilai akhir tetap satu angka */
  category: GradeCategory;
}

/** Rumus lama (dipakai bila guru belum mengatur sendiri). */
export const DEFAULT_COMPONENTS: GradeComponent[] = [
  { id: null, name: 'Tugas', weight: 20, legacy_key: 'tugas', category: 'pengetahuan' },
  { id: null, name: 'Kuis', weight: 20, legacy_key: 'kuis', category: 'pengetahuan' },
  { id: null, name: 'UTS', weight: 25, legacy_key: 'uts', category: 'pengetahuan' },
  { id: null, name: 'UAS', weight: 25, legacy_key: 'uas', category: 'pengetahuan' },
  { id: null, name: 'Praktik', weight: 10, legacy_key: 'praktik', category: 'pengetahuan' },
];

/** Kunci unik kolom nilai di tabel input: komponen bawaan -> legacy_key, lainnya -> id. */
export function componentKey(c: GradeComponent, index: number): string {
  return c.legacy_key ?? c.id ?? `new-${index}`;
}

export interface StudentScores {
  /** nilai kolom lama pada tabel grades (dipertahankan walau komponennya tidak dipakai) */
  legacy: Record<LegacyKey, number>;
  /** nilai komponen buatan guru: componentId -> nilai */
  custom: Record<string, number>;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Sama dengan fungsi _grade_final di database (rata-rata berbobot; kosong dihitung 0). */
export function computeFinal(components: GradeComponent[], scores: StudentScores): number {
  const total = components.reduce((s, c) => s + c.weight, 0);
  if (total <= 0) return 0;
  const sum = components.reduce((s, c) => {
    const v = c.legacy_key ? scores.legacy[c.legacy_key] : c.id ? scores.custom[c.id] : 0;
    return s + c.weight * num(v);
  }, 0);
  return Math.round(Math.min(100, Math.max(0, sum / total)) * 100) / 100;
}

/** Rata-rata berbobot per kategori (null bila kategori tidak dipakai atau bobotnya 0). */
export function computeCategoryAverages(
  components: GradeComponent[],
  scores: StudentScores,
): Record<GradeCategory, number | null> {
  const out = { pengetahuan: null, keterampilan: null, sikap: null } as Record<GradeCategory, number | null>;
  for (const cat of CATEGORIES) {
    const list = components.filter((c) => c.category === cat);
    const total = list.reduce((s, c) => s + c.weight, 0);
    if (list.length === 0 || total <= 0) continue;
    const sum = list.reduce((s, c) => {
      const v = c.legacy_key ? scores.legacy[c.legacy_key] : c.id ? scores.custom[c.id] : 0;
      return s + c.weight * num(v);
    }, 0);
    out[cat] = Math.round(Math.min(100, Math.max(0, sum / total)) * 100) / 100;
  }
  return out;
}

/** Kategori yang dipakai (urut tetap); dipakai untuk memutuskan perlu tidaknya kolom per kategori. */
export function usedCategories(components: GradeComponent[]): GradeCategory[] {
  return CATEGORIES.filter((cat) => components.some((c) => c.category === cat));
}

export function totalWeight(items: { weight: number }[]): number {
  return Math.round(items.reduce((s, c) => s + num(c.weight), 0) * 100) / 100;
}

/** Validasi sama dengan aturan di fungsi grade_save_components. Mengembalikan pesan galat atau null. */
export function validateComponents(items: GradeComponent[]): string | null {
  if (items.length === 0) return null; // kosong = kembali ke bawaan
  if (items.length > MAX_COMPONENTS) return `Maksimal ${MAX_COMPONENTS} jenis penilaian`;
  const names = new Set<string>();
  const keys = new Set<string>();
  for (const c of items) {
    const name = c.name.trim();
    if (!name) return 'Nama jenis penilaian tidak boleh kosong';
    if (name.length > 40) return `Nama "${name}" terlalu panjang (maks. 40 karakter)`;
    if (names.has(name.toLowerCase())) return `Nama jenis penilaian ganda: ${name}`;
    names.add(name.toLowerCase());
    if (!CATEGORIES.includes(c.category)) return `Kategori "${name}" tidak dikenal`;
    if (!Number.isFinite(c.weight) || c.weight < 0 || c.weight > 100) return `Bobot "${name}" harus 0–100`;
    if (c.legacy_key) {
      if (keys.has(c.legacy_key)) return `Penerima nilai CBT "${LEGACY_LABEL[c.legacy_key]}" dipakai lebih dari satu jenis`;
      keys.add(c.legacy_key);
    }
  }
  const total = totalWeight(items);
  if (Math.abs(total - 100) > 0.005) return `Total bobot harus tepat 100% (sekarang ${total}%)`;
  return null;
}

export function toRpcItems(items: GradeComponent[]) {
  return items.map((c) => ({
    id: c.id,
    name: c.name.trim(),
    weight: c.weight,
    legacy_key: c.legacy_key,
    category: c.category,
  }));
}

export function gradeLabel(score: number) {
  if (score >= 90) return { label: 'A', color: 'text-green-600 bg-green-50' };
  if (score >= 80) return { label: 'B', color: 'text-blue-600 bg-blue-50' };
  if (score >= 70) return { label: 'C', color: 'text-yellow-600 bg-yellow-50' };
  if (score >= 60) return { label: 'D', color: 'text-orange-600 bg-orange-50' };
  return { label: 'E', color: 'text-red-600 bg-red-50' };
}

/** Baris dari tabel grade_components -> GradeComponent (urut sort_order). */
export function fromRows(rows: any[] | null | undefined): GradeComponent[] {
  return [...(rows ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => ({
      id: r.id as string,
      name: String(r.name),
      weight: Number(r.weight),
      legacy_key: (r.legacy_key ?? null) as LegacyKey | null,
      category: (CATEGORIES.includes(r.category) ? r.category : 'pengetahuan') as GradeCategory,
    }));
}
