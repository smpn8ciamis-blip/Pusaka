// @ts-nocheck
import { streamText, convertToModelMessages, type UIMessage } from "npm:ai@5.0.0";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1.0.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

async function fetchSchoolContext() {
  try {
    const [ws, sc, news, prog] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/website_settings?select=*&order=created_at.desc&limit=1`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/school_settings?select=school_name,school_address,school_phone,school_email&order=created_at.desc&limit=1`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/website_news?select=title,excerpt,slug,published_at&status=eq.published&order=published_at.desc&limit=8`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/website_programs?select=name,description&is_published=eq.true&limit=10`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }).then(r => r.json()),
    ]);
    return { website: ws?.[0] ?? {}, school: sc?.[0] ?? {}, news: news ?? [], programs: prog ?? [] };
  } catch {
    return { website: {}, school: {}, news: [], programs: [] };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...cors, "content-type": "application/json" } });

    const { messages }: { messages: UIMessage[] } = await req.json();
    const ctx = await fetchSchoolContext();
    const schoolName = ctx.website.site_name || ctx.school.school_name || "Sekolah";
    const botName = ctx.website.chatbot_name || "Asisten Sekolah";

    const system = `Kamu adalah "${botName}", asisten virtual resmi ${schoolName}.
Tugasmu menjawab pertanyaan pengunjung website tentang sekolah dengan ramah, singkat, dan informatif dalam Bahasa Indonesia.

INFORMASI SEKOLAH:
- Nama: ${schoolName}
- Alamat: ${ctx.school.school_address || ctx.website.address || "-"}
- Telepon: ${ctx.school.school_phone || ctx.website.phone || "-"}
- Email: ${ctx.school.school_email || ctx.website.email || "-"}
- Tagline: ${ctx.website.tagline || "-"}
- Tentang: ${ctx.website.about_short || "-"}

PROGRAM/JURUSAN:
${(ctx.programs || []).map((p: any) => `- ${p.name}: ${p.description ?? ""}`).join("\n") || "-"}

BERITA TERBARU:
${(ctx.news || []).map((n: any) => `- ${n.title} (/website/berita/${n.slug})`).join("\n") || "-"}

MENU WEBSITE: Beranda (/), Profil (/website/profil), Akademik (/website/akademik), Ekstrakurikuler (/website/ekstrakurikuler), Berita (/website/berita), Galeri (/website/galeri), Guru & Staff (/website/guru), Kontak (/website/kontak), Pendaftaran (/daftar-siswa), Pengaduan SP4N-LAPOR (https://sp4n.lapor.go.id/).

ATURAN:
- Jawab hanya berdasarkan info di atas. Jika tidak tahu, sarankan menghubungi kontak sekolah atau membuka menu terkait.
- Gunakan markdown ringkas (bullet, tebal) bila membantu.
- Sertakan link relevan bila cocok.
- Jangan mengarang informasi.`;

    const gateway = createOpenAICompatible({
      name: "lovable",
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "Lovable-API-Key": key },
    });

    const result = streamText({
      model: gateway("google/gemini-3-flash-preview"),
      system,
      messages: convertToModelMessages(messages),
    });
    return result.toUIMessageStreamResponse({ headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...cors, "content-type": "application/json" } });
  }
});
