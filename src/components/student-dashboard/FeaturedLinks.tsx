// Dua pintasan utama siswa: E-Learning dan Ujian CBT. Ditaruh paling atas beranda (mobile & desktop)
// agar tidak tersembunyi di antara menu lain.
import { GraduationCap, FileCheck, ArrowUpRight } from "lucide-react";

interface Props {
  onElearning: () => void;
  onCbt: () => void;
  /** "mobile": dua kartu berdampingan, ringkas. "desktop": kartu lebar dengan keterangan. */
  variant?: "mobile" | "desktop";
}

const ITEMS = [
  {
    key: "elearning",
    title: "E-Learning",
    desc: "Materi & tugas dari guru",
    icon: GraduationCap,
    grad: "from-[#1E6FE0] to-[#3A86EA]",
    ring: "focus-visible:outline-[#1E6FE0]",
  },
  {
    key: "cbt",
    title: "Ujian CBT",
    desc: "Kerjakan ujian online",
    icon: FileCheck,
    grad: "from-[#0F8F80] to-[#17A892]",
    ring: "focus-visible:outline-[#0F8F80]",
  },
] as const;

export function FeaturedLinks({ onElearning, onCbt, variant = "mobile" }: Props) {
  const desktop = variant === "desktop";
  return (
    <section aria-label="Belajar dan ujian" className="grid grid-cols-2 gap-3 md:gap-6">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          onClick={it.key === "cbt" ? onCbt : onElearning}
          className={`group relative flex overflow-hidden bg-gradient-to-br ${it.grad} text-left text-white shadow-[0_10px_24px_-12px_rgba(15,23,42,0.45)] transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${it.ring} ${
            desktop ? "items-center gap-5 rounded-[1.75rem] p-6 hover:-translate-y-0.5" : "flex-col gap-2.5 rounded-3xl p-4"
          }`}
        >
          <span
            aria-hidden
            className={`flex shrink-0 items-center justify-center rounded-2xl bg-white/20 ${desktop ? "h-14 w-14" : "h-11 w-11"}`}
          >
            <it.icon className={desktop ? "h-7 w-7" : "h-6 w-6"} strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className={`block font-semibold leading-tight tracking-tight ${desktop ? "text-xl" : "text-[15px]"}`}>{it.title}</span>
            <span className={`mt-0.5 block text-white/85 ${desktop ? "text-sm" : "text-[11.5px] leading-snug"}`}>{it.desc}</span>
          </span>
          <ArrowUpRight
            aria-hidden
            className={`absolute text-white/70 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${desktop ? "right-5 top-5 h-5 w-5" : "right-3 top-3 h-4 w-4"}`}
          />
        </button>
      ))}
    </section>
  );
}
