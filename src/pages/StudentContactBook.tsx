import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Download, MessageCircle, Phone, Search } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataPagination } from '@/components/ui/data-pagination';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDirectoryClasses, useDirectoryStudents } from '@/hooks/useStudentDirectory';
import {
  applyDirectory, hasPhone, isActiveStudent, studentStatusLabel, waNumber,
  type DirectorySortKey, type DirectoryStudent, type SortDir, type StatusFilter,
} from '@/lib/studentDirectory';
import { toTitleCase } from '@/lib/utils';

function SortHead({
  label, k, sortKey, sortDir, onSort, className,
}: { label: string; k: DirectorySortKey; sortKey: DirectorySortKey; sortDir: SortDir; onSort: (k: DirectorySortKey) => void; className?: string }) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => onSort(k)}>
        {label} <Icon className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      </button>
    </TableHead>
  );
}

const csvCell = (v: string | null | undefined) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export default function StudentContactBook() {
  const { data: students = [], isLoading, isError } = useDirectoryStudents();
  const { data: classes = [] } = useDirectoryClasses();

  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState('all');
  const [gender, setGender] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('aktif');
  const [contact, setContact] = useState<'all' | 'with' | 'without'>('all');
  const [sortKey, setSortKey] = useState<DirectorySortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => applyDirectory(students, { search, classId, gender, status, contact, sortKey, sortDir }),
    [students, search, classId, gender, status, contact, sortKey, sortDir],
  );

  useEffect(() => { setPage(1); }, [search, classId, gender, status, contact, sortKey, sortDir, pageSize]);

  const onSort = (k: DirectorySortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const activeTotal = useMemo(() => students.filter(isActiveStudent).length, [students]);
  const activeWithPhone = useMemo(() => students.filter((x) => isActiveStudent(x) && hasPhone(x)).length, [students]);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Nomor disalin'); }
    catch { toast.error('Tidak bisa menyalin. Salin manual dari tabel.'); }
  };

  const exportCsv = () => {
    if (filtered.length === 0) { toast.error('Tidak ada data untuk diekspor'); return; }
    const head = ['No', 'NIS', 'NISN', 'Nama', 'Kelas', 'Jenis Kelamin', 'Status', 'Nama Orang Tua/Wali', 'No. HP', 'Alamat'];
    const rows = filtered.map((s, i) => [
      i + 1, s.nis, s.nisn, toTitleCase(s.full_name), s.classes?.name, s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '',
      studentStatusLabel(s), s.parent_name, s.parent_phone, s.address,
    ].map((v) => csvCell(v == null ? '' : String(v))).join(','));
    const blob = new Blob(['﻿' + [head.map(csvCell).join(','), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buku-kontak-siswa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success(`${filtered.length} kontak diekspor`);
  };

  const phoneCell = (s: DirectoryStudent) => {
    if (!hasPhone(s)) return <span className="text-muted-foreground">Belum ada</span>;
    const wa = waNumber(s.parent_phone);
    return (
      <div className="flex items-center gap-1">
        <span className="whitespace-nowrap">{s.parent_phone}</span>
        <Button asChild size="icon" variant="ghost" className="h-7 w-7" title="Telepon">
          <a href={`tel:${(s.parent_phone ?? '').replace(/[^\d+]/g, '')}`} aria-label={`Telepon wali ${s.full_name}`}><Phone className="h-3.5 w-3.5" /></a>
        </Button>
        {wa && (
          <Button asChild size="icon" variant="ghost" className="h-7 w-7 text-green-600" title="Buka WhatsApp">
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp wali ${s.full_name}`}><MessageCircle className="h-3.5 w-3.5" /></a>
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Salin nomor" onClick={() => copy(s.parent_phone ?? '')} aria-label="Salin nomor">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Phone className="h-6 w-6 text-primary" /> Buku Kontak Siswa
            </h1>
            <p className="text-sm text-muted-foreground">
              Kontak orang tua/wali dari data siswa. Siswa aktif: {activeWithPhone} dari {activeTotal} sudah punya nomor HP.
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={isLoading || filtered.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Ekspor CSV ({filtered.length})
          </Button>
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Cari nama, NIS, wali, atau nomor HP…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Kelas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kelas</SelectItem>
                {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
            <Select value={contact} onValueChange={(v) => setContact(v as 'all' | 'with' | 'without')}>
              <SelectTrigger><SelectValue placeholder="Nomor HP" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua (ada/belum ada HP)</SelectItem>
                <SelectItem value="with">Sudah ada nomor HP</SelectItem>
                <SelectItem value="without">Belum ada nomor HP</SelectItem>
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
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : isError ? (
          <Card><CardContent className="py-10 text-center text-destructive">Gagal memuat data siswa. Muat ulang halaman.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 sm:p-2">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <SortHead label="Nama" k="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="min-w-[180px]" />
                      <SortHead label="NIS" k="nis" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Kelas" k="class" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                      <SortHead label="Orang tua/wali" k="parent" sortKey={sortKey} sortDir={sortDir} onSort={onSort} className="min-w-[150px]" />
                      <TableHead className="min-w-[200px]">No. HP</TableHead>
                      <TableHead className="min-w-[220px]">Alamat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Tidak ada siswa yang sesuai filter.</TableCell>
                      </TableRow>
                    ) : pageItems.map((s, i) => (
                      <TableRow key={s.id}>
                        <TableCell>{(safePage - 1) * pageSize + i + 1}</TableCell>
                        <TableCell className="font-medium">
                          {toTitleCase(s.full_name)}
                          {!isActiveStudent(s) && <Badge variant="secondary" className="ml-2 text-[10px]">{studentStatusLabel(s)}</Badge>}
                        </TableCell>
                        <TableCell>{s.nis ?? '-'}</TableCell>
                        <TableCell>{s.classes?.name ?? '-'}</TableCell>
                        <TableCell>{s.parent_name ? toTitleCase(s.parent_name) : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell>{phoneCell(s)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.address || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 pb-4">
                <DataPagination
                  currentPage={safePage}
                  totalPages={totalPages}
                  totalItems={filtered.length}
                  pageSize={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                  pageSizeOptions={[10, 25, 50, 100]}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
