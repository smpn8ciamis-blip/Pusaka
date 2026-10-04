// src/components/LiquidLoader.tsx
import { cn } from "@/lib/utils";

// ═════════════════════════════════════════════════════════════
// TYPES
// ═════════════════════════════════════════════════════════════
export type LoaderSize = "xs" | "sm" | "md" | "lg" | "xl";
export type LoaderAccent =
  | "primary"
  | "secondary"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "violet";

export interface LiquidLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg" | LoaderSize;
  /** URL logo. Jika kosong, akan tampil dot gradient di tengah */
  logoSrc?: string;
  logoAlt?: string;
  accent?: LoaderAccent;
  /** Ketebalan ring (px). Default: mengikuti ukuran */
  ringWidth?: number;
  /** Kecepatan rotasi (detik). Default: 2.4 */
  speed?: number;
  /** Tampilkan orb dot yang mengorbit. Default: true */
  showOrb?: boolean;
  /** Tampilkan ambient halo di belakang logo. Default: true */
  showHalo?: boolean;
}

export interface LiquidLoaderCardProps {
  className?: string;
  /** URL logo opsional */
  logoSrc?: string;
  /** Teks status. Default: "Memuat data" */
  message?: string;
  size?: LoaderSize;
  accent?: LoaderAccent;
  /** Tampilkan sheen sweep effect. Default: true */
  showSheen?: boolean;
}

export interface LiquidLoaderOverlayProps {
  className?: string;
  logoSrc?: string;
  message?: string;
  accent?: LoaderAccent;
}

// ═════════════════════════════════════════════════════════════
// SIZE MAP
// ═════════════════════════════════════════════════════════════
const SIZE_MAP: Record<
  LoaderSize,
  { box: string; logo: string; dot: string; haloInset: string; px: number }
> = {
  xs: { box: "w-10 h-10", logo: "w-5 h-5",   dot: "w-1 h-1",     haloInset: "inset-1", px: 1.5 },
  sm: { box: "w-16 h-16", logo: "w-8 h-8",   dot: "w-1.5 h-1.5", haloInset: "inset-2", px: 2 },
  md: { box: "w-24 h-24", logo: "w-12 h-12", dot: "w-2 h-2",     haloInset: "inset-3", px: 2 },
  lg: { box: "w-32 h-32", logo: "w-16 h-16", dot: "w-2.5 h-2.5", haloInset: "inset-4", px: 2.5 },
  xl: { box: "w-44 h-44", logo: "w-24 h-24", dot: "w-3 h-3",     haloInset: "inset-5", px: 3 },
};

// ═════════════════════════════════════════════════════════════
// ACCENT MAP
// ═════════════════════════════════════════════════════════════
const ACCENT_MAP: Record<
  LoaderAccent,
  {
    conic: string;
    ring: string;
    orb: string;
    orbGlow: string;
    halo: string;
    center: string;
  }
> = {
  primary: {
    conic: "hsl(var(--primary) / 0.55)",
    ring: "border-primary/15",
    orb: "bg-primary",
    orbGlow: "shadow-[0_0_10px_2px_hsl(var(--primary)/0.6)]",
    halo: "bg-primary/30",
    center: "from-primary to-primary/70",
  },
  secondary: {
    conic: "hsl(var(--secondary) / 0.55)",
    ring: "border-secondary/15",
    orb: "bg-secondary",
    orbGlow: "shadow-[0_0_10px_2px_hsl(var(--secondary)/0.6)]",
    halo: "bg-secondary/30",
    center: "from-secondary to-secondary/70",
  },
  emerald: {
    conic: "rgb(16 185 129 / 0.55)",
    ring: "border-emerald-500/15",
    orb: "bg-emerald-500",
    orbGlow: "shadow-[0_0_10px_2px_rgb(16_185_129_/_0.6)]",
    halo: "bg-emerald-500/30",
    center: "from-emerald-500 to-emerald-500/70",
  },
  amber: {
    conic: "rgb(245 158 11 / 0.55)",
    ring: "border-amber-500/15",
    orb: "bg-amber-500",
    orbGlow: "shadow-[0_0_10px_2px_rgb(245_158_11_/_0.6)]",
    halo: "bg-amber-500/30",
    center: "from-amber-500 to-amber-500/70",
  },
  rose: {
    conic: "rgb(244 63 94 / 0.55)",
    ring: "border-rose-500/15",
    orb: "bg-rose-500",
    orbGlow: "shadow-[0_0_10px_2px_rgb(244_63_94_/_0.6)]",
    halo: "bg-rose-500/30",
    center: "from-rose-500 to-rose-500/70",
  },
  sky: {
    conic: "rgb(14 165 233 / 0.55)",
    ring: "border-sky-500/15",
    orb: "bg-sky-500",
    orbGlow: "shadow-[0_0_10px_2px_rgb(14_165_233_/_0.6)]",
    halo: "bg-sky-500/30",
    center: "from-sky-500 to-sky-500/70",
  },
  violet: {
    conic: "rgb(139 92 246 / 0.55)",
    ring: "border-violet-500/15",
    orb: "bg-violet-500",
    orbGlow: "shadow-[0_0_10px_2px_rgb(139_92_246_/_0.6)]",
    halo: "bg-violet-500/30",
    center: "from-violet-500 to-violet-500/70",
  },
};

// ═════════════════════════════════════════════════════════════
// INLINE STYLES (self-contained, idempotent inject)
// ═════════════════════════════════════════════════════════════
const LOADER_STYLES = `
  @keyframes liquid-orbit-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes liquid-soft-pulse {
    0%, 100% { opacity: 0.35; transform: scale(1); }
    50%      { opacity: 0.65; transform: scale(1.08); }
  }
  @keyframes liquid-sheen {
    from { transform: translateX(0); }
    to   { transform: translateX(50%); }
  }
  @keyframes liquid-bounce-dot {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
    40%           { transform: translateY(-4px); opacity: 1; }
  }
  .liquid-orbit-spin   { animation: liquid-orbit-spin var(--liquid-speed, 2.4s) linear infinite; }
  .liquid-soft-pulse   { animation: liquid-soft-pulse 2s ease-in-out infinite; }
  .liquid-sheen        { animation: liquid-sheen 2.8s ease-in-out infinite; }
  .liquid-bounce-dot   { animation: liquid-bounce-dot 1.2s ease-in-out infinite; }
  .liquid-contain      { contain: layout style paint; }
  .liquid-gpu          { transform: translateZ(0); }

  @media (prefers-reduced-motion: reduce) {
    .liquid-orbit-spin { animation: none !important; transform: rotate(45deg); }
    .liquid-soft-pulse,
    .liquid-sheen,
    .liquid-bounce-dot { animation: none !important; }
    .liquid-soft-pulse { opacity: 0.5; }
  }
`;

const STYLE_ID = "__liquid_loader_styles__";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = LOADER_STYLES;
  document.head.appendChild(el);
}

// ═════════════════════════════════════════════════════════════
// MAIN — LiquidLoader (Orbit Style)
// ═════════════════════════════════════════════════════════════
export const LiquidLoader = ({
  className,
  size = "md",
  logoSrc,
  logoAlt = "Logo",
  accent = "primary",
  ringWidth,
  speed = 2.4,
  showOrb = true,
  showHalo = true,
}: LiquidLoaderProps) => {
  ensureStyles();

  const s = SIZE_MAP[size as LoaderSize] ?? SIZE_MAP.md;
  const a = ACCENT_MAP[accent];
  const rw = ringWidth ?? s.px;

  // Mask untuk conic gradient → bikin "donut" (lubang di tengah)
  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${rw}px), black calc(100% - ${rw}px))`;

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="status"
      aria-live="polite"
      aria-label="Memuat"
    >
      <div
        className={cn("relative liquid-gpu liquid-contain", s.box)}
        style={{ ["--liquid-speed" as string]: `${speed}s` }}
      >
        {/* ── Layer 1: Base faint ring ── */}
        <div className={cn("absolute inset-0 rounded-full border", a.ring)} />

        {/* ── Layer 2: Rotating conic gradient (light beam) ── */}
        <div
          className="absolute inset-0 rounded-full liquid-orbit-spin"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, ${a.conic} 80deg, transparent 160deg, transparent 360deg)`,
            maskImage: ringMask,
            WebkitMaskImage: ringMask,
            willChange: "transform",
          }}
        />

        {/* ── Layer 3: Orbiting glow dot ── */}
        {showOrb && (
          <div
            className="absolute inset-0 liquid-orbit-spin"
            style={{ willChange: "transform" }}
          >
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                s.dot,
                a.orb,
                a.orbGlow,
              )}
              style={{ top: rw / 2 }}
            />
          </div>
        )}

        {/* ── Layer 4: Ambient halo (blur statis) ── */}
        {showHalo && (
          <div
            className={cn(
              "absolute rounded-full blur-md opacity-50 pointer-events-none",
              s.haloInset,
              a.halo,
            )}
          />
        )}

        {/* ── Layer 5: Center content (logo / dot) ── */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* pulse di belakang logo */}
            <div
              className={cn(
                "absolute inset-0 rounded-full blur-sm liquid-soft-pulse",
                a.halo,
              )}
            />
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={logoAlt}
                draggable={false}
                className={cn(
                  "relative object-contain drop-shadow-sm select-none",
                  s.logo,
                )}
              />
            ) : (
              <div
                className={cn(
                  "relative rounded-full bg-gradient-to-br shadow-inner",
                  s.logo,
                  a.center,
                )}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════
// LiquidLoaderCard — card wrapper dengan sheen sweep
// ═════════════════════════════════════════════════════════════
export const LiquidLoaderCard = ({
  className,
  logoSrc,
  message = "Memuat data",
  size = "md",
  accent = "primary",
  showSheen = true,
}: LiquidLoaderCardProps) => {
  ensureStyles();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-card/60 backdrop-blur-md liquid-contain",
        className,
      )}
    >
      {/* Sheen sweep (transform only) */}
      {showSheen && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-y-0 -left-full w-[200%] liquid-sheen bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
        </div>
      )}

      {/* Top hairline */}
      <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="relative flex flex-col items-center justify-center py-12 px-6 space-y-5">
        <LiquidLoader size={size} logoSrc={logoSrc} accent={accent} />

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground/80 font-light tracking-wide">
            {message}
          </span>
          <span className="flex gap-1" aria-hidden="true">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="w-1 h-1 rounded-full bg-primary/70 liquid-bounce-dot"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
        </div>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════
// LiquidLoaderOverlay — fullscreen blocking overlay (bonus)
// ═════════════════════════════════════════════════════════════
export const LiquidLoaderOverlay = ({
  className,
  logoSrc,
  message = "Memuat…",
  accent = "primary",
}: LiquidLoaderOverlayProps) => {
  ensureStyles();

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-background/70 backdrop-blur-md",
        "animate-in fade-in duration-200",
        className,
      )}
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-6">
        <LiquidLoader size="lg" logoSrc={logoSrc} accent={accent} />
        {message && (
          <p className="text-sm text-muted-foreground/80 font-light tracking-wide">
            {message}
          </p>
        )}
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════
// LiquidLoaderInline — versi mini untuk tombol/inline (bonus)
// ═════════════════════════════════════════════════════════════
export const LiquidLoaderInline = ({
  className,
  accent = "primary",
  size = "xs",
}: Pick<LiquidLoaderProps, "className" | "accent" | "size">) => (
  <LiquidLoader
    className={className}
    size={size}
    accent={accent}
    showOrb={false}
    showHalo={false}
  />
);