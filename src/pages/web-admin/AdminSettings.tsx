import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Instagram, ExternalLink, Save, Loader2 } from "lucide-react";
import ImageField from "@/components/web-admin/ImageField";
import { PageHeader, cardCls } from "@/components/web-admin/ui";

type F = { key: string; label: string; type?: "textarea" | "image" };

const SECTIONS: { id: string; label: string; title: string; hint: string; fields: F[] }[] = [
  {
    id: "identitas", label: "Identitas", title: "Identitas Website", hint: "Nama, tagline, dan logo sekolah.",
    fields: [
      { key: "site_name", label: "Nama Website" },
      { key: "tagline", label: "Tagline" },
      { key: "about_short", label: "Tentang Singkat", type: "textarea" },
      { key: "logo_url", label: "Logo Sekolah", type: "image" },
    ],
  },
  {
    id: "kontak", label: "Kontak", title: "Kontak & Lokasi", hint: "Tampil di halaman Kontak dan footer.",
    fields: [
      { key: "address", label: "Alamat", type: "textarea" },
      { key: "phone", label: "Telepon" },
      { key: "email", label: "Email" },
      { key: "whatsapp", label: "WhatsApp (contoh: 6281xxx)" },
      { key: "map_embed_url", label: "Google Maps (tempel URL src ATAU seluruh kode <iframe>)", type: "textarea" },
    ],
  },
  {
    id: "sosial", label: "Sosial Media", title: "Sosial Media", hint: "Tautan akun resmi sekolah.",
    fields: [
      { key: "facebook_url", label: "Facebook URL" },
      { key: "instagram_url", label: "Instagram URL Profil" },
      { key: "youtube_url", label: "YouTube URL" },
      { key: "tiktok_url", label: "TikTok URL" },
    ],
  },
  {
    id: "seo", label: "SEO", title: "SEO", hint: "Judul dan deskripsi untuk mesin pencari dan pratinjau tautan (WhatsApp, dll.).",
    fields: [
      { key: "meta_title", label: "SEO Title" },
      { key: "meta_description", label: "SEO Description", type: "textarea" },
      { key: "meta_keywords", label: "SEO Keywords" },
    ],
  },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={`${cardCls} p-4 sm:p-6`}>
      <div className="mb-4">
        <h2 className="font-bold text-slate-900">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SwitchRow({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/70 p-3">
      <div className="min-w-0">
        <Label className="mb-0.5 block">{title}</Label>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function AdminSettings() {
  const [row, setRow] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (supabase.from("website_settings" as any) as any).select("*").order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data, error }: any) => {
      if (error) toast.error(error.message);
      setRow(data); setForm(data ?? {}); setReady(true);
    });
  }, []);

  const dirty = useMemo(() => ready && JSON.stringify(form) !== JSON.stringify(row ?? {}), [form, row, ready]);
  const set = (key: string, v: any) => setForm((p: any) => ({ ...p, [key]: v }));

  const save = async () => {
    setLoading(true);
    const q: any = supabase.from("website_settings" as any);
    const { data, error } = row
      ? await q.update(form).eq("id", row.id).select("*").maybeSingle()
      : await q.insert(form).select("*").maybeSingle();
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data) { setRow(data); setForm(data); }
    toast.success("Pengaturan disimpan");
  };

  const testInstagram = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-instagram-posts", { body: {} });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else toast.success(`Berhasil ambil ${data?.posts?.length ?? 0} postingan Instagram`);
    } catch (e: any) {
      toast.error(e.message ?? "Gagal test Instagram");
    } finally {
      setTesting(false);
    }
  };

  const field = (f: F) => (
    <div key={f.key} className={f.type ? "md:col-span-2" : ""}>
      <Label className="mb-1 block">{f.label}</Label>
      {f.type === "image" ? <ImageField value={form[f.key] ?? ""} onChange={(v) => set(f.key, v)} folder="settings" />
        : f.type === "textarea" ? <Textarea rows={3} value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
        : <Input value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />}
    </div>
  );

  return (
    <div className="max-w-4xl p-4 pb-28 sm:p-6 lg:p-8 lg:pb-8">
      <PageHeader title="Pengaturan Website" description="Identitas, kontak, sosial media, SEO, dan fitur halaman publik." />

      {!ready ? (
        <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
      ) : (
        <Tabs defaultValue="identitas" className="space-y-4">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-inset ring-slate-200/70">
            {SECTIONS.map((s) => <TabsTrigger key={s.id} value={s.id} className="rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-[#1E40AF] data-[state=active]:shadow-none">{s.label}</TabsTrigger>)}
            <TabsTrigger value="fitur" className="rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-[#1E40AF] data-[state=active]:shadow-none">Fitur Publik</TabsTrigger>
            <TabsTrigger value="instagram" className="rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-[#1E40AF] data-[state=active]:shadow-none">Instagram</TabsTrigger>
          </TabsList>

          {SECTIONS.map((s) => (
            <TabsContent key={s.id} value={s.id} className="mt-0">
              <Section title={s.title} hint={s.hint}>
                <div className="grid gap-4 md:grid-cols-2">{s.fields.map(field)}</div>
              </Section>
            </TabsContent>
          ))}

          <TabsContent value="fitur" className="mt-0">
            <Section title="Fitur Halaman Publik" hint="Aktifkan/nonaktifkan elemen yang tampil di website publik.">
              <div className="space-y-3">
                <SwitchRow title="Tombol Layanan Pengaduan (SP4N-LAPOR)" hint="Tampilkan tombol dan FAB pengaduan di beranda." checked={form.show_lapor_button ?? true} onChange={(v) => set("show_lapor_button", v)} />
                <SwitchRow title="Halaman Guru & Staff (Guru dan Tata Usaha)" hint="Tampilkan menu dan halaman Guru & Staff di website publik. Default: disembunyikan." checked={form.show_guru_page ?? false} onChange={(v) => set("show_guru_page", v)} />
                <SwitchRow title="Chatbot Asisten Sekolah" hint="Tampilkan chatbot mengambang di seluruh halaman website." checked={form.chatbot_enabled ?? true} onChange={(v) => set("chatbot_enabled", v)} />
                <div className="grid gap-4 pt-1 md:grid-cols-2">
                  <div>
                    <Label className="mb-1 block">Nama Chatbot</Label>
                    <Input placeholder="Asisten Sekolah" value={form.chatbot_name ?? ""} onChange={(e) => set("chatbot_name", e.target.value)} />
                  </div>
                  <div>
                    <Label className="mb-1 block">Pesan Sambutan Chatbot</Label>
                    <Input placeholder="Halo! Ada yang bisa saya bantu?" value={form.chatbot_welcome ?? ""} onChange={(e) => set("chatbot_welcome", e.target.value)} />
                  </div>
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="instagram" className="mt-0">
            <section className={`${cardCls} p-4 sm:p-6`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 text-white"><Instagram className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-bold text-slate-900">Instagram Auto-Feed</h2>
                  <p className="text-xs text-slate-500">Ambil 5 postingan terbaru secara otomatis via Instagram Graph API.</p>
                </div>
              </div>

              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <p className="mb-1 font-semibold">Cara mendapatkan Access Token:</p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>Instagram harus akun <b>Business/Creator</b> yang terhubung dengan Facebook Page.</li>
                  <li>Buka <a className="inline-flex items-center gap-0.5 underline" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer <ExternalLink className="h-3 w-3" /></a> atau gunakan <a className="inline-flex items-center gap-0.5 underline" href="https://developers.facebook.com/docs/instagram-basic-display-api/getting-started" target="_blank" rel="noreferrer">Instagram Basic Display <ExternalLink className="h-3 w-3" /></a>.</li>
                  <li>Buat App, generate <b>Long-Lived Access Token</b> (60 hari) &amp; copy <b>Instagram User ID</b>.</li>
                  <li>Paste di bawah, klik <b>Simpan Perubahan</b>, lalu <b>Test Ambil Feed</b>.</li>
                </ol>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <SwitchRow title="Aktifkan Auto-Fetch" hint="Jika aktif, website akan menampilkan 5 post terbaru otomatis." checked={!!form.instagram_auto_fetch} onChange={(v) => set("instagram_auto_fetch", v)} />
                </div>
                <div>
                  <Label className="mb-1 block">Instagram User ID</Label>
                  <Input placeholder="17841400000000000" value={form.instagram_user_id ?? ""} onChange={(e) => set("instagram_user_id", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Instagram Username (tanpa @)</Label>
                  <Input placeholder="sekolahku" value={form.instagram_username ?? ""} onChange={(e) => set("instagram_username", e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label className="mb-1 block">Long-Lived Access Token</Label>
                  <Textarea rows={3} placeholder="IGQ..." value={form.instagram_access_token ?? ""} onChange={(e) => set("instagram_access_token", e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block">Judul Section</Label>
                  <Input value={form.instagram_section_title ?? ""} onChange={(e) => set("instagram_section_title", e.target.value)} placeholder="Ikuti Instagram Kami" />
                </div>
                <div className="flex items-end">
                  <div className="w-full">
                    <SwitchRow title="Tampilkan Section Instagram" checked={form.instagram_section_enabled ?? true} onChange={(v) => set("instagram_section_enabled", v)} />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label className="mb-1 block">URL Post Manual (opsional — dipakai jika Auto-Fetch mati)</Label>
                  <Textarea rows={3} placeholder={"https://www.instagram.com/p/XXXX/\nhttps://www.instagram.com/p/YYYY/"} value={form.instagram_post_urls ?? ""} onChange={(e) => set("instagram_post_urls", e.target.value)} />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" onClick={testInstagram} disabled={testing || dirty} title={dirty ? "Simpan perubahan dulu" : undefined}>{testing ? "Menguji…" : "Test Ambil Feed"}</Button>
                {dirty && <span className="self-center text-xs text-slate-400">Simpan perubahan dulu sebelum menguji.</span>}
              </div>
            </section>
          </TabsContent>
        </Tabs>
      )}

      {/* Bilah simpan menempel di bawah; di HP berada di atas navigasi bawah */}
      <div className="sticky bottom-20 z-20 mt-6 flex items-center justify-end gap-3 lg:bottom-4">
        {dirty && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">Ada perubahan belum disimpan</span>}
        <Button disabled={loading || !ready} onClick={save} className="h-11 rounded-xl bg-[#1E40AF] shadow-lg hover:bg-[#1E3A8A]">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{loading ? "Menyimpan…" : "Simpan Perubahan"}
        </Button>
      </div>
    </div>
  );
}
