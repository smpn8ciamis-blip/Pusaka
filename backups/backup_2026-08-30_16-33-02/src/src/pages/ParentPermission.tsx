import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Search, FileText, CheckCircle, XCircle, Calendar, MapPin, Printer, PenTool } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { differenceInDays } from "date-fns";
import ReCAPTCHA from "react-google-recaptcha";
import { RECAPTCHA_SITE_KEY } from "@/config/recaptcha";
import { useCaptchaConfig } from "@/hooks/useCaptchaConfig";

const ParentPermission = () => {
  const { toast } = useToast();
  const { captchaEnabled } = useCaptchaConfig();
  const queryClient = useQueryClient();
  const [searchNis, setSearchNis] = useState("");
  const [studentData, setStudentData] = useState<any>(null);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [responseData, setResponseData] = useState({
    parent_name: "",
    parent_response: "",
    status: "approved" as "approved" | "rejected",
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);

  const { data: activities } = useQuery({
    queryKey: ["active-activities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings")
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: permissions, refetch } = useQuery({
    queryKey: ["student-permissions", studentData?.id],
    queryFn: async () => {
      if (!studentData?.id) return [];
      const { data, error } = await supabase
        .from("activity_permissions")
        .select(`
          *,
          activities(*)
        `)
        .eq("student_id", studentData.id);
      if (error) throw error;
      return data;
    },
    enabled: !!studentData?.id,
  });

  const searchStudent = async () => {
    if (!searchNis.trim()) {
      toast({
        title: "Peringatan",
        description: "Masukkan NIS siswa",
        variant: "destructive",
      });
      return;
    }

    if (captchaEnabled && !captchaToken) {
      toast({
        title: "Peringatan",
        description: "Silakan verifikasi captcha terlebih dahulu",
        variant: "destructive",
      });
      return;
    }

    const { data, error } = await supabase
      .from("students")
      .select("id, full_name, nis, class_id, classes(name)")
      .eq("nis", searchNis.trim())
      .single();

    if (error || !data) {
      toast({
        title: "Tidak Ditemukan",
        description: "Siswa dengan NIS tersebut tidak ditemukan",
        variant: "destructive",
      });
      setStudentData(null);
      captchaRef?.reset();
      setCaptchaToken(null);
      return;
    }

    setStudentData(data);
    toast({
      title: "Berhasil",
      description: `Data siswa ${data.full_name} ditemukan`,
    });
  };

  const respondMutation = useMutation({
    mutationFn: async () => {
      if (!selectedActivity || !studentData?.id || !responseData.parent_name.trim() || !signatureData) {
        throw new Error("Data tidak lengkap. Pastikan nama dan tanda tangan sudah diisi");
      }

      // Check if permission already exists
      const existingPermission = permissions?.find(
        p => p.activity_id === selectedActivity.id
      );

      if (existingPermission) {
        // Update existing permission
        const { error } = await supabase
          .from("activity_permissions")
          .update({
            status: responseData.status,
            parent_name: responseData.parent_name,
            parent_response: responseData.parent_response,
            parent_signature: signatureData,
            response_date: new Date().toISOString(),
          })
          .eq("id", existingPermission.id);

        if (error) throw error;
      } else {
        // Create new permission
        const { error } = await supabase
          .from("activity_permissions")
          .insert({
            activity_id: selectedActivity.id,
            student_id: studentData.id,
            status: responseData.status,
            parent_name: responseData.parent_name,
            parent_response: responseData.parent_response,
            parent_signature: signatureData,
            response_date: new Date().toISOString(),
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Berhasil",
        description: "Respon Anda telah tersimpan",
      });
      queryClient.invalidateQueries({ queryKey: ["student-permissions"] });
      setIsResponseDialogOpen(false);
      setSelectedActivity(null);
      setResponseData({ parent_name: "", parent_response: "", status: "approved" });
      setSignatureData(null);
      clearCanvas();
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getPermissionStatus = (activityId: string) => {
    return permissions?.find(p => p.activity_id === activityId);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Disetujui</Badge>;
      case "rejected":
        return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />Ditolak</Badge>;
      default:
        return <Badge variant="secondary">Menunggu Respon</Badge>;
    }
  };

  const handleResponse = (activity: any, status: "approved" | "rejected") => {
    setSelectedActivity(activity);
    setResponseData({ ...responseData, status });
    setSignatureData(null);
    setIsResponseDialogOpen(true);
  };

  useEffect(() => {
    if (isResponseDialogOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [isResponseDialogOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      const canvas = canvasRef.current;
      setSignatureData(canvas.toDataURL());
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  const calculateDuration = (startDate: string | null, endDate: string | null) => {
    if (!startDate || !endDate) return null;
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    return days;
  };

  const printPermissionLetter = (activity: any, permission: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const statusText = permission.status === 'approved' ? 'MENGIZINKAN' : 'TIDAK MENGIZINKAN';
    const statusColor = permission.status === 'approved' ? '#22c55e' : '#ef4444';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Surat Izin Kegiatan</title>
          <style>
            @media print {
              @page { margin: 2cm; }
              body { margin: 0; }
            }
            body {
              font-family: 'Times New Roman', serif;
              padding: 40px;
              line-height: 1.6;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 3px solid #000;
              padding-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              font-size: 20px;
              font-weight: bold;
            }
            .header p {
              margin: 5px 0;
              font-size: 14px;
            }
            .content {
              margin: 30px 0;
            }
            .title {
              text-align: center;
              font-weight: bold;
              font-size: 16px;
              margin: 20px 0;
              text-decoration: underline;
            }
            .info-row {
              display: flex;
              margin: 10px 0;
            }
            .info-label {
              width: 200px;
              font-weight: bold;
            }
            .info-value {
              flex: 1;
            }
            .status-box {
              margin: 30px 0;
              padding: 20px;
              border: 2px solid ${statusColor};
              background-color: ${statusColor}15;
              text-align: center;
            }
            .status-text {
              font-size: 24px;
              font-weight: bold;
              color: ${statusColor};
            }
            .signature {
              margin-top: 50px;
              text-align: right;
            }
            .signature-box {
              display: inline-block;
              text-align: center;
              min-width: 200px;
            }
            .signature-line {
              margin-top: 80px;
              border-top: 1px solid #000;
              padding-top: 5px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${schoolSettings?.school_name || 'SEKOLAH'}</h1>
            ${schoolSettings?.school_address ? `<p>${schoolSettings.school_address}</p>` : ''}
            ${schoolSettings?.school_phone ? `<p>Telp: ${schoolSettings.school_phone}</p>` : ''}
          </div>

          <div class="content">
            <div class="title">SURAT IZIN ORANG TUA/WALI</div>

            <p>Yang bertanda tangan di bawah ini:</p>

            <div class="info-row">
              <div class="info-label">Nama Orang Tua/Wali</div>
              <div class="info-value">: ${permission.parent_name}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Nama Siswa</div>
              <div class="info-value">: ${studentData.full_name}</div>
            </div>
            <div class="info-row">
              <div class="info-label">NIS</div>
              <div class="info-value">: ${studentData.nis}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Kelas</div>
              <div class="info-value">: ${studentData.classes?.name || '-'}</div>
            </div>

            <p style="margin-top: 30px;">Dengan ini menyatakan:</p>

            <div class="status-box">
              <div class="status-text">${statusText}</div>
            </div>

            <p>Anak saya untuk mengikuti kegiatan:</p>

            <div class="info-row">
              <div class="info-label">Nama Kegiatan</div>
              <div class="info-value">: ${activity.name}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Jenis Kegiatan</div>
              <div class="info-value">: ${activity.activity_type.replace(/_/g, ' ').toUpperCase()}</div>
            </div>
            ${activity.start_date ? `
            <div class="info-row">
              <div class="info-label">Tanggal</div>
              <div class="info-value">: ${new Date(activity.start_date).toLocaleDateString('id-ID', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}${activity.end_date ? ' - ' + new Date(activity.end_date).toLocaleDateString('id-ID', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              }) : ''}</div>
            </div>
            ` : ''}
            ${activity.location ? `
            <div class="info-row">
              <div class="info-label">Lokasi</div>
              <div class="info-value">: ${activity.location}</div>
            </div>
            ` : ''}
            ${permission.parent_response ? `
            <div class="info-row">
              <div class="info-label">Keterangan</div>
              <div class="info-value">: ${permission.parent_response}</div>
            </div>
            ` : ''}

            <p style="margin-top: 30px;">Demikian surat izin ini dibuat dengan sebenarnya untuk dapat digunakan sebagaimana mestinya.</p>

            <div class="signature">
              <div class="signature-box">
                <p>${new Date(permission.response_date).toLocaleDateString('id-ID', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}</p>
                <p>Orang Tua/Wali</p>
                ${permission.parent_signature ? `
                  <div style="margin: 20px 0;">
                    <img src="${permission.parent_signature}" alt="Tanda Tangan" style="max-width: 200px; height: auto;" />
                  </div>
                ` : '<div style="height: 80px;"></div>'}
                <div class="signature-line">${permission.parent_name}</div>
              </div>
            </div>
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Portal Orang Tua</h1>
          <p className="text-muted-foreground">
            Berikan persetujuan untuk anak Anda mengikuti kegiatan sekolah
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cari Data Siswa</CardTitle>
            <CardDescription>
              Masukkan NIS siswa untuk melihat surat izin kegiatan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label htmlFor="nis" className="sr-only">NIS</Label>
                  <Input
                    id="nis"
                    placeholder="Masukkan NIS siswa..."
                    value={searchNis}
                    onChange={(e) => setSearchNis(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && captchaToken && searchStudent()}
                  />
                </div>
                <Button onClick={searchStudent} disabled={captchaEnabled && !captchaToken}>
                  <Search className="w-4 h-4 mr-2" />
                  Cari
                </Button>
              </div>
              
              {captchaEnabled && (
                <div className="flex justify-center">
                  <ReCAPTCHA
                    ref={(ref) => setCaptchaRef(ref)}
                    sitekey={RECAPTCHA_SITE_KEY}
                    onChange={(token) => setCaptchaToken(token)}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {studentData && (
          <Card>
            <CardHeader>
              <CardTitle>Data Siswa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nama:</span>
                  <span className="font-medium">{studentData.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NIS:</span>
                  <span className="font-medium">{studentData.nis}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kelas:</span>
                  <span className="font-medium">{studentData.classes?.name}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {studentData && activities && activities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Kegiatan Sekolah</CardTitle>
              <CardDescription>
                Pilih kegiatan yang Anda izinkan untuk diikuti anak Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.map((activity) => {
                  const permission = getPermissionStatus(activity.id);
                  return (
                    <div
                      key={activity.id}
                      className="border rounded-lg p-4 space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <span className="font-medium">{activity.name}</span>
                          </div>
                          
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p className="capitalize">
                              <strong>Jenis:</strong> {activity.activity_type.replace(/_/g, ' ')}
                            </p>
                            
                            {(activity.start_date || activity.end_date) && (
                              <div className="flex items-start gap-1">
                                <Calendar className="w-4 h-4 mt-0.5" />
                                <div>
                                  {activity.start_date && activity.end_date ? (
                                    <>
                                      <div>
                                        {new Date(activity.start_date).toLocaleDateString("id-ID", {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric'
                                        })}
                                        {" - "}
                                        {new Date(activity.end_date).toLocaleDateString("id-ID", {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric'
                                        })}
                                      </div>
                                      {calculateDuration(activity.start_date, activity.end_date) && (
                                        <div className="text-xs">
                                          ({calculateDuration(activity.start_date, activity.end_date)} hari)
                                        </div>
                                      )}
                                    </>
                                  ) : activity.start_date ? (
                                    new Date(activity.start_date).toLocaleDateString("id-ID", {
                                      weekday: 'long',
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    })
                                  ) : null}
                                </div>
                              </div>
                            )}
                            
                            {activity.location && (
                              <p className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {activity.location}
                              </p>
                            )}
                            
                            {activity.description && (
                              <p className="mt-2">{activity.description}</p>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          {permission && getStatusBadge(permission.status)}
                        </div>
                      </div>

                      {permission && permission.parent_name && (
                        <div className="bg-muted/50 rounded p-3 text-sm space-y-1">
                          <p><strong>Nama Orang Tua:</strong> {permission.parent_name}</p>
                          {permission.parent_response && (
                            <p><strong>Keterangan:</strong> {permission.parent_response}</p>
                          )}
                          {permission.response_date && (
                            <p className="text-xs text-muted-foreground">
                              Direspon: {new Date(permission.response_date).toLocaleDateString("id-ID")}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        {activity.attachment_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(activity.attachment_url, "_blank")}
                          >
                            <FileText className="w-4 h-4 mr-2" />
                            Lihat Detail
                          </Button>
                        )}
                        
                        {permission && permission.status !== "pending" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => printPermissionLetter(activity, permission)}
                          >
                            <Printer className="w-4 h-4 mr-2" />
                            Cetak Surat
                          </Button>
                        )}
                        
                        {(!permission || permission.status === "pending") && (
                          <>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleResponse(activity, "approved")}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Izinkan
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleResponse(activity, "rejected")}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Tidak Izinkan
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {studentData && (!activities || activities.length === 0) && (
          <Card>
            <CardContent className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Tidak ada kegiatan yang memerlukan izin saat ini
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {responseData.status === "approved" ? "Izinkan" : "Tidak Izinkan"} Kegiatan
            </DialogTitle>
            <DialogDescription>
              {selectedActivity && (
                <div className="mt-2 space-y-1">
                  <p className="font-medium">{selectedActivity.name}</p>
                  {(selectedActivity.start_date || selectedActivity.end_date) && (
                    <p className="text-sm">
                      {selectedActivity.start_date && selectedActivity.end_date ? (
                        <>
                          {new Date(selectedActivity.start_date).toLocaleDateString("id-ID")}
                          {" - "}
                          {new Date(selectedActivity.end_date).toLocaleDateString("id-ID")}
                        </>
                      ) : selectedActivity.start_date ? (
                        new Date(selectedActivity.start_date).toLocaleDateString("id-ID")
                      ) : null}
                    </p>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="parent_name">Nama Orang Tua/Wali *</Label>
              <Input
                id="parent_name"
                placeholder="Masukkan nama lengkap..."
                value={responseData.parent_name}
                onChange={(e) =>
                  setResponseData({ ...responseData, parent_name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent_response">Keterangan (opsional)</Label>
              <Textarea
                id="parent_response"
                placeholder="Tambahan keterangan..."
                value={responseData.parent_response}
                onChange={(e) =>
                  setResponseData({ ...responseData, parent_response: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <PenTool className="w-4 h-4" />
                Tanda Tangan *
              </Label>
              <div className="border-2 border-dashed border-muted rounded-lg p-2 bg-white">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={200}
                  className="w-full cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ border: "1px solid #e5e7eb" }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearCanvas}
                className="w-full"
              >
                Hapus Tanda Tangan
              </Button>
            </div>

            <Button
              onClick={() => respondMutation.mutate()}
              disabled={!responseData.parent_name.trim() || !signatureData || respondMutation.isPending}
              className="w-full"
            >
              {respondMutation.isPending ? "Menyimpan..." : "Kirim Respon"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParentPermission;
