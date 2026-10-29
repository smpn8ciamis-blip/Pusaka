import AdminCrudPage from "./AdminCrudPage";
import { YesNo } from "@/components/web-admin/ui";

export default function AdminExtracurricular() {
  return (
    <AdminCrudPage
      title="Ekstrakurikuler"
      description="Kelola daftar kegiatan ekstrakurikuler yang tampil di website."
      table="extracurricular_types"
      orderBy={{ column: "name" }}
      thumbKey="image_url"
      defaults={{ is_active: true }}
      columns={[
        { key: "name", label: "Nama" },
        { key: "description", label: "Deskripsi", render: (r) => <span className="text-slate-600 line-clamp-1">{r.description}</span> },
        { key: "is_active", label: "Aktif", render: (r) => <YesNo value={r.is_active} /> },
      ]}
      fields={[
        { key: "name", label: "Nama Ekstrakurikuler", required: true },
        { key: "image_url", label: "Foto Ekstrakurikuler", type: "image", colSpan: 2 },
        { key: "description", label: "Deskripsi", type: "textarea", colSpan: 2 },
        { key: "is_active", label: "Aktif", type: "boolean" },
      ]}
    />
  );
}
