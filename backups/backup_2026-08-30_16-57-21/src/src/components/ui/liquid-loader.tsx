import { cn } from "@/lib/utils";

interface LiquidLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const LiquidLoader = ({ className, size = "md" }: LiquidLoaderProps) => {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32"
  };

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        {/* Liquid blob animation */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-primary/80 to-primary/60 animate-liquid-blob opacity-80" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-primary/60 via-primary/40 to-primary/20 animate-liquid-blob-reverse opacity-60" />
        <div className="absolute inset-4 rounded-full bg-gradient-to-bl from-primary/40 via-primary/20 to-transparent animate-liquid-blob opacity-40" />
        
        {/* Center glow */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full bg-primary/80 animate-pulse shadow-lg shadow-primary/50" />
        </div>
        
        {/* Ripple effects */}
        <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-liquid-ripple" />
        <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-liquid-ripple-delay" />
      </div>
    </div>
  );
};

export const LiquidLoaderCard = ({ className }: { className?: string }) => {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm",
      className
    )}>
      {/* Animated liquid background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-[100%] animate-liquid-wave bg-gradient-to-r from-transparent via-primary/5 to-transparent" />
      </div>
      
      <div className="relative flex flex-col items-center justify-center py-12 px-6 space-y-4">
        <LiquidLoader size="md" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground animate-pulse">Memuat data</span>
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      </div>
    </div>
  );
};
