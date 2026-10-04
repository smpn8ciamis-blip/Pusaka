import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Eye, CheckCircle, XCircle, Clock, Pencil, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { differenceInDays } from "date-fns";

const PermissionLetters = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    activity_type: "study_tour",
    custom_activity_type: "",
    description: "",
    start_date: "",
    end_date: "",
    location: "",
  });

  const { data: user } = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
  });

  const { data: activities, isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions } = useQuery({
    queryKey: ["activity-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_permissions")
        .select(`
          *,
          activities(name),
          students(full_name, nis)
        `);
      if (error) throw error;
      return data;
    },
  });

  const { data: activityResponses } = useQuery({
    queryKey: ["activity-responses", selectedActivityId],
    enabled: !!selectedActivityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_permissions")
        .select(`
          *,
          students(full_name, nis, parent_name, parent_phone)
        `)
        .eq("activity_id", selectedActivityId!)
        .order("response_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!formData.name || !formData.activity_type || !user) {
        throw new Error("Data tidak lengkap");
      }

      let attachmentUrl = null;
      
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("permission-letters")
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("permission-letters")
          .getPublicUrl(filePath);
        
        attachmentUrl = publicUrl;
      }

      const { error: insertError } = await supabase
        .from("activities")
        .insert({
          name: formData.name,
          activity_type: formData.activity_type === "lainnya" && formData.custom_activity_type 
            ? formData.custom_activity_type 
            : formData.activity_type,
          description: formData.description,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          location: formData.location || null,
          attachment_url: attachmentUrl,
          created_by: user.id,
        });

      if (insertError) throw insertError;
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Kegiatan berhasil ditambahkan",
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setIsDialogOpen(false);
      setSelectedFile(null);
      setFormData({ 
        name: "", 
        activity_type: "study_tour", 
        custom_activity_type: "",
        description: "", 
        start_date: "", 
        end_date: "", 
        location: "" 
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingActivity || !formData.name || !formData.activity_type || !user) {
        throw new Error("Data tidak lengkap");
      }

      let attachmentUrl = editingActivity.attachment_url;
      
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("permission-letters")
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("permission-letters")
          .getPublicUrl(filePath);
        
        attachmentUrl = publicUrl;
      }

      const { error: updateError } = await supabase
        .from("activities")
        .update({
          name: formData.name,
          activity_type: formData.activity_type === "lainnya" && formData.custom_activity_type 
            ? formData.custom_activity_type 
            : formData.activity_type,
          description: formData.description,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          location: formData.location || null,
          attachment_url: attachmentUrl,
        })
        .eq("id", editingActivity.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Kegiatan berhasil diperbarui",
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
      setIsEditDialogOpen(false);
      setEditingActivity(null);
      setFormData({
        name: "",
        activity_type: "study_tour",
        custom_activity_type: "",
        description: "",
        start_date: "",
        end_date: "",
        location: "",
      });
      setSelectedFile(null);
    },
    onError: (error) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const activity = activities?.find(a => a.id === id);
      if (!activity) throw new Error("Kegiatan tidak ditemukan");

      if (activity.attachment_url) {
        const fileName = activity.attachment_url.split('/').pop();
        if (fileName) {
          await supabase.storage
            .from("permission-letters")
            .remove([fileName]);
        }
      }

      const { error } = await supabase
        .from("activities")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Kegiatan berhasil dihapus",
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("activities")
        .update({ is_active: !isActive })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Status kegiatan berhasil diubah",
      });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });

  const getPermissionCount = (activityId: string) => {
    if (!permissions) return { approved: 0, rejected: 0, pending: 0 };
    
    const activityPerms = permissions.filter(p => p.activity_id === activityId);
    return {
      approved: activityPerms.filter(p => p.status === "approved").length,
      rejected: activityPerms.filter(p => p.status === "rejected").length,
      pending: activityPerms.filter(p => p.status === "pending").length,
    };
  };

  const calculateDuration = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1; // +1 to include both start and end day
    return days;
  };

  const handleEdit = (activity: any) => {
    setEditingActivity(activity);
    setFormData({
      name: activity.name,
      activity_type: activity.activity_type,
      custom_activity_type: "",
      description: activity.description || "",
      start_date: activity.start_date || "",
      end_date: activity.end_date || "",
      location: activity.location || "",
    });
    setIsEditDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Kelola Kegiatan Sekolah</h1>
            <p className="text-muted-foreground">Buat kegiatan dan tunggu izin dari orang tua siswa</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Tambah Kegiatan
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Tambah Kegiatan Baru</DialogTitle>
                <DialogDescription>
                  Buat kegiatan yang memerlukan izin orang tua siswa
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Kegiatan *</Label>
                  <Input
                    id="name"
                    placeholder="Contoh: Study Tour ke Museum"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Jenis Kegiatan *</Label>
                  <Select
                    value={formData.activity_type}
                    onValueChange={(value) => setFormData({ ...formData, activity_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="study_tour">Study Tour</SelectItem>
                      <SelectItem value="lomba">Lomba/Kompetisi</SelectItem>
                      <SelectItem value="kunjungan">Kunjungan Industri</SelectItem>
                      <SelectItem value="kegiatan_sekolah">Kegiatan Sekolah</SelectItem>
                      <SelectItem value="lainnya">Lainnya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.activity_type === "lainnya" && (
                  <div className="space-y-2">
                    <Label htmlFor="custom_type">Nama Jenis Kegiatan *</Label>
                    <Input
                      id="custom_type"
                      placeholder="Contoh: Bakti Sosial, Pertukaran Pelajar, dll"
                      value={formData.custom_activity_type}
                      onChange={(e) => setFormData({ ...formData, custom_activity_type: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="start_date">Tanggal Mulai</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">Tanggal Selesai</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">Lokasi</Label>
                  <Input
                    id="location"
                    placeholder="Lokasi kegiatan"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Keterangan</Label>
                  <Textarea
                    id="description"
                    placeholder="Detail kegiatan..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="file">File Lampiran (PDF, opsional)</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                </div>

                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={!formData.name || (formData.activity_type === "lainnya" && !formData.custom_activity_type) || uploadMutation.isPending}
                  className="w-full"
                >
                  {uploadMutation.isPending ? "Menyimpan..." : "Simpan Kegiatan"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daftar Kegiatan</CardTitle>
            <CardDescription>
              Kegiatan yang memerlukan izin orang tua
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">No</TableHead>
                    <TableHead>Kegiatan</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Lokasi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Izin</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities?.map((activity, index) => {
                    const counts = getPermissionCount(activity.id);
                    return (
                      <TableRow key={activity.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">
                          {activity.name}
                          {activity.description && (
                            <div className="text-sm text-muted-foreground">
                              {activity.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="capitalize">
                          {activity.activity_type.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell>
                          {activity.start_date && activity.end_date ? (
                            <div>
                              <div>
                                {new Date(activity.start_date).toLocaleDateString("id-ID")}
                                {" - "}
                                {new Date(activity.end_date).toLocaleDateString("id-ID")}
                              </div>
                              {calculateDuration(activity.start_date, activity.end_date) && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  ({calculateDuration(activity.start_date, activity.end_date)} hari)
                                </div>
                              )}
                            </div>
                          ) : activity.start_date ? (
                            new Date(activity.start_date).toLocaleDateString("id-ID")
                          ) : "-"}
                        </TableCell>
                        <TableCell>{activity.location || "-"}</TableCell>
                        <TableCell>
                          {activity.is_active ? (
                            <Badge variant="default">Aktif</Badge>
                          ) : (
                            <Badge variant="secondary">Nonaktif</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Badge className="bg-green-500 hover:bg-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                {counts.approved} Setuju
                              </Badge>
                              <Badge className="bg-red-500 hover:bg-red-600">
                                <XCircle className="w-3 h-3 mr-1" />
                                {counts.rejected} Tolak
                              </Badge>
                            </div>
                            <Badge variant="secondary" className="w-fit">
                              <Clock className="w-3 h-3 mr-1" />
                              {counts.pending} Menunggu
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 flex-wrap">
                            {activity.attachment_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(activity.attachment_url!, "_blank")}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedActivityId(activity.id);
                                setIsResponseDialogOpen(true);
                              }}
                            >
                              <Users className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(activity)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleActiveMutation.mutate({ 
                                id: activity.id, 
                                isActive: activity.is_active 
                              })}
                            >
                              {activity.is_active ? "Nonaktifkan" : "Aktifkan"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteMutation.mutate(activity.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {activities?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Belum ada kegiatan yang dibuat
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Response Detail Dialog */}
        <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
          <DialogContent className="sm:max-w-[800px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Respons Orang Tua</DialogTitle>
              <DialogDescription>
                Daftar orang tua yang sudah memberikan respons
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {activityResponses && activityResponses.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Siswa</TableHead>
                      <TableHead>NIS</TableHead>
                      <TableHead>Nama Orang Tua</TableHead>
                      <TableHead>No. Telp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Tanggal Respons</TableHead>
                      <TableHead>Tanda Tangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityResponses.map((response: any) => (
                      <TableRow key={response.id}>
                        <TableCell className="font-medium">
                          {response.students?.full_name || "-"}
                        </TableCell>
                        <TableCell>{response.students?.nis || "-"}</TableCell>
                        <TableCell>
                          {response.parent_name || response.students?.parent_name || "-"}
                        </TableCell>
                        <TableCell>
                          {response.students?.parent_phone || "-"}
                        </TableCell>
                        <TableCell>
                          {response.status === "approved" ? (
                            <Badge className="bg-green-500 hover:bg-green-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Setuju
                            </Badge>
                          ) : response.status === "rejected" ? (
                            <Badge className="bg-red-500 hover:bg-red-600">
                              <XCircle className="w-3 h-3 mr-1" />
                              Tolak
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="w-3 h-3 mr-1" />
                              Menunggu
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {response.response_date
                            ? new Date(response.response_date).toLocaleDateString("id-ID", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {response.parent_signature ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const win = window.open();
                                win?.document.write(
                                  `<img src="${response.parent_signature}" style="max-width: 100%;" />`
                                );
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Belum ada orang tua yang merespons
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit Kegiatan</DialogTitle>
              <DialogDescription>
                Perbarui informasi kegiatan
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nama Kegiatan *</Label>
                <Input
                  id="edit-name"
                  placeholder="Contoh: Study Tour ke Museum"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-type">Jenis Kegiatan *</Label>
                <Select
                  value={formData.activity_type}
                  onValueChange={(value) => setFormData({ ...formData, activity_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="study_tour">Study Tour</SelectItem>
                    <SelectItem value="lomba">Lomba/Kompetisi</SelectItem>
                    <SelectItem value="kunjungan">Kunjungan Industri</SelectItem>
                    <SelectItem value="kegiatan_sekolah">Kegiatan Sekolah</SelectItem>
                    <SelectItem value="lainnya">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.activity_type === "lainnya" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-custom_type">Nama Jenis Kegiatan *</Label>
                  <Input
                    id="edit-custom_type"
                    placeholder="Contoh: Bakti Sosial, Pertukaran Pelajar, dll"
                    value={formData.custom_activity_type}
                    onChange={(e) => setFormData({ ...formData, custom_activity_type: e.target.value })}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="edit-start_date">Tanggal Mulai</Label>
                <Input
                  id="edit-start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-end_date">Tanggal Selesai</Label>
                <Input
                  id="edit-end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-location">Lokasi</Label>
                <Input
                  id="edit-location"
                  placeholder="Contoh: Museum Nasional Jakarta"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Deskripsi</Label>
                <Textarea
                  id="edit-description"
                  placeholder="Deskripsi detail kegiatan..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-file">Lampiran (opsional)</Label>
                <Input
                  id="edit-file"
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                {editingActivity?.attachment_url && (
                  <p className="text-sm text-muted-foreground">
                    File saat ini: <a href={editingActivity.attachment_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Lihat file</a>
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setEditingActivity(null);
                  setFormData({
                    name: "",
                    activity_type: "study_tour",
                    custom_activity_type: "",
                    description: "",
                    start_date: "",
                    end_date: "",
                    location: "",
                  });
                  setSelectedFile(null);
                }}
              >
                Batal
              </Button>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || !formData.name || !formData.activity_type}
              >
                {updateMutation.isPending ? "Menyimpan..." : "Simpan Perubahan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default PermissionLetters;
