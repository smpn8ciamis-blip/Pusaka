import { cn } from "@/lib/utils";
import { useCountAnimation } from "@/hooks/useCountAnimation";

interface WaterProgressLoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  progress?: number;
  isLoading?: boolean;
  showPercentage?: boolean;
}

export const WaterProgressLoader = ({ 
  className, 
  size = "md",
  progress = 0,
  isLoading = true,
  showPercentage = true
}: WaterProgressLoaderProps) => {
  const sizeClasses = {
    sm: { container: "w-20 h-20", text: "text-xl", percent: "text-xs" },
    md: { container: "w-28 h-28", text: "text-3xl", percent: "text-sm" },
    lg: { container: "w-36 h-36", text: "text-4xl", percent: "text-base" }
  };

  const animatedProgress = useCountAnimation(
    isLoading ? 100 : progress, 
    false, 
    { duration: isLoading ? 3000 : 1500, easing: 'easeOut' }
  );

  const displayProgress = isLoading ? animatedProgress % 100 : progress;
  const waterLevel = 100 - displayProgress;

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className={cn("relative", sizeClasses[size].container)}>
        {/* Circle border */}
        <div className="absolute inset-0 rounded-full border-2 border-primary" />
        
        {/* Water container with clip */}
        <div className="absolute inset-[2px] rounded-full overflow-hidden">
          {/* Water fill */}
          <div 
            className="absolute inset-0 transition-all duration-500 ease-out"
            style={{ 
              top: `${waterLevel}%`,
              background: 'hsl(var(--primary) / 0.7)'
            }}
          >
            {/* Wave animation */}
            <svg 
              className="absolute -top-2 left-0 w-[200%] animate-water-wave"
              viewBox="0 0 1440 40" 
              preserveAspectRatio="none"
              style={{ height: '12px' }}
            >
              <path 
                d="M0,20 C120,35 240,5 360,20 C480,35 600,5 720,20 C840,35 960,5 1080,20 C1200,35 1320,5 1440,20 L1440,40 L0,40 Z"
                fill="hsl(var(--primary) / 0.8)"
              />
            </svg>
            <svg 
              className="absolute -top-1 left-0 w-[200%] animate-water-wave-reverse"
              viewBox="0 0 1440 40" 
              preserveAspectRatio="none"
              style={{ height: '10px' }}
            >
              <path 
                d="M0,20 C120,5 240,35 360,20 C480,5 600,35 720,20 C840,5 960,35 1080,20 C1200,5 1320,35 1440,20 L1440,40 L0,40 Z"
                fill="hsl(var(--primary) / 0.5)"
              />
            </svg>
          </div>
        </div>

        {/* Percentage text */}
        {showPercentage && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className={cn("font-bold text-primary", sizeClasses[size].text)}>
              {displayProgress}
              <span className={cn("font-normal", sizeClasses[size].percent)}>%</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const WaterLoaderCard = ({ className }: { className?: string }) => {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm",
      className
    )}>
      <div className="relative flex flex-col items-center justify-center py-12 px-6 space-y-4">
        <WaterProgressLoader size="md" isLoading={true} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Memuat data</span>
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
