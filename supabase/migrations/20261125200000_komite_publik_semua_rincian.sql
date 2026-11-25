-- Halaman publik Komite (/website/komite):
--   * rincian menampilkan SEMUA catatan (sebelumnya hanya 300 terbaru) dan memuat nama rombel ('kelas');
--   * ringkasan per rombel ('per_rombel') ditambahkan (angka saja).
--   * pemanggil dashboard (p_school diisi + login) tidak lagi menerima rincian karena tidak memakainya.
-- Tanda tangan fungsi tidak berubah, jadi aman dijalankan ulang dan tidak merusak halaman yang sedang berjalan.
-- Hak akses sama seperti sebelumnya: anon dan authenticated boleh menjalankan; nama tetap disamarkan di sisi server.

CREATE OR REPLACE FUNCTION public.komite_publik(p_school uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st public.komite_settings;
  v_total numeric; v_rek numeric; v_tun numeric; v_cnt integer;
  v_grades jsonb; v_lain jsonb; v_rekening jsonb; v_rincian jsonb; v_rombel jsonb; v_upd timestamptz;
  v_dash boolean := false;
BEGIN
  IF p_school IS NOT NULL AND auth.uid() IS NOT NULL
     AND (p_school = public.get_user_school_id() OR public.is_super_admin()) THEN
    -- dashboard: pengguna yang login meminta ringkasan sekolahnya sendiri (rincian tidak dibutuhkan, jadi tidak dikirim)
    v_dash := true;
    SELECT ks.* INTO st FROM public.komite_settings ks WHERE ks.school_id = p_school;
  ELSE
    -- publik: utamakan sekolah yang dipakai situs (pengaturan sekolah terbaru, sama seperti PublicLayout);
    -- bila sekolah itu belum punya pengaturan komite, pakai pengaturan komite terbaru.
    SELECT ks.* INTO st FROM public.komite_settings ks
    ORDER BY (ks.school_id = (SELECT ss.school_id FROM public.school_settings ss ORDER BY ss.created_at DESC LIMIT 1)) DESC NULLS LAST,
             ks.updated_at DESC
    LIMIT 1;
  END IF;
  IF st.school_id IS NULL THEN
    RETURN jsonb_build_object('configured', false);
  END IF;

  SELECT COALESCE(SUM(jumlah), 0), COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'rekening'), 0),
         COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'tunai'), 0), COUNT(*), MAX(created_at)
    INTO v_total, v_rek, v_tun, v_cnt, v_upd
  FROM public.komite_donasi WHERE school_id = st.school_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'grade', g.grade,
           'total', COALESCE(x.total, 0), 'jumlah', COALESCE(x.cnt, 0),
           'rekening', COALESCE(x.rek, 0), 'tunai', COALESCE(x.tun, 0),
           'siswa_penyumbang', COALESCE(x.donors, 0),
           'siswa_total', COALESCE(sc.n, 0)) ORDER BY g.grade), '[]'::jsonb)
    INTO v_grades
  FROM generate_series(7, 9) AS g(grade)
  LEFT JOIN (
    SELECT d.grade, SUM(d.jumlah) AS total, COUNT(*) AS cnt,
           SUM(d.jumlah) FILTER (WHERE d.sumber = 'rekening') AS rek,
           SUM(d.jumlah) FILTER (WHERE d.sumber = 'tunai') AS tun,
           COUNT(DISTINCT d.student_id) AS donors
    FROM public.komite_donasi d WHERE d.school_id = st.school_id AND d.kategori = 'siswa' GROUP BY d.grade
  ) x ON x.grade = g.grade
  LEFT JOIN (
    SELECT c.grade, COUNT(*) AS n
    FROM public.students s JOIN public.classes c ON c.id = s.class_id
    WHERE s.school_id = st.school_id AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
    GROUP BY c.grade
  ) sc ON sc.grade = g.grade;

  SELECT jsonb_build_object(
           'total', COALESCE(SUM(jumlah), 0), 'jumlah', COUNT(*),
           'rekening', COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'rekening'), 0),
           'tunai', COALESCE(SUM(jumlah) FILTER (WHERE sumber = 'tunai'), 0))
    INTO v_lain
  FROM public.komite_donasi WHERE school_id = st.school_id AND kategori = 'donatur_lain';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', r.id, 'bank', r.bank, 'nomor', r.nomor, 'atas_nama', r.atas_nama, 'catatan', r.catatan)
           ORDER BY r.urutan, r.created_at), '[]'::jsonb)
    INTO v_rekening
  FROM public.komite_rekening r WHERE r.school_id = st.school_id AND r.aktif;

  -- Ringkasan per rombel (angka saja, sama dengan komite_per_kelas tetapi untuk seluruh rombel dan boleh dilihat publik).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kelas', c.name, 'grade', c.grade,
           'siswa_total', sc.n, 'siswa_penyumbang', COALESCE(dd.donors, 0), 'jumlah', COALESCE(dd.cnt, 0),
           'total', COALESCE(dd.total, 0), 'rekening', COALESCE(dd.rek, 0), 'tunai', COALESCE(dd.tun, 0))
           ORDER BY c.grade, c.name), '[]'::jsonb)
    INTO v_rombel
  FROM public.classes c
  JOIN (SELECT s.class_id AS cid, COUNT(*) AS n
          FROM public.students s
         WHERE s.school_id = st.school_id AND s.status = 'aktif' AND COALESCE(s.is_alumni, false) = false
         GROUP BY s.class_id) sc ON sc.cid = c.id
  LEFT JOIN (SELECT d.class_id AS cid, SUM(d.jumlah) AS total, COUNT(*) AS cnt,
                    SUM(d.jumlah) FILTER (WHERE d.sumber = 'rekening') AS rek,
                    SUM(d.jumlah) FILTER (WHERE d.sumber = 'tunai') AS tun,
                    COUNT(DISTINCT d.student_id) AS donors
               FROM public.komite_donasi d
              WHERE d.school_id = st.school_id AND d.kategori = 'siswa' AND d.class_id IS NOT NULL
              GROUP BY d.class_id) dd ON dd.cid = c.id
  WHERE c.school_id = st.school_id AND c.grade IN (7, 8, 9);

  -- Rincian: SEMUA catatan (sebelumnya dibatasi 300). Pencarian, urutan, dan halaman diatur di halaman web.
  IF st.tampilkan_rincian AND NOT v_dash THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'tanggal', t.tanggal, 'jumlah', t.jumlah, 'sumber', t.sumber, 'kategori', t.kategori,
             'grade', t.grade, 'kelas', t.kelas_nama, 'nama', public._komite_mask_nama(t.nama, st.nama_publik))
             ORDER BY t.tanggal DESC, t.created_at DESC), '[]'::jsonb)
      INTO v_rincian
    FROM (SELECT * FROM public.komite_donasi WHERE school_id = st.school_id
          ORDER BY tanggal DESC, created_at DESC) t;
  ELSE
    v_rincian := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'configured', true,
    'judul', st.judul, 'deskripsi', st.deskripsi, 'target', st.target, 'batas_waktu', st.batas_waktu,
    'tampilkan_rincian', st.tampilkan_rincian, 'nama_publik', st.nama_publik,
    'total', v_total, 'rekening_total', v_rek, 'tunai_total', v_tun, 'jumlah', v_cnt,
    'per_tingkat', v_grades, 'donatur_lain', v_lain,
    'rekening', v_rekening, 'rincian', v_rincian, 'per_rombel', v_rombel,
    'diperbarui', GREATEST(v_upd, st.updated_at));
END;
$$;
REVOKE ALL ON FUNCTION public.komite_publik(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.komite_publik(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
