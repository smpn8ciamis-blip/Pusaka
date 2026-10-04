import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWebsiteSettings } from "@/components/website/PublicLayout";
import { PageHero } from "./Profil";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MapPin, Phone, Mail, MessageCircle } from "lucide-react";

export default function Kontak() {
  const s = useWebsiteSettings();
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.message) return toast.error("Nama dan pesan wajib diisi");
    setLoading(true);
    const { error } = await (supabase.from("website_contact_messages" as any) as any).insert(form);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Pesan terkirim. Terima kasih!");
    setForm({ name: "", email: "", phone: "", subject: "", message: "" });
  };

  return (
    <div>
      <PageHero title="Hubungi Kami" subtitle="Kami siap membantu menjawab pertanyaan Anda." />
      <div className="container mx-auto px-4 py-16 grid lg:grid-cols-2 gap-10">
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-100">
            <h3 className="font-bold text-lg mb-4">Informasi Kontak</h3>
            <div className="space-y-3 text-sm">
              {s?.address && <div className="flex gap-3"><MapPin className="h-5 w-5 text-[#1E40AF] shrink-0" /><span>{s.address}</span></div>}
              {s?.phone && <div className="flex gap-3"><Phone className="h-5 w-5 text-[#1E40AF] shrink-0" /><span>{s.phone}</span></div>}
              {s?.email && <div className="flex gap-3"><Mail className="h-5 w-5 text-[#1E40AF] shrink-0" /><span>{s.email}</span></div>}
              {s?.whatsapp && <div className="flex gap-3"><MessageCircle className="h-5 w-5 text-[#1E40AF] shrink-0" /><a href={`https://wa.me/${s.whatsapp}`} target="_blank" rel="noreferrer" className="text-[#1E40AF] hover:underline">{s.whatsapp}</a></div>}
            </div>
          </div>
          {s?.map_embed_url && (() => {
            const raw = String(s.map_embed_url);
            const m = raw.match(/src=["']([^"']+)["']/i);
            const src = m ? m[1] : raw;
            return (
              <div className="rounded-2xl overflow-hidden border border-slate-100 aspect-video">
                <iframe src={src} className="w-full h-full" title="map" loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
              </div>
            );
          })()}
        </div>
        <form onSubmit={submit} className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4">
          <h3 className="font-bold text-lg">Kirim Pesan</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="Nama *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Input placeholder="No. HP" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Subjek" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <Textarea placeholder="Pesan *" rows={6} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          <Button disabled={loading} className="bg-[#1E40AF] hover:bg-[#1E3A8A]">{loading ? "Mengirim…" : "Kirim Pesan"}</Button>
        </form>
      </div>
    </div>
  );
}
