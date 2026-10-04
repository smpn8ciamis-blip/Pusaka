import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, GraduationCap, Award, Sparkles, PartyPopper } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";
import { motion } from "framer-motion";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import ReCAPTCHA from 'react-google-recaptcha';
import { toast } from 'sonner';
import { RECAPTCHA_SITE_KEY } from '@/config/recaptcha';
import { useCaptchaConfig } from '@/hooks/useCaptchaConfig';

export default function PublicGraduationCheck() {
  const [nis, setNis] = useState("");
  const { captchaEnabled } = useCaptchaConfig();
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRef, setCaptchaRef] = useState<ReCAPTCHA | null>(null);
  const { width, height } = useWindowSize();

  const { data: schoolSettings } = useQuery({
    queryKey: ["school-settings-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_settings_public")
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: student, isLoading } = useQuery({
    queryKey: ["graduation-check", nis],
    queryFn: async () => {
      if (!nis.trim()) return null;
      
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(name)")
        .eq("nis", nis.trim())
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: searchTriggered && nis.trim().length > 0,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (captchaEnabled && !captchaToken) {
      toast.error("Silakan verifikasi captcha terlebih dahulu");
      return;
    }
    setSearchTriggered(true);
  };

  const isGraduated = student?.is_alumni === true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      {isGraduated && <Confetti width={width} height={height} recycle={false} numberOfPieces={500} />}
      
      <div className="w-full max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              {schoolSettings?.logo_url && (
                <img
                  src={schoolSettings.logo_url}
                  alt="Logo"
                  className="h-20 w-20 object-contain"
                />
              )}
            </div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Pengumuman Kelulusan
            </h1>
            <p className="text-muted-foreground">
              {schoolSettings?.school_name || "Sistem Manajemen Sekolah"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Tahun Ajaran {schoolSettings?.academic_year || "2024/2025"}
            </p>
          </div>

          <Card className="shadow-xl border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-primary" />
                Cek Status Kelulusan
              </CardTitle>
              <CardDescription>
                Masukkan NIS (Nomor Induk Siswa) untuk mengecek status kelulusan Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Masukkan NIS..."
                    value={nis}
                    onChange={(e) => {
                      setNis(e.target.value);
                      setSearchTriggered(false);
                    }}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isLoading || !nis.trim() || (captchaEnabled && !captchaToken)}>
                    <Search className="h-4 w-4 mr-2" />
                    Cek
                  </Button>
                </div>
                
                {captchaEnabled && (
                  <div className="flex justify-center mt-4">
                    <ReCAPTCHA
                      ref={(ref) => setCaptchaRef(ref)}
                      sitekey={RECAPTCHA_SITE_KEY}
                      onChange={(token) => setCaptchaToken(token)}
                    />
                  </div>
                )}
              </form>

              {searchTriggered && !isLoading && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  className="mt-6"
                >
                  {student ? (
                    isGraduated ? (
                      <div className="space-y-6">
                        <div className="bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-teal-500/10 border-2 border-green-500/30 rounded-lg p-6 text-center">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ 
                              type: "spring",
                              stiffness: 260,
                              damping: 20,
                              delay: 0.2 
                            }}
                            className="flex justify-center mb-4"
                          >
                            <div className="relative">
                              {student.photo_url ? (
                                <img 
                                  src={student.photo_url} 
                                  alt={student.full_name}
                                  className="h-24 w-24 rounded-full object-cover shadow-md border-4 border-green-300"
                                />
                              ) : (
                                <Award className="h-24 w-24 text-green-600" />
                              )}
                              <motion.div
                                animate={{ 
                                  rotate: [0, 10, -10, 10, 0],
                                  scale: [1, 1.1, 1]
                                }}
                                transition={{ 
                                  duration: 2,
                                  repeat: Infinity,
                                  repeatDelay: 3
                                }}
                                className="absolute -top-2 -right-2"
                              >
                                <Sparkles className="h-8 w-8 text-yellow-500" />
                              </motion.div>
                            </div>
                          </motion.div>
                          
                          <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="text-3xl font-bold text-green-700 mb-2 flex items-center justify-center gap-2"
                          >
                            <PartyPopper className="h-8 w-8" />
                            Selamat!
                            <PartyPopper className="h-8 w-8" />
                          </motion.h2>
                          
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                            className="text-lg font-semibold text-green-800 mb-4"
                          >
                            Anda Dinyatakan <span className="text-2xl">LULUS</span>
                          </motion.p>

                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.8 }}
                            className="bg-white/50 rounded-lg p-4 space-y-2"
                          >
                            <p className="text-sm text-muted-foreground">
                              <span className="font-semibold">Nama:</span> {student.full_name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              <span className="font-semibold">NIS:</span> {student.nis}
                            </p>
                            {student.nisn && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-semibold">NISN:</span> {student.nisn}
                              </p>
                            )}
                            {student.graduation_date && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-semibold">Tanggal Kelulusan:</span>{" "}
                                {format(new Date(student.graduation_date), "dd MMMM yyyy", {
                                  locale: id,
                                })}
                              </p>
                            )}
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 1 }}
                            className="mt-6 space-y-2"
                          >
                            <p className="text-green-700 font-medium italic">
                              "Pendidikan adalah senjata paling ampuh untuk mengubah dunia"
                            </p>
                            <p className="text-sm text-muted-foreground">- Nelson Mandela -</p>
                            <p className="mt-4 text-green-800">
                              Semoga ilmu yang telah didapat menjadi berkah dan bermanfaat untuk masa depan yang lebih cerah! 🎓
                            </p>
                          </motion.div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-yellow-500/10 border-2 border-yellow-500/30 rounded-lg p-6 text-center">
                        {student.photo_url ? (
                          <img 
                            src={student.photo_url} 
                            alt={student.full_name}
                            className="h-16 w-16 rounded-full object-cover mx-auto mb-4 border-2 border-yellow-300"
                          />
                        ) : (
                          <GraduationCap className="h-16 w-16 text-yellow-600 mx-auto mb-4" />
                        )}
                        <h3 className="text-xl font-semibold text-yellow-800 mb-2">
                          Status: Belum Lulus
                        </h3>
                        <div className="bg-white/50 rounded-lg p-4 space-y-2 mb-4">
                          <p className="text-sm text-muted-foreground">
                            <span className="font-semibold">Nama:</span> {student.full_name}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <span className="font-semibold">NIS:</span> {student.nis}
                          </p>
                        </div>
                        <p className="text-yellow-700">
                          Anda masih terdaftar sebagai siswa aktif. Tetap semangat dalam menjalani proses pembelajaran! 💪
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="bg-destructive/10 border-2 border-destructive/30 rounded-lg p-6 text-center">
                      <Search className="h-16 w-16 text-destructive mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-destructive mb-2">
                        Data Tidak Ditemukan
                      </h3>
                      <p className="text-muted-foreground">
                        NIS yang Anda masukkan tidak ditemukan dalam sistem. Pastikan NIS yang dimasukkan benar.
                      </p>
                    </div>
                  )}
                </motion.div>
              )}

              {isLoading && (
                <div className="mt-6 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                  <p className="mt-2 text-muted-foreground">Memeriksa data...</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="text-center mt-6">
            <Button
              variant="outline"
              onClick={() => window.location.href = "/auth"}
              className="gap-2"
            >
              Kembali ke Halaman Login
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
