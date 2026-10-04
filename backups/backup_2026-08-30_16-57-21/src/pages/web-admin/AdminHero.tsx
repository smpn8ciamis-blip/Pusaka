import AdminCrudPage from "./AdminCrudPage";
export default function AdminHero() {
  return (
    <AdminCrudPage
      title="Slider Beranda"
      description="Kelola banner gambar di halaman utama website."
      table="website_hero_slides"
      orderBy={{ column: "sort_order" }}
      defaults={{ is_active: true, sort_order: 0 }}
      columns={[
        { key: "title", label: "Judul" },
        { key: "cta_label", label: "Tombol" },
        { key: "sort_order", label: "Urutan" },
        { key: "is_active", label: "Aktif", render: (r) => r.is_active ? "Ya" : "Tidak" },
      ]}
      fields={[
        { key: "title", label: "Judul", required: true, colSpan: 2 },
        { key: "subtitle", label: "Sub judul", type: "textarea", colSpan: 2 },
        { key: "image_url", label: "URL Gambar", required: true, type: "url", colSpan: 2 },
        { key: "cta_label", label: "Label Tombol" },
        { key: "cta_url", label: "URL Tombol", type: "url" },
        { key: "sort_order", label: "Urutan", type: "number" },
        { key: "is_active", label: "Aktif", type: "boolean" },
      ]}
    />
  );
}
