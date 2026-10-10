import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DbTeacher, ExistingSchedule, Grid, ParsedWorkbook, TeacherMatch,
  buildPlan, classKey, defaultSubject, matchTeacher, parseWorkbookSheets,
} from '@/lib/scheduleGridImport';

const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function ImportScheduleGrid() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedYear, activeYear, selectedSemester } = useAcademicYear();
  const year = selectedYear || activeYear?.year || '';

  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [parseError, setParseError] = useState('');
  const [teacherByName, setTeacherByName] = useState<Record<string, string>>({});
  const [matchByName, setMatchByName] = useState<Record<string, TeacherMatch>>({});
  const [classByLabel, setClassByLabel] = useState<Record<string, string>>({});
  const [subjectByCode, setSubjectByCode] = useState<Record<string, string>>({});
  const [merge, setMerge] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  /* ---------- data database ---------- */
  const { data: dbTeachers = [], isLoading: loadingTeachers } = useQuery({
    queryKey: ['import-grid-teachers'],
    queryFn: async (): Promise<DbTeacher[]> => {
      const { data: t, error } = await supabase.from('teachers').select('id, user_id, nip, subject');
      if (error) throw error;
      const ids = (t || []).map((x) => x.user_id).filter(Boolean);
      const { data: p, error: pe } = await supabase.from('profiles').select('id, full_name').in('id', ids);
      if (pe) throw pe;
      const nameById = new Map((p || []).map((x) => [x.id, x.full_name]));
      return (t || [])
        .map((x) => ({ id: x.id, name: nameById.get(x.user_id) || '', nip: x.nip, subject: x.subject }))
        .filter((x) => x.name);
    },
  });

  const { data: dbClasses = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['import-grid-classes', year],
    enabled: !!year,
    queryFn: async () => {
      const { data, error } = await supabase.from('classes').select('id, name, academic_year').eq('academic_year', year);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: existing = [], isLoading: loadingExisting } = useQuery({
    queryKey: ['import-grid-existing', year, selectedSemester],
    enabled: !!year,
    queryFn: async (): Promise<ExistingSchedule[]> => {
      const { data, error } = await supabase
        .from('schedules')
        .select('id, class_id, teacher_id, day_of_week, start_time, end_time, subject')
        .eq('academic_year', year)
        .eq('semester', selectedSemester);
      if (error) throw error;
      return (data || []) as ExistingSchedule[];
    },
  });

  const teacherOptions = useMemo(
    () => dbTeachers.map((t) => ({ value: t.id, label: t.name, description: t.subject || undefined })),
    [dbTeachers],
  );
  const teacherNameById = useMemo(() => Object.fromEntries(dbTeachers.map((t) => [t.id, t.name])), [dbTeachers]);
  const classOptions = useMemo(
    () => [...dbClasses].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.id, label: c.name })),
    [dbClasses],
  );

  /* ---------- baca file ---------- */
  const autoMap = (p: ParsedWorkbook) => {
    const names = Array.from(new Set(p.teachers.map((t) => t.name)));
    const tmap: Record<string, string> = {};
    const mmap: Record<string, TeacherMatch> = {};
    for (const n of names) {
      const m = matchTeacher(n, dbTeachers);
      tmap[n] = m.teacherId;
      mmap[n] = m;
    }
    setTeacherByName(tmap);
    setMatchByName(mmap);

    const byKey = new Map(dbClasses.map((c) => [classKey(c.name), c.id]));
    setClassByLabel(Object.fromEntries(p.classLabels.map((l) => [l, byKey.get(classKey(l)) || ''])));
    setSubjectByCode(Object.fromEntries(p.teachers.map((t) => [t.code, defaultSubject(t.subject)])));
    setConfirmed(false);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParseError('');
    setParsed(null);
    setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheets: Record<string, Grid> = {};
      for (const n of wb.SheetNames) {
        sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: true, defval: null }) as Grid;
      }
      const p = parseWorkbookSheets(sheets);
      setParsed(p);
      autoMap(p);
    } catch (err: any) {
      setParseError(err.message || String(err));
    }
  };

  /* ---------- rencana impor ---------- */
  const teacherIdByCode = useMemo(() => {
    const r: Record<string, string> = {};
    parsed?.teachers.forEach((t) => { r[t.code] = teacherByName[t.name] || ''; });
    return r;
  }, [parsed, teacherByName]);

  const plan = useMemo(() => {
    if (!parsed) return null;
    return buildPlan({
      slots: parsed.slots,
      teachers: parsed.teachers,
      teacherIdByCode,
      teacherNameById,
      classIdByLabel: classByLabel,
      subjectByCode,
      existing,
      mergeContiguous: merge,
    });
  }, [parsed, teacherIdByCode, teacherNameById, classByLabel, subjectByCode, existing, merge]);

  const names = useMemo(() => Array.from(new Set(parsed?.teachers.map((t) => t.name) || [])), [parsed]);
  const needCheck = names.filter((n) => matchByName[n]?.status === 'periksa' && teacherByName[n] === matchByName[n]?.teacherId);
  const unmappedNames = names.filter((n) => !teacherByName[n]);
  const unmappedClasses = (parsed?.classLabels || []).filter((l) => !classByLabel[l]);
  const emptySubjects = (parsed?.teachers || []).filter((t) => teacherByName[t.name] && !subjectByCode[t.code]?.trim());
  const canImport = !!plan && plan.rows.length > 0 && !importing && emptySubjects.length === 0 && (needCheck.length === 0 || confirmed);

  const doImport = async () => {
    if (!plan || !year) return;
    setImporting(true);
    setProgress(0);
    try {
      const payload = plan.rows.map((r) => ({
        class_id: r.class_id,
        teacher_id: r.teacher_id,
        subject: r.subject,
        day_of_week: r.day_of_week,
        start_time: `${r.start}:00`,
        end_time: `${r.end}:00`,
        semester: selectedSemester,
        academic_year: year,
      }));
      const size = 100;
      for (let i = 0; i < payload.length; i += size) {
        const { error } = await supabase.from('schedules').insert(payload.slice(i, i + size));
        if (error) throw new Error(`Gagal pada baris ${i + 1}-${Math.min(i + size, payload.length)}: ${error.message}`);
        setProgress(Math.min(100, Math.round(((i + size) / payload.length) * 100)));
      }
      toast.success(`${payload.length} jadwal berhasil diimport`);
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
      queryClient.invalidateQueries({ queryKey: ['import-grid-existing'] });
      setParsed(null);
      setFileName('');
    } catch (err: any) {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ['import-grid-existing'] });
    } finally {
      setImporting(false);
    }
  };

  const statusBadge = (n: string) => {
    const m = matchByName[n];
    const chosen = teacherByName[n];
    if (!chosen) return <Badge variant="destructive">Belum dipilih</Badge>;
    if (m && chosen === m.teacherId) {
      return m.status === 'cocok'
        ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Cocok</Badge>
        : <Badge className="bg-amber-500 hover:bg-amber-500">Periksa ({Math.round(m.score * 100)}%)</Badge>;
    }
    return <Badge variant="secondary">Dipilih manual</Badge>;
  };

  const loadingDb = loadingTeachers || loadingClasses || loadingExisting;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/schedules')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Jadwal
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Import Jadwal dari Excel Dinas</h1>
          <p className="text-sm text-muted-foreground">
            Format: sheet "Pemetaan Guru" (kode guru) + sheet "Jadwal Pelajaran" (grid hari × jam × kelas).
            Tujuan: TP {year || '-'} • Semester {selectedSemester}. Ganti dari filter tahun/semester di halaman Jadwal bila perlu.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Pilih file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={onFile}
              disabled={loadingDb || importing}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-2"
            />
            {loadingDb && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Memuat data guru, kelas, dan jadwal…</p>}
            {fileName && !parseError && parsed && (
              <p className="text-sm flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> {fileName}: {parsed.teachers.length} baris kode guru, {parsed.slots.length} slot jam, {parsed.classLabels.length} kelas</p>
            )}
            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
            {parsed?.warnings.map((w, i) => <p key={i} className="text-xs text-amber-600">{w}</p>)}
          </CardContent>
        </Card>

        {parsed && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Cocokkan guru dengan database</CardTitle>
                <CardDescription>
                  Nama di file dicocokkan otomatis (gelar & ejaan diabaikan). Periksa baris kuning/merah, lalu pilih guru yang benar.
                  Kode tambahan (mis. 7a) mengikuti guru yang sama dan hanya beda mata pelajaran.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama di file</TableHead>
                        <TableHead className="min-w-[16rem]">Guru di database</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="min-w-[14rem]">Kode → mata pelajaran</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {names.map((n) => (
                        <TableRow key={n}>
                          <TableCell className="align-top text-sm">{n}</TableCell>
                          <TableCell className="align-top">
                            <SearchableSelect
                              options={teacherOptions}
                              value={teacherByName[n] || ''}
                              onValueChange={(v) => setTeacherByName((s) => ({ ...s, [n]: v }))}
                              placeholder="Pilih guru…"
                              searchPlaceholder="Cari nama guru…"
                            />
                          </TableCell>
                          <TableCell className="align-top">{statusBadge(n)}</TableCell>
                          <TableCell className="align-top space-y-1">
                            {parsed.teachers.filter((t) => t.name === n).map((t) => (
                              <div key={t.code} className="flex items-center gap-2">
                                <span className="w-8 text-xs text-muted-foreground">{t.code}</span>
                                <Input
                                  className="h-8"
                                  value={subjectByCode[t.code] ?? ''}
                                  onChange={(e) => setSubjectByCode((s) => ({ ...s, [t.code]: e.target.value }))}
                                />
                              </div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Cocokkan kelas</CardTitle>
                <CardDescription>Hanya kelas pada TP {year} yang ditampilkan.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {parsed.classLabels.map((l) => (
                  <div key={l} className="flex items-center gap-2">
                    <span className="w-14 text-sm">{l}</span>
                    <SearchableSelect
                      options={classOptions}
                      value={classByLabel[l] || ''}
                      onValueChange={(v) => setClassByLabel((s) => ({ ...s, [l]: v }))}
                      placeholder="Pilih kelas…"
                      searchPlaceholder="Cari kelas…"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">4. Opsi & hasil pemeriksaan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Switch id="merge" checked={merge} onCheckedChange={setMerge} />
                  <div>
                    <Label htmlFor="merge">Gabungkan jam berurutan menjadi satu jadwal</Label>
                    <p className="text-xs text-muted-foreground">
                      Mis. IPA jam 1–3 menjadi 07:15–09:15 (satu jurnal). Nonaktifkan untuk satu jadwal per jam pelajaran.
                      Istirahat tidak ikut digabung.
                    </p>
                  </div>
                </div>

                {plan && (
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Stat label="Akan ditambahkan" value={plan.rows.length} tone="ok" />
                    <Stat label="Sudah ada di database (dilewati)" value={plan.alreadyExists} />
                    <Stat label="Bentrok (dilewati)" value={plan.conflicts.length} tone={plan.conflicts.length ? 'warn' : undefined} />
                    <Stat label="Tanpa guru/kelas (dilewati)" value={plan.skippedNoTeacher + plan.skippedNoClass} tone={plan.skippedNoTeacher + plan.skippedNoClass ? 'warn' : undefined} />
                  </div>
                )}

                {(unmappedNames.length > 0 || unmappedClasses.length > 0) && (
                  <p className="text-sm text-amber-600 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    Belum dipetakan — guru: {unmappedNames.join('; ') || '-'}; kelas: {unmappedClasses.join(', ') || '-'}.
                    Jadwal terkait tidak akan diimport.
                  </p>
                )}
                {emptySubjects.length > 0 && (
                  <p className="text-sm text-destructive">Mata pelajaran kosong untuk kode: {emptySubjects.map((t) => t.code).join(', ')}</p>
                )}

                {plan && plan.conflicts.length > 0 && (
                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Lihat {plan.conflicts.length} bentrok</summary>
                    <ul className="mt-2 space-y-1 text-xs max-h-64 overflow-auto">
                      {plan.conflicts.map((c, i) => (
                        <li key={i}>{DAY_NAMES[c.day]} {c.start}-{c.end} • {c.classLabel} • {c.teacherName}: {c.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {plan && plan.rows.length > 0 && (
                  <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Pratinjau {plan.rows.length} jadwal baru</summary>
                    <div className="mt-2 max-h-80 overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow><TableHead>Hari</TableHead><TableHead>Jam</TableHead><TableHead>Kelas</TableHead><TableHead>Mapel</TableHead><TableHead>Guru</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                          {plan.rows.slice(0, 300).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell>{DAY_NAMES[r.day_of_week]}</TableCell>
                              <TableCell>{r.start}-{r.end}</TableCell>
                              <TableCell>{r.classLabel}</TableCell>
                              <TableCell>{r.subject}</TableCell>
                              <TableCell className="text-xs">{teacherNameById[r.teacher_id] || r.teacherName}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {plan.rows.length > 300 && <p className="text-xs text-muted-foreground mt-1">Menampilkan 300 pertama.</p>}
                    </div>
                  </details>
                )}

                {needCheck.length > 0 && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
                    <span>Saya sudah memeriksa pemetaan guru bertanda kuning ({needCheck.length} guru).</span>
                  </label>
                )}

                <div className="flex items-center gap-3">
                  <Button onClick={doImport} disabled={!canImport}>
                    {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    Import {plan?.rows.length ?? 0} Jadwal
                  </Button>
                  {importing && <span className="text-sm text-muted-foreground">{progress}%</span>}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Jadwal yang sudah ada tidak diubah atau dihapus; hanya jam yang belum ada yang ditambahkan.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : '';
  return (
    <div className="rounded-lg border p-3">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
