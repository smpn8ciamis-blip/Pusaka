import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileText, GraduationCap, Image as ImageIcon, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ElearningViewer } from '@/components/ElearningViewer';
import { StudentSubmissionDialog } from '@/components/dashboard/StudentSubmissionDialog';
import { supabase } from '@/integrations/supabase/client';
import { KIND_LABEL, formatFileSize, type ElearningMaterial } from '@/lib/elearning';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Materi e-learning untuk kelas siswa (hanya yang ditampilkan guru; dijaga juga oleh RLS). */
export default function StudentElearningTab({ classId, studentId }: { classId?: string | null; studentId?: string | null }) {
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const [viewing, setViewing] = useState<ElearningMaterial | null>(null);
  const [submitting, setSubmitting] = useState<ElearningMaterial | null>(null);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ['student-elearning', classId],
    enabled: !!classId,
    queryFn: async (): Promise<ElearningMaterial[]> => {
      const { data, error } = await db
        .from('elearning_materials')
        .select('*')
        .eq('class_id', classId)
        .eq('is_published', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ElearningMaterial[];
    },
  });

  // Status pengumpulan jawaban siswa ini
  const { data: mine = [] } = useQuery({
    queryKey: ['student-submissions', studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<Array<{ material_id: string; graded_at: string | null; score: number | null }>> => {
      const { data, error } = await db
        .from('elearning_submissions')
        .select('material_id, graded_at, score')
        .eq('student_id', studentId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const mineByMaterial = useMemo(() => new Map(mine.map((r) => [r.material_id, r])), [mine]);

  const subjects = useMemo(() => [...new Set(materials.map((m) => m.subject))].sort(), [materials]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter(
      (m) =>
        (subject === 'all' || m.subject === subject) &&
        (!term || `${m.title} ${m.subject} ${m.description ?? ''}`.toLowerCase().includes(term)),
    );
  }, [materials, search, subject]);

  return (
    <div className="space-y-4 p-4 pb-28">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <GraduationCap className="h-5 w-5 text-blue-600" /> E-Learning
        </h2>
        <Badge className="bg-blue-100 text-xs text-blue-700">{materials.length} Materi</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Cari materi..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {subjects.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {['all', ...subjects].map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                subject === s ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {s === 'all' ? 'Semua' : s}
            </button>
          ))}
        </div>
      )}

      {!classId ? (
        <p className="py-10 text-center text-sm text-gray-400">Data kelas Anda belum tersedia.</p>
      ) : isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          {materials.length === 0 ? 'Belum ada materi dari guru.' : 'Tidak ada materi yang cocok.'}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((m) => {
            const sub = mineByMaterial.get(m.id);
            return (
              <div
                key={m.id}
                className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <button onClick={() => setViewing(m)} className="flex w-full items-start gap-3 text-left">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    {m.file_type === 'image' ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.title}</p>
                    <p className="truncate text-xs text-gray-500">{m.subject}</p>
                    {m.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{m.description}</p>}
                    <p className="mt-1 text-[10px] text-gray-400">
                      {KIND_LABEL[m.file_type]}
                      {m.file_size ? ` • ${formatFileSize(m.file_size)}` : ''} •{' '}
                      {format(new Date(m.created_at), 'd MMM yyyy', { locale: localeId })}
                    </p>
                  </div>
                </button>
                {m.accepts_submissions && (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                    {sub ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {sub.graded_at ? `Dinilai${sub.score !== null ? `: ${sub.score}` : ''}` : 'Jawaban terkumpul'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Belum mengumpulkan jawaban</span>
                    )}
                    <button
                      onClick={() => setSubmitting(m)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      {sub ? 'Lihat / Ubah' : 'Kumpulkan Jawaban'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ElearningViewer material={viewing} onClose={() => setViewing(null)} />
      <StudentSubmissionDialog material={submitting} studentId={studentId} onClose={() => setSubmitting(null)} />
    </div>
  );
}
