import AdminCrudPage from "./AdminCrudPage";
import { YesNo } from "@/components/web-admin/ui";
export default function AdminPages() {
  return (
    <AdminCrudPage
      title="Halaman Profil"
      description="Kelola konten Sejarah, Visi Misi, Sambutan, Fasilitas, dan Struktur."
      table="website_pages"
      orderBy={{ column: "sort_order" }}
      listSelect="id,title,slug,section,is_published,sort_order,cover_image_url"
      thumbKey="cover_image_url"
      defaults={{ is_published: true, sort_order: 0 }}
      columns={[
        { key: "title", label: "Judul" },
        { key: "slug", label: "Slug" },
        { key: "section", label: "Section" },
        { key: "is_published", label: "Publik", render: (r) => <YesNo value={r.is_published} /> },
      ]}
      fields={[
        { key: "title", label: "Judul", required: true },
        { key: "slug", label: "Slug", required: true },
        { key: "section", label: "Section (sejarah/visi-misi/sambutan/fasilitas/struktur)", colSpan: 2 },
        { key: "cover_image_url", label: "Gambar", type: "image", colSpan: 2 },
        { key: "content", label: "Konten", type: "richtext", colSpan: 2 },
        { key: "sort_order", label: "Urutan", type: "number" },
        { key: "is_published", label: "Publikasikan", type: "boolean" },
      ]}
    />
  );
}
