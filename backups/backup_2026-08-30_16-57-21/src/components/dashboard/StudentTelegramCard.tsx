import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Send, Link2, Save, Trash2, Loader2, SendHorizontal } from "lucide-react";

export const StudentTelegramCard = ({ studentId }: { studentId?: string }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [manual, setManual] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const detectTimer = useRef<number | null>(null);

  const { data: bot } = useQuery({
    queryKey: ["telegram-bot-info"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_telegram_bot_info");
      if (error) throw error;
      return data as { enabled: boolean; bot_username: string | null } | null;
    },
  });

  const { data: chatId, isLoading } = useQuery({
    queryKey: ["my-telegram-chat-id", studentId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_my_telegram_chat_id");
      if (error) throw error;
      return (data as string | null) ?? "";
    },
    refetchInterval: detecting ? 3000 : false,
  });

  const value = manual ?? chatId ?? "";

  // Stop the auto-detection polling as soon as the webhook saved the chat id
  useEffect(() => {
    if (detecting && chatId) {
      setDetecting(false);
      setManual(null);
      if (detectTimer.current) window.clearTimeout(detectTimer.current);
      toast({ title: "ID chat Telegram terdeteksi & tersimpan", description: chatId });
    }
  }, [chatId, detecting, toast]);

  useEffect(() => () => { if (detectTimer.current) window.clearTimeout(detectTimer.current); }, []);

  const startDetect = () => {
    setDetecting(true);
    if (detectTimer.current) window.clearTimeout(detectTimer.current);
    detectTimer.current = window.setTimeout(() => setDetecting(false), 120000);
    toast({
      title: "Menunggu koneksi Telegram…",
      description: "Tekan tombol START di Telegram, ID chat akan terisi otomatis di sini.",
    });
  };

  const save = async (next: string) => {
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("set_my_telegram_chat_id", { _chat_id: next });
      if (error) throw error;
      if (data === false) throw new Error("Akun Anda belum terhubung ke data siswa.");
      setManual(null);
      await qc.invalidateQueries({ queryKey: ["my-telegram-chat-id"] });
      toast({ title: next ? "ID chat Telegram tersimpan" : "ID chat Telegram dihapus" });
    } catch (e: any) {
      toast({ title: "Gagal menyimpan", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (chat: string) => {
    setTesting(true);
    try {
      if (chat !== chatId) await save(chat);
      const { data, error } = await supabase.functions.invoke("telegram-notify", {
        body: { test_chat_id: chat },
      });
      if (error) throw error;
      if ((data as any)?.ok === false) throw new Error((data as any)?.error ?? (data as any)?.message ?? "Gagal mengirim pesan tes.");
      toast({
        title: "Pesan tes terkirim",
        description: "Cek Telegram Anda — pesan tes koneksi sudah dikirim bot sekolah.",
      });
    } catch (e: any) {
      toast({ title: "Tes koneksi gagal", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };


  const connectUrl =
    bot?.bot_username && studentId ? `https://t.me/${bot.bot_username}?start=${studentId}` : null;

  return (
    <Card className="shadow-sm border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="w-8 h-8 bg-sky-500/10 rounded-lg flex items-center justify-center">
            <Send className="h-4 w-4 text-sky-500" />
          </div>
          Notifikasi Telegram Orang Tua
        </CardTitle>
        <CardDescription>
          Hubungkan Telegram agar orang tua menerima notifikasi setiap kali Anda tap kartu absensi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : chatId ? (
            <Badge className="bg-emerald-500 text-white">Terhubung</Badge>
          ) : detecting ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Mendeteksi…
            </Badge>
          ) : (
            <Badge variant="outline">Belum terhubung</Badge>
          )}
        </div>

        {connectUrl ? (
          <Button asChild className="gap-2 w-full sm:w-auto" onClick={startDetect}>
            <a href={connectUrl} target="_blank" rel="noreferrer">
              <Link2 className="h-4 w-4" /> Deteksi Otomatis via Telegram
            </a>
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Bot Telegram belum dikonfigurasi admin. Anda masih bisa mengisi ID chat manual di bawah.
          </p>
        )}
        {detecting && (
          <p className="text-xs text-muted-foreground">
            Buka Telegram lalu tekan <strong>START</strong>. Kolom ID chat akan terisi otomatis dan langsung tersimpan.
          </p>
        )}

        <div className="space-y-2">
          <Label>ID Chat Telegram (manual)</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              className="font-mono"
              placeholder="mis. 123456789"
              value={value}
              onChange={(e) => setManual(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => save(value)} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" /> Simpan
              </Button>
              <Button
                variant="secondary"
                disabled={testing || !value.trim()}
                onClick={() => testConnection(value.trim())}
                className="gap-2"
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                Tes Koneksi
              </Button>
              <Button
                variant="outline"
                disabled={saving || !chatId}
                onClick={() => save("")}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" /> Hapus
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Untuk mengetahui ID chat, kirim pesan apa pun ke bot sekolah — bot akan membalas dengan ID chat Anda.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
