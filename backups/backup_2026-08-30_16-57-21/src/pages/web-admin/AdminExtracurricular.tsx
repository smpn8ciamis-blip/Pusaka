import AdminCrudPage from "./AdminCrudPage";

export default function AdminExtracurricular() {
  return (
    <AdminCrudPage
      title="Ekstrakurikuler"
      description="Kelola daftar kegiatan ekstrakurikuler yang tampil di website."
      table="extracurricular_types"
      orderBy={{ column: "name" }}
      defaults={{ is_active: true }}
      columns={[
        { key: "image_url", label: "Foto", render: (r) => r.image_url
          ? <img src={r.image_url} alt="" className="h-10 w-10 rounded object-cover" />
          : <div className="h-10 w-10 rounded bg-slate-100" /> },
        { key: "name", label: "Nama" },
        { key: "description", label: "Deskripsi", render: (r) => <span className="text-slate-600 line-clamp-1">{r.description}</span> },
        { key: "is_active", label: "Aktif", render: (r) => r.is_active ? "Ya" : "Tidak" },
      ]}
      fields={[
        { key: "name", label: "Nama Ekstrakurikuler", required: true },
        { key: "image_url", label: "URL Gambar", type: "url" },
        { key: "description", label: "Deskripsi", type: "textarea", colSpan: 2 },
        { key: "is_active", label: "Aktif", type: "boolean" },
      ]}
    />
  );
}
