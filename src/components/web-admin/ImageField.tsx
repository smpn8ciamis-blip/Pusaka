import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadWebsiteImage } from "@/lib/websiteMedia";

interface Props {
  value: string;
  onChange: (url: string) => void;
  folder?: string;
  placeholder?: string;
}

/** Pilih foto dari galeri/kamera HP (diunggah otomatis) atau tempel URL gambar. */
export default function ImageField({ value, onChange, folder = "umum", placeholder = "https://… atau unggah foto" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadWebsiteImage(file, folder));
      toast.success("Gambar terunggah");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengunggah gambar");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-full max-w-xs overflow-hidden rounded-xl border bg-slate-50">
          <img src={value} alt="" loading="lazy" decoding="async" className="h-40 w-full object-cover" onError={(e) => ((e.currentTarget.style.opacity = "0.3"))} />
          <button type="button" onClick={() => onChange("")} aria-label="Hapus gambar"
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1" />
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => ref.current?.click()} className="shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">{busy ? "Mengunggah…" : "Unggah"}</span>
        </Button>
      </div>
    </div>
  );
}
