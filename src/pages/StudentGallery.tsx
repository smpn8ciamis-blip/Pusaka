import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Search, User } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataPagination } from '@/components/ui/data-pagination';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDirectoryClasses, useDirectoryStudents } from '@/hooks/useStudentDirectory';
import {
  applyDirectory, isActiveStudent, studentStatusLabel,
  type DirectorySortKey, type DirectoryStudent, type SortDir, type StatusFilter,
} from '@/lib/studentDirectory';
import { toTitleCase } from '@/lib/utils';

const SORTS: { value: string; label: string; key: DirectorySortKey; dir: SortDir }[] = [
  { value: 'name-asc', label: 'Nama A–Z', key: 'name', dir: 'asc' },
  { value: 'name-desc', label: 'Nama Z–A', key: 'name', dir: 'desc' },
  { value: 'class-asc', label: 'Kelas (naik)', key: 'class', dir: 'asc' },
  { value: 'class-desc', label: 'Kelas (turun)', key: 'class', dir: 'desc' },
  { value: 'nis-asc', label: 'NIS (kecil → besar)', key: 'nis', dir: 'asc' },
  { value: 'nis-desc', label: 'NIS (besar → kecil)', key: 'nis', dir: 'desc' },
];

function Photo({ s, className }: { s: DirectoryStudent; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [s.photo_url]);
  if (!s.photo_url || failed) {
    return <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className ?? ''}`}><User className="h-10 w-10" /></div>;
  }
  return <img src={s.photo_url} alt={`Foto ${s.full_name}`} loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className ?? ''}`} />;
}

export default function StudentGallery() {
  const { data: students = [], isLoading, isError } = useDirectoryStudents();
  const { data: classes = [] } = useDirectoryClasses();

  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('all');
  const [gender, setGender] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('aktif');
  const [photo, setPhoto] = useState<'all' | 'with' | 'without'>('with');
  const [sort, setSort] = useState('name-asc');
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DirectoryStudent | null>(null);

  const s = SORTS.find((x) => x.value === sort) ?? SORTS[0];
  const filtered = useMemo(
    () => applyDirectory(students, { search, classId, gender, status, photo, sortKey: s.key, sortDir: s.dir }),
    [students, search, classId, gender, status, photo, s.key, s.dir],
  );

  useEffect(() => { setPage(1); }, [search, classId, gender, status, photo, sort, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const withPhoto = useMemo(() => students.filter((x) => isActiveStudent(x) && x.photo_url).length, [students]);
  const activeTotal = useMemo(() => students.filter(isActiveStudent).length, [students]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ImageIcon className="h-6 w-6 text-primary" /> Galeri Foto Siswa
          </h1>
          <p className="text-sm text-muted-foreground">
            Foto siswa yang sudah diunggah. Siswa aktif: {withPhoto} dari {activeTotal} sudah punya foto.
          </p>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari nama / NIS / NISN…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Kelas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kelas</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="Jenis kelamin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua jenis kelamin</SelectItem>
                <SelectItem value="L">Laki-laki</SelectItem>
                <SelectItem value="P">Perempuan</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="aktif">Siswa aktif</SelectItem>
                <SelectItem value="nonaktif">Nonaktif / mutasi / alumni</SelectItem>
                <SelectItem value="all">Semua status</SelectItem>
              </SelectContent>
            </Select>
            <Select value={photo} onValueChange={(v) => setPhoto(v as 'all' | 'with' | 'without')}>
              <SelectTrigger><SelectValue placeholder="Foto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="with">Sudah ada foto</SelectItem>
                <SelectItem value="without">Belum ada foto</SelectItem>
                <SelectItem value="all">Semua</SelectItem>
              </SelectContent>
            </Select>
            <div className="sm:col-span-2 lg:col-span-2">
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger><SelectValue placeholder="Urutkan" /></SelectTrigger>
                <SelectContent>
                  {SORTS.map((o) => <SelectItem key={o.value} value={o.value}>Urutkan: {o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />)}
          </div>
        ) : isError ? (
          <Card><CardContent className="py-10 text-center text-destructive">Gagal memuat data siswa. Muat ulang halaman.</CardContent></Card>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Tidak ada siswa yang sesuai filter.</CardContent></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {pageItems.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setDetail(st)}
                  className="group overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Photo s={st} className="aspect-[3/4] w-full" />
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-sm font-medium">{toTitleCase(st.full_name)}</p>
                    <p className="truncate text-xs text-muted-foreground">{st.classes?.name ?? 'Tanpa kelas'} • {st.nis ?? '-'}</p>
                    {!isActiveStudent(st) && <Badge variant="secondary" className="text-[10px]">{studentStatusLabel(st)}</Badge>}
                  </div>
                </button>
              ))}
            </div>
            <DataPagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48, 96]}
            />
          </>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-sm">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{toTitleCase(detail.full_name)}</DialogTitle>
                <DialogDescription>
                  {detail.classes?.name ?? 'Tanpa kelas'} • NIS {detail.nis ?? '-'}{detail.nisn ? ` • NISN ${detail.nisn}` : ''} • {studentStatusLabel(detail)}
                </DialogDescription>
              </DialogHeader>
              <Photo s={detail} className="mx-auto max-h-[60dvh] w-full rounded-md !object-contain" />
              {detail.photo_url && (
                <Button variant="outline" asChild>
                  <a href={detail.photo_url} target="_blank" rel="noopener noreferrer">Buka foto ukuran penuh</a>
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
