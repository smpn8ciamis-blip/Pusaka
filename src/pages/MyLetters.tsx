import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LetterAttachmentsPanel } from "@/components/letters/LetterAttachmentsPanel";
import { Loader2, FileSignature, Search } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { toast } from "sonner";

interface LetterRow {
  id: string;
  letter_number: string;
  letter_date: string;
  title: string;
  subtitle: string;
  teacherIds: string[];
  teacherNames: string[];
}

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd MMM yyyy", { locale: idLocale }) : "-";

export default function MyLetters() {
  const { user, userRole } = useAuth();
  const isTeacher = userRole === "teacher";

  const [loading, setLoading] = useState(true);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<LetterRow[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        let myTeacherId: string | null = null;
        if (isTeacher) {
          const { data: t } = await supabase
            .from("teachers")
            .select("id")
            .eq("user_id", user.id)
            .maybeSingle();
          myTeacherId = t?.id ?? null;
          setTeacherId(myTeacherId);
        }

        const { data: al, error: alErr } = await supabase
          .from("assignment_letters")
          .select(
            "id, letter_number, letter_date, description, location, assignment_type, assignment_letter_teachers(teacher_id)"
          )
          .order("letter_date", { ascending: false });
        if (alErr) throw alErr;

        const teacherIdsNeeded = new Set<string>();
        const mapAl: LetterRow[] = (al ?? []).map((r: any) => {
          const ids = (r.assignment_letter_teachers ?? []).map(
            (x: any) => x.teacher_id
          );
          ids.forEach((i: string) => teacherIdsNeeded.add(i));
          return {
            id: r.id,
            letter_number: r.letter_number,
            letter_date: r.letter_date,
            title: r.description || r.assignment_type || "Surat Tugas",
            subtitle: r.location || "",
            teacherIds: ids,
            teacherNames: [],
          };
        });

        // Resolve teacher names
        const names = new Map<string, string>();
        if (teacherIdsNeeded.size) {
          const { data: teachers } = await supabase
            .from("teachers")
            .select("id, user_id")
            .in("id", Array.from(teacherIdsNeeded));
          const userIds = (teachers ?? [])
            .map((t: any) => t.user_id)
            .filter(Boolean);
          if (userIds.length) {
            const { data: profs } = await supabase
              .from("profiles_public")
              .select("id, full_name")
              .in("id", userIds);
            const byUser = new Map(
              (profs ?? []).map((p: any) => [p.id, p.full_name])
            );
            (teachers ?? []).forEach((t: any) =>
              names.set(t.id, byUser.get(t.user_id) ?? "Guru")
            );
          }
        }

        const withNames = mapAl.map((r) => ({
          ...r,
          teacherNames: r.teacherIds.map((i) => names.get(i) ?? "Guru"),
        }));

        const filtered =
          isTeacher && myTeacherId
            ? withNames.filter((r) => r.teacherIds.includes(myTeacherId!))
            : withNames;

        setAssignments(filtered);
      } catch (e: any) {
        toast.error(e.message ?? "Gagal memuat data surat");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, isTeacher]);

  const q = search.toLowerCase().trim();
  const filteredAssignments = useMemo(() => {
    if (!q) return assignments;
    return assignments.filter(
      (r) =>
        r.letter_number?.toLowerCase().includes(q) ||
        r.title?.toLowerCase().includes(q) ||
        r.subtitle?.toLowerCase().includes(q) ||
        r.teacherNames.some((n) => n.toLowerCase().includes(q))
    );
  }, [assignments, q]);

  const renderList = (rows: LetterRow[]) => {
    if (!rows.length) {
      return (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Belum ada surat tugas.
        </p>
      );
    }
    return (
      <Accordion type="single" collapsible className="w-full">
        {rows.map((r) => (
          <AccordionItem key={r.id} value={r.id}>
            <AccordionTrigger className="text-left">
              <div className="flex flex-col gap-1 pr-2">
                <span className="font-medium">
                  {r.letter_number || "(tanpa nomor)"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {fmt(r.letter_date)} • {r.title}
                  {r.subtitle ? ` — ${r.subtitle}` : ""}
                </span>
                {!isTeacher && r.teacherNames.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {r.teacherNames.map((n, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {n}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <LetterAttachmentsPanel
                letterType="assignment"
                letterId={r.id}
                letterNumber={r.letter_number}
                teacherId={isTeacher ? teacherId ?? undefined : undefined}
                canUpload={isTeacher && !!teacherId}
                teacherName={isTeacher ? undefined : r.teacherNames.join(", ")}
                destination={r.subtitle}
                purpose={r.title}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Surat Tugas</h1>
          <p className="text-sm text-muted-foreground">
            {isTeacher
              ? "Surat tugas yang menugaskan Anda. Unggah foto bukti kunjungan dan berkas PDF."
              : "Lihat, unduh, dan cetak lampiran bukti kunjungan serta berkas PDF yang diunggah guru."}
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Cari nomor surat, keperluan, atau nama guru…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSignature className="h-4 w-4" />
                Daftar Surat Tugas ({filteredAssignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>{renderList(filteredAssignments)}</CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}