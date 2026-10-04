-- Create table for kode kegiatan mappings
CREATE TABLE public.kode_kegiatan_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kode TEXT NOT NULL UNIQUE,
  keterangan TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for kode rekening mappings
CREATE TABLE public.kode_rekening_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kode TEXT NOT NULL UNIQUE,
  keterangan TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kode_kegiatan_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kode_rekening_labels ENABLE ROW LEVEL SECURITY;

-- RLS policies for kode_kegiatan_labels
CREATE POLICY "Anyone can view kode kegiatan labels"
ON public.kode_kegiatan_labels
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage kode kegiatan labels"
ON public.kode_kegiatan_labels
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage kode kegiatan labels"
ON public.kode_kegiatan_labels
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- RLS policies for kode_rekening_labels
CREATE POLICY "Anyone can view kode rekening labels"
ON public.kode_rekening_labels
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage kode rekening labels"
ON public.kode_rekening_labels
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bendahara can manage kode rekening labels"
ON public.kode_rekening_labels
FOR ALL
USING (has_role(auth.uid(), 'bendahara'::app_role))
WITH CHECK (has_role(auth.uid(), 'bendahara'::app_role));

-- Create triggers for updated_at
CREATE TRIGGER update_kode_kegiatan_labels_updated_at
BEFORE UPDATE ON public.kode_kegiatan_labels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kode_rekening_labels_updated_at
BEFORE UPDATE ON public.kode_rekening_labels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default kode kegiatan labels
INSERT INTO public.kode_kegiatan_labels (kode, keterangan) VALUES
('07.12.01.', 'Biaya Operasional Satuan Pendidikan'),
('07.12.03.', 'Pengembangan Standar Isi'),
('07.12.04.', 'Pengembangan Standar Proses'),
('07.12.05.', 'Pengembangan Standar Kompetensi Lulusan'),
('07.12.06.', 'Pengembangan Standar PTK'),
('07.12.07.', 'Pengembangan Standar Sarpras'),
('07.12.08.', 'Pengembangan Standar Pengelolaan'),
('07.12.09.', 'Pengembangan Standar Pembiayaan'),
('07.12.10.', 'Pengembangan Standar Penilaian');

-- Insert default kode rekening labels
INSERT INTO public.kode_rekening_labels (kode, keterangan) VALUES
('5.1.02.01.01.0001', 'Belanja Alat Tulis Kantor'),
('5.1.02.01.01.0002', 'Belanja Dokumen/Administrasi Tender'),
('5.1.02.01.01.0003', 'Belanja Alat Listrik dan Elektronik'),
('5.1.02.01.01.0004', 'Belanja Perangko, Materai dan Benda Pos Lainnya'),
('5.1.02.01.01.0005', 'Belanja Peralatan Kebersihan dan Bahan Pembersih'),
('5.1.02.01.01.0006', 'Belanja Bahan Bakar Minyak/Gas'),
('5.1.02.01.01.0007', 'Belanja Pengisian Tabung Pemadam Kebakaran'),
('5.1.02.01.01.0008', 'Belanja Pengisian Tabung Gas'),
('5.1.02.01.01.0009', 'Belanja Perlengkapan Olahraga'),
('5.1.02.01.01.0010', 'Belanja Bahan Obat-Obatan'),
('5.1.02.02.01.0001', 'Belanja Jasa Kantor'),
('5.1.02.02.01.0002', 'Belanja Iuran Keaggotaan/Keanggotaan Organisasi'),
('5.1.02.02.01.0003', 'Belanja Jasa Keamanan/Satpam/Security'),
('5.1.02.02.01.0004', 'Belanja Jasa Kebersihan'),
('5.1.02.02.01.0005', 'Belanja Jasa Pengemudi/Sopir'),
('5.1.02.02.01.0006', 'Belanja Jasa Pengelola Arsip'),
('5.1.02.02.01.0007', 'Belanja Jasa Tenaga Laboran'),
('5.1.02.02.01.0008', 'Belanja Jasa Tenaga Perpustakaan'),
('5.1.02.02.01.0009', 'Belanja Jasa Tenaga Pengajar/Instruktur/Guru'),
('5.1.02.02.01.0010', 'Belanja Jasa Tenaga Kesehatan (Dokter, Perawat, Bidan)'),
('5.1.02.02.01.0011', 'Belanja Jasa Tenaga Operator Komputer'),
('5.1.02.02.01.0013', 'Belanja Jasa Tenaga Teknis Lainnya'),
('5.1.02.02.01.0026', 'Belanja Jasa Tenaga Ketatausahaan'),
('5.1.02.02.01.0031', 'Belanja Jasa Pengelolaan BMD'),
('5.1.02.02.01.0038', 'Belanja Jasa Tenaga Pendamping'),
('5.1.02.02.06.0001', 'Belanja Cetak'),
('5.1.02.02.06.0002', 'Belanja Penggandaan'),
('5.1.02.02.06.0003', 'Belanja Penjilidan'),
('5.1.02.02.07.0001', 'Belanja Sewa Gedung dan Bangunan'),
('5.1.02.02.07.0002', 'Belanja Sewa Ruang Rapat/Pertemuan'),
('5.1.02.02.07.0003', 'Belanja Sewa Penginapan/Hotel'),
('5.1.02.02.08.0001', 'Belanja Makanan dan Minuman Rapat'),
('5.1.02.02.08.0002', 'Belanja Makanan dan Minuman Jamuan Tamu'),
('5.1.02.02.08.0003', 'Belanja Makanan dan Minuman Peserta'),
('5.1.02.02.08.0004', 'Belanja Makanan dan Minuman Lainnya'),
('5.1.02.02.09.0002', 'Belanja Pakaian Olahraga'),
('5.1.02.02.09.0003', 'Belanja Pakaian Batik Tradisional'),
('5.1.02.03.02.0012', 'Belanja Pemeliharaan Alat Kantor'),
('5.1.02.03.03.0003', 'Belanja Pemeliharaan Komputer'),
('5.1.02.03.05.0002', 'Belanja Pemeliharaan Gedung Kantor'),
('5.1.02.04.01.0001', 'Belanja Perjalanan Dinas Dalam Daerah'),
('5.1.02.04.01.0003', 'Belanja Perjalanan Dinas Luar Daerah'),
('5.2.02.01.02.0016', 'Belanja Modal Peralatan dan Mesin - Komputer'),
('5.2.02.01.02.0017', 'Belanja Modal Peralatan dan Mesin - Printer'),
('5.2.02.01.03.0003', 'Belanja Modal Peralatan - Meja'),
('5.2.02.01.03.0004', 'Belanja Modal Peralatan - Kursi'),
('5.2.02.01.03.0006', 'Belanja Modal Peralatan - Lemari');