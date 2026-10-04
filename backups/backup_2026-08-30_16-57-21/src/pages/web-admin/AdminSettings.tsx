import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Instagram, ExternalLink } from "lucide-react";

const FIELDS: { key: string; label: string; type?: string; hint?: string }[] = [
  { key: "site_name", label: "Nama Website" },
  { key: "tagline", label: "Tagline" },
  { key: "about_short", label: "Tentang Singkat", type: "textarea" },
  { key: "address", label: "Alamat", type: "textarea" },
  { key: "phone", label: "Telepon" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp (contoh: 6281xxx)" },
  { key: "logo_url", label: "URL Logo" },
  { key: "facebook_url", label: "Facebook URL" },
  { key: "instagram_url", label: "Instagram URL Profil" },
  { key: "youtube_url", label: "YouTube URL" },
  { key: "tiktok_url", label: "TikTok URL" },
  { key: "map_embed_url", label: "Google Maps (tempel URL src ATAU seluruh kode <iframe>)", type: "textarea" },
  { key: "meta_title", label: "SEO Title" },
  { key: "meta_description", label: "SEO Description", type: "textarea" },
  { key: "meta_keywords", label: "SEO Keywords" },
];

export default function AdminSettings() {
  const [row, setRow] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (supabase.from("website_settings" as any) as any).select("*").order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }: any) => {
      setRow(data); setForm(data ?? {});
    });
  }, []);

  const save = async () => {
    setLoading(true);
    const q: any = supabase.from("website_settings" as any);
    const { error } = row ? await q.update(form).eq("id", row.id) : await q.insert(form);
    setLoading(false);
    if (error) return toast.error(error.message);
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

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Pengaturan Website</h1>
        <p className="text-sm text-slate-500">Identitas, kontak, sosial media, dan SEO.</p>
      </div>

      <div className="bg-white rounded-2xl border p-6 grid md:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.type === "textarea" ? "md:col-span-2" : ""}>
            <Label className="mb-1 block">{f.label}</Label>
            {f.type === "textarea"
              ? <Textarea rows={3} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              : <Input value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />}
          </div>
        ))}
      </div>

      {/* Fitur Halaman Publik */}
      <div className="bg-white rounded-2xl border p-6 mt-6 space-y-4">
        <div>
          <h2 className="font-bold text-slate-900">Fitur Halaman Publik</h2>
          <p className="text-xs text-slate-500">Aktif/nonaktifkan elemen yang tampil di website publik.</p>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="mb-0.5">Tombol Layanan Pengaduan (SP4N-LAPOR)</Label>
            <p className="text-xs text-slate-500">Tampilkan tombol dan FAB pengaduan di beranda.</p>
          </div>
          <Switch checked={form.show_lapor_button ?? true} onCheckedChange={(v) => setForm({ ...form, show_lapor_button: v })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="mb-0.5">Chatbot Asisten Sekolah</Label>
            <p className="text-xs text-slate-500">Tampilkan chatbot mengambang di seluruh halaman website.</p>
          </div>
          <Switch checked={form.chatbot_enabled ?? true} onCheckedChange={(v) => setForm({ ...form, chatbot_enabled: v })} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1 block">Nama Chatbot</Label>
            <Input placeholder="Asisten Sekolah" value={form.chatbot_name ?? ""} onChange={(e) => setForm({ ...form, chatbot_name: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block">Pesan Sambutan Chatbot</Label>
            <Input placeholder="Halo! Ada yang bisa saya bantu?" value={form.chatbot_welcome ?? ""} onChange={(e) => setForm({ ...form, chatbot_welcome: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Instagram Auto-Feed */}
      <div className="bg-white rounded-2xl border p-6 mt-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 text-white flex items-center justify-center"><Instagram className="h-5 w-5" /></div>
          <div>
            <h2 className="font-bold text-slate-900">Instagram Auto-Feed</h2>
            <p className="text-xs text-slate-500">Ambil 5 postingan terbaru secara otomatis via Instagram Graph API.</p>
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 mb-4 text-xs text-amber-900">
          <p className="font-semibold mb-1">Cara mendapatkan Access Token:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Instagram harus akun <b>Business/Creator</b> yang terhubung dengan Facebook Page.</li>
            <li>Buka <a className="underline inline-flex items-center gap-0.5" href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">Graph API Explorer <ExternalLink className="h-3 w-3" /></a> atau gunakan <a className="underline inline-flex items-center gap-0.5" href="https://developers.facebook.com/docs/instagram-basic-display-api/getting-started" target="_blank" rel="noreferrer">Instagram Basic Display <ExternalLink className="h-3 w-3" /></a>.</li>
            <li>Buat App, generate <b>Long-Lived Access Token</b> (60 hari) & copy <b>Instagram User ID</b>.</li>
            <li>Paste di bawah, klik <b>Simpan</b>, lalu <b>Test Ambil Feed</b>.</li>
          </ol>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="mb-0.5">Aktifkan Auto-Fetch</Label>
              <p className="text-xs text-slate-500">Jika aktif, website akan menampilkan 5 post terbaru otomatis.</p>
            </div>
            <Switch checked={!!form.instagram_auto_fetch} onCheckedChange={(v) => setForm({ ...form, instagram_auto_fetch: v })} />
          </div>
          <div>
            <Label className="mb-1 block">Instagram User ID</Label>
            <Input placeholder="17841400000000000" value={form.instagram_user_id ?? ""} onChange={(e) => setForm({ ...form, instagram_user_id: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block">Instagram Username (tanpa @)</Label>
            <Input placeholder="sekolahku" value={form.instagram_username ?? ""} onChange={(e) => setForm({ ...form, instagram_username: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block">Long-Lived Access Token</Label>
            <Textarea rows={3} placeholder="IGQ..." value={form.instagram_access_token ?? ""} onChange={(e) => setForm({ ...form, instagram_access_token: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block">Judul Section</Label>
            <Input value={form.instagram_section_title ?? ""} onChange={(e) => setForm({ ...form, instagram_section_title: e.target.value })} placeholder="Ikuti Instagram Kami" />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label>Tampilkan Section Instagram</Label>
            <Switch checked={form.instagram_section_enabled ?? true} onCheckedChange={(v) => setForm({ ...form, instagram_section_enabled: v })} />
          </div>
          <div className="md:col-span-2">
            <Label className="mb-1 block">URL Post Manual (opsional — dipakai jika Auto-Fetch mati)</Label>
            <Textarea rows={3} placeholder={"https://www.instagram.com/p/XXXX/\nhttps://www.instagram.com/p/YYYY/"} value={form.instagram_post_urls ?? ""} onChange={(e) => setForm({ ...form, instagram_post_urls: e.target.value })} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={testInstagram} disabled={testing}>{testing ? "Menguji…" : "Test Ambil Feed"}</Button>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button disabled={loading} onClick={save} className="bg-[#1E40AF] hover:bg-[#1E3A8A]">{loading ? "Menyimpan…" : "Simpan Perubahan"}</Button>
      </div>
    </div>
  );
}
