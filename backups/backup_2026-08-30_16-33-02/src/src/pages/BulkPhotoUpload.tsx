import { useState, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, ImageIcon, Users, GraduationCap, CheckCircle2, XCircle, AlertTriangle, FileArchive, Loader2 } from "lucide-react";

interface PhotoMatch {
  fileName: string;
  identifier: string; // NISN for students, name for teachers
  matchedId: string | null;
  matchedName: string | null;
  status: "matched" | "unmatched" | "uploading" | "done" | "error";
  file: File;
  errorMessage?: string;
}

export default function BulkPhotoUpload() {
  const [activeTab, setActiveTab] = useState("students");
  const [photoMatches, setPhotoMatches] = useState<PhotoMatch[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState({ success: 0, failed: 0, total: 0 });

  const extractIdentifierFromFileName = (fileName: string): string => {
    // Remove extension, normalize
    const nameWithoutExt = fileName.replace(/\.(jpg|jpeg|png)$/i, "");
    // Remove any prefix/suffix patterns, trim
    return nameWithoutExt.trim();
  };

  const processFiles = async (files: File[]) => {
    setIsProcessing(true);
    setPhotoMatches([]);
    setUploadStats({ success: 0, failed: 0, total: 0 });

    try {
      const imageFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name));
      
      if (imageFiles.length === 0) {
        toast.error("Tidak ditemukan file gambar (JPG/PNG)");
        setIsProcessing(false);
        return;
      }

      const matches: PhotoMatch[] = [];

      if (activeTab === "students") {
        // Extract NISN from filenames and match with students
        const identifiers = imageFiles.map(f => extractIdentifierFromFileName(f.name));
        
        // Fetch all students with NISN
        const { data: students } = await supabase
          .from("students")
          .select("id, nisn, full_name")
          .in("nisn", identifiers);

        const studentMap = new Map(students?.map(s => [s.nisn, s]) || []);

        for (const file of imageFiles) {
          const identifier = extractIdentifierFromFileName(file.name);
          const student = studentMap.get(identifier);
          
          matches.push({
            fileName: file.name,
            identifier,
            matchedId: student?.id || null,
            matchedName: student?.full_name || null,
            status: student ? "matched" : "unmatched",
            file,
          });
        }
      } else {
        // For teachers, match by name (case-insensitive)
        const identifiers = imageFiles.map(f => extractIdentifierFromFileName(f.name).toLowerCase());
        
        // Fetch all teachers with profiles
        const { data: teachers } = await supabase
          .from("teachers")
          .select("id, user_id");

        const teacherUserIds = teachers?.map(t => t.user_id).filter(Boolean) || [];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", teacherUserIds);

        // Create a map: lowercase name -> teacher
        const teacherProfileMap = new Map<string, { teacherId: string; fullName: string }>();
        teachers?.forEach(t => {
          const profile = profiles?.find(p => p.id === t.user_id);
          if (profile?.full_name) {
            teacherProfileMap.set(profile.full_name.toLowerCase(), {
              teacherId: t.id,
              fullName: profile.full_name,
            });
          }
        });

        for (const file of imageFiles) {
          const identifier = extractIdentifierFromFileName(file.name);
          const match = teacherProfileMap.get(identifier.toLowerCase());
          
          matches.push({
            fileName: file.name,
            identifier,
            matchedId: match?.teacherId || null,
            matchedName: match?.fullName || null,
            status: match ? "matched" : "unmatched",
            file,
          });
        }
      }

      setPhotoMatches(matches);
      
      const matchedCount = matches.filter(m => m.status === "matched").length;
      toast.info(`${matchedCount} dari ${matches.length} foto berhasil dicocokkan`);
    } catch (error) {
      console.error("Error processing files:", error);
      toast.error("Gagal memproses file");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // Check if ZIP file
    const zipFile = fileArray.find(f => /\.zip$/i.test(f.name));
    
    if (zipFile) {
      // Import JSZip dynamically
      try {
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(zipFile);
        const extractedFiles: File[] = [];
        
        const entries = Object.entries(zip.files);
        for (const [path, zipEntry] of entries) {
          if (zipEntry.dir) continue;
          if (!/\.(jpg|jpeg|png)$/i.test(path)) continue;
          
          const blob = await zipEntry.async("blob");
          const fileName = path.split("/").pop() || path;
          const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });
          extractedFiles.push(file);
        }
        
        if (extractedFiles.length === 0) {
          toast.error("Tidak ditemukan file gambar dalam ZIP");
          return;
        }
        
        toast.success(`Berhasil mengekstrak ${extractedFiles.length} foto dari ZIP`);
        await processFiles(extractedFiles);
      } catch (error) {
        console.error("Error extracting ZIP:", error);
        toast.error("Gagal mengekstrak file ZIP");
      }
    } else {
      // Direct image files
      const imageFiles = fileArray.filter(f => /\.(jpg|jpeg|png)$/i.test(f.name));
      if (imageFiles.length === 0) {
        toast.error("Pilih file gambar (JPG/PNG) atau file ZIP");
        return;
      }
      await processFiles(imageFiles);
    }
    
    // Reset input
    e.target.value = "";
  };

  const handleUpload = async () => {
    const matchedPhotos = photoMatches.filter(m => m.status === "matched");
    if (matchedPhotos.length === 0) {
      toast.error("Tidak ada foto yang cocok untuk diunggah");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    let success = 0;
    let failed = 0;
    const total = matchedPhotos.length;

    for (let i = 0; i < matchedPhotos.length; i++) {
      const match = matchedPhotos[i];
      
      // Update status to uploading
      setPhotoMatches(prev => prev.map(m => 
        m.fileName === match.fileName ? { ...m, status: "uploading" as const } : m
      ));

      try {
        const fileExt = match.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const prefix = activeTab === "students" ? "student" : "teacher";
        const fileName = `${prefix}-${match.identifier}-${Date.now()}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("student-photos")
          .upload(fileName, match.file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("student-photos")
          .getPublicUrl(fileName);

        // Update database record
        if (activeTab === "students") {
          const { error: updateError } = await supabase
            .from("students")
            .update({ photo_url: urlData.publicUrl })
            .eq("id", match.matchedId!);
          if (updateError) throw updateError;
        } else {
          const { error: updateError } = await supabase
            .from("teachers")
            .update({ photo_url: urlData.publicUrl } as any)
            .eq("id", match.matchedId!);
          if (updateError) throw updateError;
        }

        success++;
        setPhotoMatches(prev => prev.map(m => 
          m.fileName === match.fileName ? { ...m, status: "done" as const } : m
        ));
      } catch (error: any) {
        failed++;
        setPhotoMatches(prev => prev.map(m => 
          m.fileName === match.fileName ? { ...m, status: "error" as const, errorMessage: error.message } : m
        ));
      }

      setUploadProgress(((i + 1) / total) * 100);
      setUploadStats({ success, failed, total });
    }

    setIsUploading(false);
    
    if (failed === 0) {
      toast.success(`Semua ${success} foto berhasil diunggah!`);
    } else {
      toast.warning(`${success} berhasil, ${failed} gagal dari ${total} foto`);
    }
  };

  const matchedCount = photoMatches.filter(m => m.status === "matched" || m.status === "done").length;
  const unmatchedCount = photoMatches.filter(m => m.status === "unmatched").length;

  return (
    <ProtectedRoute requireRole="admin">
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Upload Foto Massal</h1>
            <p className="text-muted-foreground">Upload foto siswa dan guru secara massal</p>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPhotoMatches([]); }}>
            <TabsList>
              <TabsTrigger value="students" className="gap-2">
                <GraduationCap className="h-4 w-4" />
                Foto Siswa
              </TabsTrigger>
              <TabsTrigger value="teachers" className="gap-2">
                <Users className="h-4 w-4" />
                Foto Guru
              </TabsTrigger>
            </TabsList>

            <TabsContent value="students" className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Format nama file:</strong> Gunakan <strong>NISN</strong> sebagai nama file. 
                  Contoh: <code>1234567890.jpg</code> akan dicocokkan dengan siswa ber-NISN <code>1234567890</code>.
                  Anda juga bisa upload file ZIP yang berisi foto-foto tersebut.
                </AlertDescription>
              </Alert>
            </TabsContent>

            <TabsContent value="teachers" className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Format nama file:</strong> Gunakan <strong>nama lengkap guru</strong> sebagai nama file. 
                  Contoh: <code>Ahmad Subekti.jpg</code> akan dicocokkan dengan guru bernama <code>Ahmad Subekti</code>.
                  Pencocokan tidak case-sensitive. Anda juga bisa upload file ZIP.
                </AlertDescription>
              </Alert>
            </TabsContent>
          </Tabs>

          {/* Upload Area */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Pilih File
              </CardTitle>
              <CardDescription>
                Upload file gambar (JPG/PNG) atau file ZIP yang berisi foto-foto
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-full bg-muted">
                      {isProcessing ? (
                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <Label htmlFor="photo-upload" className="cursor-pointer">
                        <span className="text-primary font-medium hover:underline">
                          Klik untuk memilih file
                        </span>
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        JPG, PNG, atau ZIP (maks. 50MB per file)
                      </p>
                    </div>
                    <Input
                      id="photo-upload"
                      type="file"
                      accept=".jpg,.jpeg,.png,.zip"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                      disabled={isProcessing || isUploading}
                    />
                    <div className="flex gap-2">
                      <Badge variant="outline" className="gap-1">
                        <ImageIcon className="h-3 w-3" /> JPG/PNG
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        <FileArchive className="h-3 w-3" /> ZIP
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {photoMatches.length > 0 && (
            <>
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ImageIcon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{photoMatches.length}</p>
                        <p className="text-sm text-muted-foreground">Total Foto</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-green-500">{matchedCount}</p>
                        <p className="text-sm text-muted-foreground">Cocok</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-destructive/10">
                        <XCircle className="h-5 w-5 text-destructive" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-destructive">{unmatchedCount}</p>
                        <p className="text-sm text-muted-foreground">Tidak Cocok</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <Card>
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Mengunggah foto...</span>
                      <span>{uploadStats.success + uploadStats.failed}/{uploadStats.total}</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </CardContent>
                </Card>
              )}

              {/* Upload Button */}
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setPhotoMatches([])}
                  disabled={isUploading}
                >
                  Reset
                </Button>
                <Button 
                  onClick={handleUpload}
                  disabled={isUploading || matchedCount === 0}
                  className="gap-2"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload {matchedCount} Foto yang Cocok
                </Button>
              </div>

              {/* Match Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Hasil Pencocokan</CardTitle>
                  <CardDescription>
                    {activeTab === "students" 
                      ? "Pencocokan berdasarkan NISN pada nama file" 
                      : "Pencocokan berdasarkan nama guru pada nama file"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama File</TableHead>
                        <TableHead>{activeTab === "students" ? "NISN" : "Nama"}</TableHead>
                        <TableHead>Hasil</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {photoMatches.map((match, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-sm">{match.fileName}</TableCell>
                          <TableCell>{match.identifier}</TableCell>
                          <TableCell>
                            {match.matchedName ? (
                              <span className="font-medium">{match.matchedName}</span>
                            ) : (
                              <span className="text-muted-foreground italic">Tidak ditemukan</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {match.status === "matched" && (
                              <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Cocok
                              </Badge>
                            )}
                            {match.status === "unmatched" && (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                                <XCircle className="h-3 w-3 mr-1" /> Tidak Cocok
                              </Badge>
                            )}
                            {match.status === "uploading" && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Mengunggah
                              </Badge>
                            )}
                            {match.status === "done" && (
                              <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Selesai
                              </Badge>
                            )}
                            {match.status === "error" && (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" /> Gagal
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
