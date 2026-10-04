import AdminCrudPage from "./AdminCrudPage";
export default function AdminCategories() {
  return (
    <AdminCrudPage
      title="Kategori Berita"
      table="website_news_categories"
      orderBy={{ column: "name" }}
      columns={[
        { key: "name", label: "Nama" },
        { key: "slug", label: "Slug" },
        { key: "color", label: "Warna", render: (r) => <span className="inline-block px-3 py-1 rounded text-white text-xs" style={{ background: r.color }}>{r.color}</span> },
      ]}
      fields={[
        { key: "name", label: "Nama", required: true },
        { key: "slug", label: "Slug", required: true },
        { key: "color", label: "Warna", type: "color" },
      ]}
    />
  );
}
