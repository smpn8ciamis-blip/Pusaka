import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const StudentRegistrationPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Fetch students without accounts
  const { data: students, isLoading: studentsLoading } = useQuery({
    queryKey: ['students-without-accounts'],
    queryFn: async () => {
      // Get all students
      const { data: allStudents, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, nis, class_id')
        .eq('is_alumni', false)
        .order('full_name');
      
      if (studentsError) throw studentsError;

      // Get students that already have accounts
      const { data: existingAccounts, error: accountsError } = await supabase
        .from('student_accounts')
        .select('student_id');
      
      if (accountsError) throw accountsError;

      const existingStudentIds = new Set(existingAccounts?.map(a => a.student_id) || []);
      
      // Filter out students with existing accounts
      return allStudents?.filter(s => !existingStudentIds.has(s.id)) || [];
    }
  });

  // Fetch classes for display
  const { data: classes } = useQuery({
    queryKey: ['classes-for-student-reg'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('id, name, grade');
      if (error) throw error;
      return data || [];
    }
  });

  const getClassName = (classId: string | null) => {
    if (!classId || !classes) return '';
    const cls = classes.find(c => c.id === classId);
    return cls ? ` - Kelas ${cls.grade} ${cls.name}` : '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStudent || !email || !password) {
      toast({
        title: "Error",
        description: "Semua field harus diisi",
        variant: "destructive"
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Error",
        description: "Password minimal 6 karakter",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Gagal membuat user");

      // Assign siswa role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: authData.user.id,
          role: 'siswa'
        });

      if (roleError) throw roleError;

      // Link student to user account
      const { error: linkError } = await supabase
        .from('student_accounts')
        .insert({
          user_id: authData.user.id,
          student_id: selectedStudent
        });

      if (linkError) throw linkError;

      toast({
        title: "Berhasil",
        description: "Akun siswa berhasil dibuat"
      });

      // Reset form
      setSelectedStudent("");
      setEmail("");
      setPassword("");

    } catch (error: any) {
      console.error('Error creating student account:', error);
      toast({
        title: "Error",
        description: error.message || "Gagal membuat akun siswa",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Registrasi Akun Siswa</h1>
          <p className="text-muted-foreground">Buat akun login untuk siswa</p>
        </div>

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Buat Akun Siswa Baru
            </CardTitle>
            <CardDescription>
              Pilih siswa dan buat kredensial login
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="student">Pilih Siswa</Label>
                <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih siswa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {studentsLoading ? (
                      <div className="p-2 text-center text-muted-foreground">
                        Memuat data siswa...
                      </div>
                    ) : students && students.length > 0 ? (
                      students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.full_name} ({student.nis}){getClassName(student.class_id)}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-2 text-center text-muted-foreground">
                        Semua siswa sudah memiliki akun
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@siswa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Minimal 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Membuat Akun...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Buat Akun Siswa
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

const StudentRegistration = () => (
  <ProtectedRoute allowedRoles={['admin']}>
    <StudentRegistrationPage />
  </ProtectedRoute>
);

export default StudentRegistration;
