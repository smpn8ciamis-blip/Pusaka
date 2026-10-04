// Feature keys used to gate access across the app
export const FEATURE_KEYS = {
  ATTENDANCE: 'attendance',
  SCHEDULES: 'schedules',
  STUDENTS: 'students',
  TEACHERS: 'teachers',
  CLASSES: 'classes',
  GRADES: 'grades',
  VIOLATIONS: 'violations',
  JOURNALS: 'journals',
  LETTERS: 'letters',
  ANNOUNCEMENTS: 'announcements',
  FINANCE: 'finance',
  HONORARIUM: 'honorarium',
  TAX: 'tax',
  ARCHIVE: 'archive',
  COMPLAINTS: 'complaints',
  ACHIEVEMENTS: 'achievements',
  ALUMNI: 'alumni',
  ANALYTICS: 'analytics',
  EXAMS: 'exams',
  HABIT_JOURNAL: 'habit_journal',
  FILE_UPLOAD: 'file_upload',
  BACKUP: 'backup',
  ZAPIER: 'zapier',
  POLLING: 'polling',
  WORKER_PAYMENTS: 'worker_payments',
  OFFICIAL_TRAVEL: 'official_travel',
  CASH_AUDIT: 'cash_audit',
  RKAS: 'rkas',
  SPJ: 'spj',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export interface PlanPreset {
  max_students: number;
  max_teachers: number;
  duration_months: number;
  monthly_price: number;
  label: string;
  description: string;
  features: FeatureKey[];
}

const STARTER_FEATURES: FeatureKey[] = [
  FEATURE_KEYS.ATTENDANCE,
  FEATURE_KEYS.SCHEDULES,
  FEATURE_KEYS.STUDENTS,
  FEATURE_KEYS.TEACHERS,
  FEATURE_KEYS.CLASSES,
  FEATURE_KEYS.ANNOUNCEMENTS,
];

const STANDARD_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  FEATURE_KEYS.GRADES,
  FEATURE_KEYS.VIOLATIONS,
  FEATURE_KEYS.JOURNALS,
  FEATURE_KEYS.LETTERS,
  FEATURE_KEYS.COMPLAINTS,
  FEATURE_KEYS.ACHIEVEMENTS,
  FEATURE_KEYS.EXAMS,
  FEATURE_KEYS.HABIT_JOURNAL,
  FEATURE_KEYS.POLLING,
];

const PREMIUM_FEATURES: FeatureKey[] = [
  ...STANDARD_FEATURES,
  FEATURE_KEYS.FINANCE,
  FEATURE_KEYS.HONORARIUM,
  FEATURE_KEYS.TAX,
  FEATURE_KEYS.ARCHIVE,
  FEATURE_KEYS.ALUMNI,
  FEATURE_KEYS.ANALYTICS,
  FEATURE_KEYS.FILE_UPLOAD,
  FEATURE_KEYS.WORKER_PAYMENTS,
  FEATURE_KEYS.OFFICIAL_TRAVEL,
  FEATURE_KEYS.CASH_AUDIT,
  FEATURE_KEYS.RKAS,
  FEATURE_KEYS.SPJ,
];

const ENTERPRISE_FEATURES: FeatureKey[] = [
  ...PREMIUM_FEATURES,
  FEATURE_KEYS.BACKUP,
  FEATURE_KEYS.ZAPIER,
];

export const PLAN_PRESETS: Record<string, PlanPreset> = {
  starter: {
    max_students: 200,
    max_teachers: 20,
    duration_months: 1,
    monthly_price: 150000,
    label: 'Starter',
    description: 'Fitur dasar absensi & jadwal',
    features: STARTER_FEATURES,
  },
  standard: {
    max_students: 500,
    max_teachers: 50,
    duration_months: 1,
    monthly_price: 350000,
    label: 'Standard',
    description: 'Nilai, pelanggaran, surat & jurnal',
    features: STANDARD_FEATURES,
  },
  premium: {
    max_students: 1500,
    max_teachers: 100,
    duration_months: 1,
    monthly_price: 750000,
    label: 'Premium',
    description: 'Keuangan, honorarium, pajak & arsip',
    features: PREMIUM_FEATURES,
  },
  enterprise: {
    max_students: 9999,
    max_teachers: 9999,
    duration_months: 1,
    monthly_price: 1500000,
    label: 'Enterprise',
    description: 'Semua fitur + backup & integrasi',
    features: ENTERPRISE_FEATURES,
  },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  attendance: 'Absensi',
  schedules: 'Jadwal Pelajaran',
  students: 'Data Siswa',
  teachers: 'Data Guru',
  classes: 'Kelas',
  grades: 'Nilai',
  violations: 'Pelanggaran',
  journals: 'Jurnal Mengajar',
  letters: 'Surat Tugas & Izin',
  announcements: 'Pengumuman',
  finance: 'Keuangan (BOS)',
  honorarium: 'Honorarium',
  tax: 'Pajak',
  archive: 'Arsip Surat',
  complaints: 'Pengaduan',
  achievements: 'Prestasi',
  alumni: 'Alumni',
  analytics: 'Analitik',
  exams: 'Ujian',
  habit_journal: 'Jurnal Kebiasaan',
  file_upload: 'Upload Berkas',
  backup: 'Backup Database',
  zapier: 'Integrasi Zapier',
  polling: 'Polling/Voting',
  worker_payments: 'Pembayaran Pekerja',
  official_travel: 'Perjalanan Dinas',
  cash_audit: 'Pemeriksaan Kas',
  rkas: 'RKAS',
  spj: 'SPJ',
};

export const formatRupiah = (amount: number) => {
  if (amount === 0) return 'Gratis';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
};
