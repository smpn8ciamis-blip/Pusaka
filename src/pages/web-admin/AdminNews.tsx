import AdminCrudPage from "./AdminCrudPage";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pill, fmtDate } from "@/components/web-admin/ui";

export default function AdminNews() {
  const { data: cats = [] } = useQuery({
    queryKey: ["web-admin", "news-categories-options"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await (supabase.from("website_news_categories" as any) as any).select("id,name").order("name");
      return (data ?? []) as any[];
    },
  });
  return (
    <AdminCrudPage
      title="Berita"
      description="Kelola artikel dan berita yang tampil di website."
      table="website_news"
      orderBy={{ column: "created_at", ascending: false }}
      // Daftar tidak memuat isi berita (kolom besar); isi lengkap diambil saat Edit.
      listSelect="id,title,slug,status,published_at,created_at,cover_image_url,category_id,website_news_categories(name,color)"
      thumbKey="cover_image_url"
      defaults={{ status: "draft", is_featured: false }}
      columns={[
        { key: "title", label: "Judul" },
        { key: "status", label: "Status", render: (r) => <Pill tone={r.status === "published" ? "green" : "amber"}>{r.status === "published" ? "Terbit" : "Draft"}</Pill> },
        { key: "category", label: "Kategori", render: (r) => r.website_news_categories?.name ?? "—" },
        { key: "published_at", label: "Publikasi", render: (r) => fmtDate(r.published_at) },
      ]}
      fields={[
        { key: "title", label: "Judul", required: true, colSpan: 2 },
        { key: "slug", label: "Slug URL", required: true, placeholder: "contoh-berita" },
        { key: "category_id", label: "Kategori", type: "select", options: cats.map((c) => ({ value: c.id, label: c.name })) },
        { key: "cover_image_url", label: "Gambar Cover", type: "image", colSpan: 2 },
        { key: "excerpt", label: "Ringkasan", type: "textarea", colSpan: 2 },
        { key: "content", label: "Isi Berita", type: "richtext", colSpan: 2 },
        { key: "author_name", label: "Penulis" },
        { key: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }] },
        { key: "published_at", label: "Tanggal Publikasi", type: "datetime", colSpan: 2 },
        { key: "is_featured", label: "Berita Utama", type: "boolean" },
      ]}
    />
  );
}
