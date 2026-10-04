import AdminCrudPage from "./AdminCrudPage";
export default function AdminPrograms() {
  return (
    <AdminCrudPage
      title="Program"
      description="Kelola program/jurusan yang tampil di halaman Akademik."
      table="website_programs"
      orderBy={{ column: "sort_order" }}
      defaults={{ is_published: true, sort_order: 0 }}
      columns={[
        { key: "name", label: "Nama Program" },
        { key: "slug", label: "Slug" },
        { key: "sort_order", label: "Urutan" },
        { key: "is_published", label: "Publik", render: (r) => r.is_published ? "Ya" : "Tidak" },
      ]}
      fields={[
        { key: "name", label: "Nama Program", required: true },
        { key: "slug", label: "Slug", required: true },
        { key: "description", label: "Deskripsi", type: "textarea", colSpan: 2 },
        { key: "cover_image_url", label: "URL Gambar", type: "url", colSpan: 2 },
        { key: "sort_order", label: "Urutan", type: "number" },
        { key: "is_published", label: "Publikasikan", type: "boolean" },
      ]}
    />
  );
}
