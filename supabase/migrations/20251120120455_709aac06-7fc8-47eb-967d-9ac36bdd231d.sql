-- Create violation types table
CREATE TABLE public.violation_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'ringan',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create student violations table
CREATE TABLE public.student_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  violation_type_id UUID NOT NULL REFERENCES public.violation_types(id) ON DELETE CASCADE,
  violation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  points INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  reported_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.violation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_violations ENABLE ROW LEVEL SECURITY;

-- Policies for violation_types
CREATE POLICY "Everyone can view active violation types"
ON public.violation_types FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage violation types"
ON public.violation_types FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Policies for student_violations
CREATE POLICY "Everyone can view violations"
ON public.student_violations FOR SELECT
USING (true);

CREATE POLICY "Teachers can create violations"
ON public.student_violations FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can manage all violations"
ON public.student_violations FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_violation_types_updated_at
BEFORE UPDATE ON public.violation_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_student_violations_updated_at
BEFORE UPDATE ON public.student_violations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default violation types
INSERT INTO public.violation_types (name, description, points, category) VALUES
('Terlambat masuk kelas', 'Datang terlambat ke kelas', 5, 'ringan'),
('Tidak mengerjakan PR', 'Tidak menyelesaikan pekerjaan rumah', 10, 'ringan'),
('Tidak memakai seragam lengkap', 'Atribut seragam tidak lengkap', 15, 'ringan'),
('Ribut di kelas', 'Membuat keributan saat pelajaran berlangsung', 20, 'sedang'),
('Tidak masuk tanpa keterangan', 'Tidak hadir tanpa izin', 25, 'sedang'),
('Merokok', 'Merokok di area sekolah', 50, 'berat'),
('Berkelahi', 'Terlibat perkelahian dengan siswa lain', 75, 'berat'),
('Membawa barang terlarang', 'Membawa barang yang dilarang sekolah', 100, 'berat');