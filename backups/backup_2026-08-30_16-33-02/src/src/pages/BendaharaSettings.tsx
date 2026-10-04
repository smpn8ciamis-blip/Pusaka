import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Settings, Save } from "lucide-react";
import { toast } from "sonner";

interface TeacherWithProfile {
  id: string;
  nip: string | null;
  user_id: string;
  profiles: {
    full_name: string;
  } | null;
}

export default function BendaharaSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    bendahara_name: "",
    bendahara_nip: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["school-settings-bendahara"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("id, bendahara_name, bendahara_nip")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch teachers with their profiles
  const { data: teachers } = useQuery({
    queryKey: ["teachers-for-bendahara"],
    queryFn: async () => {
      const { data: teacherData, error } = await supabase
        .from("teachers")
        .select("id, nip, user_id")
        .order("nip");
      
      if (error) throw error;
      if (!teacherData) return [];

      // Fetch profiles separately
      const userIds = teacherData.map(t => t.user_id);
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name")
        .in("id", userIds);

      // Map profiles to teachers
      return teacherData.map(teacher => ({
        ...teacher,
        profiles: profiles?.find(p => p.id === teacher.user_id) || null
      })) as TeacherWithProfile[];
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        bendahara_name: settings.bendahara_name || "",
        bendahara_nip: settings.bendahara_nip || "",
      });
    }
  }, [settings]);

  const handleTeacherSelect = (teacherId: string) => {
    const selectedTeacher = teachers?.find(t => t.id === teacherId);
    if (selectedTeacher) {
      setFormData({
        bendahara_name: selectedTeacher.profiles?.full_name || "",
        bendahara_nip: selectedTeacher.nip || "",
      });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!settings?.id) {
        throw new Error("Pengaturan sekolah tidak ditemukan");
      }
      const { data: updatedData, error } = await supabase
        .from("school_settings")
        .update({
          bendahara_name: data.bendahara_name || null,
          bendahara_nip: data.bendahara_nip || null,
        })
        .eq("id", settings.id)
        .select();
      
      if (error) throw error;
      if (!updatedData || updatedData.length === 0) {
        throw new Error("Gagal menyimpan data. Pastikan Anda login sebagai admin.");
      }
      return updatedData[0];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-settings-bendahara"] });
      toast.success("Pengaturan bendahara berhasil disimpan");
    },
    onError: (error: any) => {
      toast.error(error.message || "Gagal menyimpan pengaturan");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  // Find currently selected teacher based on saved data
  const selectedTeacherId = teachers?.find(
    t => t.profiles?.full_name === formData.bendahara_name && t.nip === formData.bendahara_nip
  )?.id;

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Settings className="h-8 w-8" />
              Pengaturan Bendahara
            </h1>
            <p className="text-muted-foreground">Kelola data bendahara untuk kwitansi pembayaran</p>
          </div>

          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>Data Bendahara BOS</CardTitle>
              <CardDescription>
                Data ini akan digunakan pada semua kwitansi pembayaran
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Memuat data...</div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pilih Guru sebagai Bendahara</Label>
                    <Select
                      value={selectedTeacherId || ""}
                      onValueChange={handleTeacherSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih guru dari daftar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {teachers?.map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id}>
                            {teacher.profiles?.full_name || "Tanpa Nama"} {teacher.nip ? `(${teacher.nip})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bendahara_name">Nama Bendahara</Label>
                    <Input
                      id="bendahara_name"
                      value={formData.bendahara_name}
                      onChange={(e) => setFormData({ ...formData, bendahara_name: e.target.value })}
                      placeholder="Nama lengkap bendahara"
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bendahara_nip">NIP Bendahara</Label>
                    <Input
                      id="bendahara_nip"
                      value={formData.bendahara_nip}
                      onChange={(e) => setFormData({ ...formData, bendahara_nip: e.target.value })}
                      placeholder="NIP bendahara"
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <Button type="submit" disabled={updateMutation.isPending || !formData.bendahara_name}>
                    <Save className="mr-2 h-4 w-4" />
                    {updateMutation.isPending ? "Menyimpan..." : "Simpan Pengaturan"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}