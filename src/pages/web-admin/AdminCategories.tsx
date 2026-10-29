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
        { key: "color", label: "Warna", render: (r) => <span className="inline-flex items-center gap-2 text-xs text-slate-600"><span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: r.color }} />{r.color}</span> },
      ]}
      fields={[
        { key: "name", label: "Nama", required: true },
        { key: "slug", label: "Slug", required: true },
        { key: "color", label: "Warna", type: "color" },
      ]}
    />
  );
}
