import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, ClipboardPaste, Trash2, Merge, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { RichTextDisplay } from '@/components/cbt/RichTextEditor';
import { optionToStorage } from '@/lib/cbtOption';
import { extractRtfImages, type RtfImage } from '@/lib/cbtRtf';
import { uploadRefs } from '@/lib/cbtWordImages';
import { chunk } from '@/lib/cbtMonitor';
import {
  fillImages, imageRefsIn, mergeQuestions, parseWordClipboard, type ImageRef, type ParsedQuestion,
} from '@/lib/cbtWordPaste';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  /** nomor urut soal pertama yang akan dibuat (jumlah soal sekarang + 1) */
  startNumber: number;
  onImported: (count: number) => void;
}

export function WordPasteDialog({ open, onOpenChange, examId, startNumber, onImported }: Props) {
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [images, setImages] = useState<ImageRef[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pointsPg, setPointsPg] = useState(1);
  const [pointsEssay, setPointsEssay] = useState(5);
  const [busy, setBusy] = useState<null | { label: string; pct: number }>(null);
  const [failed, setFailed] = useState<{ id: string; message: string }[]>([]);
  const rtfRef = useRef<RtfImage[]>([]);
  const rtfUsableRef = useRef(false);
  const doneUrlsRef = useRef<Record<string, string>>({}); // gambar yang sudah terunggah (tidak diunggah ulang saat mengulang)
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const objectUrlsRef = useRef<string[]>([]);

  const reset = useCallback(() => {
    objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrlsRef.current = [];
    setQuestions([]); setImages([]); setWarnings([]); setFailed([]); setPreviewUrls({}); setBusy(null);
    rtfRef.current = []; rtfUsableRef.current = false; doneUrlsRef.current = {};
  }, []);

  useEffect(() => { if (!open) reset(); }, [open, reset]);
  useEffect(() => () => { objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  const handlePaste = useCallback((html: string, text: string, rtf: string) => {
    reset();
    let res;
    try { res = parseWordClipboard({ html, text }); } catch (e: any) { toast.error('Tempelan tidak dapat dibaca: ' + (e?.message || e)); return; }
    const rtfImgs = rtf ? extractRtfImages(rtf) : [];
    const rtfNeeded = res.images.filter((i) => i.kind === 'rtf').length;
    const usable = rtfNeeded > 0 && rtfNeeded === rtfImgs.length;
    const warn = [...res.warnings];
    if (rtfNeeded > 0 && !usable) {
      warn.push(`Gambar dari Word tidak dapat dicocokkan otomatis (${rtfNeeded} gambar di teks, ${rtfImgs.length} di data salinan). Gambar dilewati; sisipkan lewat tombol Upload saat mengedit soal. Tips: tempel gambar langsung (Ctrl+V) di editor soal.`);
    }
    rtfRef.current = rtfImgs; rtfUsableRef.current = usable;
    const urls: Record<string, string> = {};
    for (const im of res.images) {
      if (im.kind === 'rtf') {
        if (usable && rtfImgs[im.rtfIndex as number]) {
          const u = URL.createObjectURL(new Blob([rtfImgs[im.rtfIndex as number].bytes], { type: rtfImgs[im.rtfIndex as number].mime }));
          objectUrlsRef.current.push(u); urls[im.id] = u;
        }
      } else urls[im.id] = im.src;
    }
    setPreviewUrls(urls); setImages(res.images); setWarnings(warn); setQuestions(res.questions);
    if (res.questions.length) toast.success(`${res.questions.length} soal terbaca. Periksa dulu sebelum disimpan.`);
    else toast.error('Tidak ada soal terbaca. Pastikan setiap soal diawali nomor (1. 2. 3.).');
  }, [reset]);

  // Tangkap Ctrl+V di mana pun di dalam dialog (kecuali saat mengetik di kolom isian)
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const cd = e.clipboardData;
      if (!cd) return;
      const html = cd.getData('text/html'); const text = cd.getData('text/plain'); const rtf = cd.getData('text/rtf');
      if (!html && !text) return;
      e.preventDefault();
      handlePaste(html, text, rtf);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open, handlePaste]);

  const setKey = (qi: number, k: number) => setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, correct: k, warnings: q.warnings.filter((w) => !/Kunci jawaban belum/.test(w)) } : q)));
  const remove = (qi: number) => setQuestions((qs) => qs.filter((_, i) => i !== qi));
  const merge = (qi: number) => setQuestions((qs) => (qi > 0 ? [...qs.slice(0, qi - 1), mergeQuestions(qs[qi - 1], qs[qi]), ...qs.slice(qi + 1)] : qs));

  const missingKey = useMemo(() => questions.filter((q) => q.type === 'multiple_choice' && q.correct === null).length, [questions]);
  const counts = useMemo(() => ({ pg: questions.filter((q) => q.type === 'multiple_choice').length, essay: questions.filter((q) => q.type === 'essay').length }), [questions]);
  const view = (html: string) => fillImages(html, previewUrls);

  const doImport = async () => {
    if (!questions.length || busy) return;
    if (missingKey) { toast.error(`${missingKey} soal pilihan ganda belum punya kunci. Pilih dulu kuncinya.`); return; }
    setFailed([]);
    try {
      const usedIds = new Set<string>();
      questions.forEach((q) => { imageRefsIn(q.questionHtml).forEach((i) => usedIds.add(i)); q.options.forEach((o) => imageRefsIn(o.html).forEach((i) => usedIds.add(i))); });
      const used = images.filter((i) => usedIds.has(i.id));
      let urls = doneUrlsRef.current;
      if (used.length) {
        setBusy({ label: `Mengunggah gambar ke Drive (0/${used.length})…`, pct: 2 });
        const r = await uploadRefs(used, rtfRef.current, rtfUsableRef.current, doneUrlsRef.current, (n, total) =>
          setBusy({ label: `Mengunggah gambar ke Drive (${n}/${total})…`, pct: 2 + Math.round((n / Math.max(1, total)) * 78) }));
        doneUrlsRef.current = r.urls; urls = r.urls;
        if (r.failed.length) { setFailed(r.failed); setBusy(null); toast.error(`${r.failed.length} gambar gagal. Soal belum disimpan; coba lagi atau hapus gambarnya.`); return; }
      }
      setBusy({ label: 'Menyimpan soal…', pct: 85 });
      const rows = questions.map((q, i) => {
        const isMc = q.type === 'multiple_choice';
        const opt = (k: number) => (isMc && q.options[k] ? optionToStorage(fillImages(q.options[k].html, urls)) : '');
        return {
          exam_id: examId,
          question_number: startNumber + i,
          question_text: fillImages(q.questionHtml, urls),
          question_type: isMc ? 'multiple_choice' : 'essay',
          option_a: isMc ? opt(0) : null,
          option_b: isMc ? opt(1) : null,
          option_c: isMc ? opt(2) : null,
          option_d: isMc ? opt(3) : null,
          option_e: isMc && q.options[4] ? opt(4) : null,
          correct_answer: isMc ? LETTERS[q.correct as number] : 'ESSAY',
          essay_answer_key: isMc ? null : (q.essayKey || ''),
          points: isMc ? pointsPg : pointsEssay,
        };
      });
      for (const part of chunk(rows, 25)) {
        const { error } = await supabase.from('cbt_questions').insert(part as never);
        if (error) throw error;
      }
      await supabase.from('cbt_exams').update({ total_questions: startNumber - 1 + rows.length }).eq('id', examId);
      toast.success(`${rows.length} soal berhasil ditambahkan`);
      onImported(rows.length);
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Gagal menyimpan: ' + (e?.message || e));
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ClipboardPaste className="h-5 w-5" /> Tempel Soal dari Word</DialogTitle>
          <DialogDescription>
            Di Word: tekan Ctrl+A lalu Ctrl+C (atau blok soal yang diinginkan). Kembali ke sini lalu tekan <b>Ctrl+V</b>.
          </DialogDescription>
        </DialogHeader>

        {!questions.length && (
          <div className="rounded-lg border-2 border-dashed p-6 text-sm space-y-3">
            <p className="text-center text-muted-foreground">Tekan <b>Ctrl+V</b> di sini untuk menempel semua soal sekaligus.</p>
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <ul className="list-disc pl-4 space-y-1">
                <li>Nomor soal: <code>1.</code> <code>2.</code> <code>3.</code> (berurutan)</li>
                <li>Pilihan: <code>A.</code> <code>B.</code> <code>C.</code> <code>D.</code> (maks. E), boleh satu baris satu pilihan atau berderet</li>
                <li><b>Kunci jawaban: tandai pilihan yang benar dengan huruf berwarna MERAH</b> (atau tulis baris <code>Kunci: B</code>)</li>
              </ul>
              <ul className="list-disc pl-4 space-y-1">
                <li>Soal uraian: soal tanpa pilihan; kunci uraian ditulis merah atau <code>Jawaban: …</code></li>
                <li>Gambar, tabel, tebal/miring, pangkat/indeks, dan simbol ikut terbawa</li>
                <li>Hasil tempel bisa diperiksa dan diperbaiki sebelum disimpan</li>
              </ul>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs space-y-1">
            {warnings.map((w, i) => <p key={i} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />{w}</p>)}
          </div>
        )}

        {questions.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{questions.length} soal</Badge>
              <Badge variant="outline">{counts.pg} pilihan ganda</Badge>
              <Badge variant="outline">{counts.essay} uraian</Badge>
              {images.length > 0 && <Badge variant="outline">{images.length} gambar</Badge>}
              {missingKey > 0 && <Badge variant="destructive">{missingKey} belum ada kunci</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <Label className="text-xs">Poin PG</Label><Input type="number" min={0} value={pointsPg} onChange={(e) => setPointsPg(Number(e.target.value) || 0)} className="h-8 w-16" />
                <Label className="text-xs">Poin uraian</Label><Input type="number" min={0} value={pointsEssay} onChange={(e) => setPointsEssay(Number(e.target.value) || 0)} className="h-8 w-16" />
                <Button size="sm" variant="ghost" onClick={reset} disabled={!!busy}>Tempel ulang</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
              {questions.map((q, qi) => (
                <div key={q.uid} className={`rounded-lg border p-3 space-y-2 ${q.warnings.length ? 'border-amber-300' : ''}`}>
                  <div className="flex items-center gap-2">
                    <Badge>{startNumber + qi}</Badge>
                    <span className="text-xs text-muted-foreground">{q.type === 'multiple_choice' ? 'Pilihan ganda' : 'Uraian'}{q.number != null && q.number !== qi + 1 ? ` · nomor di Word: ${q.number}` : ''}</span>
                    <div className="ml-auto flex gap-1">
                      {qi > 0 && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => merge(qi)} title="Dipecah keliru? Gabungkan ke soal sebelumnya" disabled={!!busy}><Merge className="h-3.5 w-3.5 mr-1" />Gabung ke atas</Button>}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(qi)} title="Buang soal ini" disabled={!!busy}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <RichTextDisplay html={view(q.questionHtml)} className="text-sm" />
                  {q.type === 'multiple_choice' ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {q.options.map((o, k) => (
                        <button
                          key={k} type="button" onClick={() => setKey(qi, k)} disabled={!!busy}
                          className={`flex items-start gap-2 rounded-md border p-2 text-left text-sm transition-colors ${q.correct === k ? 'border-green-500 bg-green-50 dark:bg-green-950/30' : 'hover:bg-muted'}`}
                          title="Klik untuk menjadikan kunci jawaban"
                        >
                          <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${q.correct === k ? 'bg-green-600 text-white' : 'bg-muted'}`}>{LETTERS[k]}</span>
                          <span className="min-w-0 flex-1"><RichTextDisplay html={view(o.html)} className="text-sm [&_p]:my-0" /></span>
                          {q.correct === k && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md bg-muted/50 p-2 text-xs"><b>Kunci uraian:</b> {q.essayKey || <span className="text-muted-foreground">(kosong)</span>}</div>
                  )}
                  {q.warnings.map((w, i) => <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}</p>)}
                </div>
              ))}
            </div>
          </>
        )}

        {failed.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-2.5 text-xs space-y-1">
            <p className="font-semibold">{failed.length} gambar belum tersimpan (soal belum disimpan):</p>
            {failed.slice(0, 4).map((f) => <p key={f.id}>• {f.message}</p>)}
            <p>Klik "Simpan Semua" lagi untuk mencoba ulang (gambar yang sudah terunggah tidak diulang).</p>
          </div>
        )}

        {busy && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{busy.label}</p>
            <Progress value={busy.pct} />
          </div>
        )}

        {questions.length > 0 && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!busy}>Batal</Button>
            <Button onClick={doImport} disabled={!!busy || !questions.length}>Simpan Semua ({questions.length} soal)</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
