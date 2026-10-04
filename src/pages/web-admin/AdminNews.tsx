import AdminCrudPage from "./AdminCrudPage";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function AdminNews() {
  const [cats, setCats] = useState<any[]>([]);
  useEffect(() => {
    (supabase.from("website_news_categories" as any) as any).select("*").then(({ data }: any) => setCats(data ?? []));
  }, []);
  return (
    <AdminCrudPage
      title="Berita"
      description="Kelola artikel dan berita yang tampil di website."
      table="website_news"
      orderBy={{ column: "created_at", ascending: false }}
      extraSelect="*, website_news_categories(name,color)"
      defaults={{ status: "draft", is_featured: false }}
      columns={[
        { key: "title", label: "Judul" },
        { key: "status", label: "Status", render: (r) => <span className={`px-2 py-0.5 rounded text-xs ${r.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</span> },
        { key: "category", label: "Kategori", render: (r) => r.website_news_categories?.name ?? "—" },
        { key: "published_at", label: "Publikasi", render: (r) => r.published_at ? new Date(r.published_at).toLocaleDateString("id-ID") : "—" },
      ]}
      fields={[
        { key: "title", label: "Judul", required: true, colSpan: 2 },
        { key: "slug", label: "Slug URL", required: true, placeholder: "contoh-berita" },
        { key: "category_id", label: "Kategori", type: "select", options: cats.map((c) => ({ value: c.id, label: c.name })) },
        { key: "cover_image_url", label: "URL Gambar Cover", type: "url", colSpan: 2 },
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
