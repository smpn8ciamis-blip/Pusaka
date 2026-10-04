import AdminCrudPage from "./AdminCrudPage";
export default function AdminAgenda() {
  return (
    <AdminCrudPage
      title="Agenda"
      description="Kelola agenda dan kegiatan sekolah."
      table="website_agenda"
      orderBy={{ column: "start_at", ascending: false }}
      defaults={{ is_published: true }}
      columns={[
        { key: "title", label: "Kegiatan" },
        { key: "start_at", label: "Mulai", render: (r) => new Date(r.start_at).toLocaleString("id-ID") },
        { key: "location", label: "Lokasi" },
        { key: "is_published", label: "Publik", render: (r) => r.is_published ? "Ya" : "Tidak" },
      ]}
      fields={[
        { key: "title", label: "Nama Kegiatan", required: true, colSpan: 2 },
        { key: "description", label: "Deskripsi", type: "textarea", colSpan: 2 },
        { key: "start_at", label: "Waktu Mulai", type: "datetime", required: true },
        { key: "end_at", label: "Waktu Selesai", type: "datetime" },
        { key: "location", label: "Lokasi", colSpan: 2 },
        { key: "is_published", label: "Publikasikan", type: "boolean" },
      ]}
    />
  );
}
