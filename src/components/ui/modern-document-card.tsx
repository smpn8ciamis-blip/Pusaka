import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LucideIcon, Eye, FileDown, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ModernDocumentCardProps {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  badges?: Array<{ label: string; variant?: "default" | "secondary" | "destructive" | "outline" }>;
  details: Array<{ label: string; value: string | React.ReactNode }>;
  actions?: {
    onEdit?: () => void;
    onPreview?: () => void;
    onDownload?: () => void;
    onDelete?: () => void;
  };
  className?: string;
  status?: "active" | "pending" | "completed";
}

export function ModernDocumentCard({
  title,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
  badges,
  details,
  actions,
  className,
  status,
}: ModernDocumentCardProps) {
  const statusColors = {
    active: "from-green-500/10 to-emerald-500/5 border-green-500/20",
    pending: "from-amber-500/10 to-yellow-500/5 border-amber-500/20",
    completed: "from-blue-500/10 to-indigo-500/5 border-blue-500/20",
  };

  return (
    <Card className={cn(
      "group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5",
      "bg-gradient-to-br border",
      status ? statusColors[status] : "from-card to-card/80 border-border/50",
      className
    )}>
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn(
              "flex-shrink-0 p-2.5 rounded-xl",
              "bg-gradient-to-br from-primary/10 to-primary/5",
              "ring-1 ring-primary/20 shadow-sm"
            )}>
              <Icon className={cn("h-5 w-5", iconColor)} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold leading-tight truncate">
                {title}
              </CardTitle>
              {subtitle && (
                <CardDescription className="text-sm mt-1 line-clamp-1">
                  {subtitle}
                </CardDescription>
              )}
              {badges && badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {badges.map((badge, idx) => (
                    <Badge 
                      key={idx} 
                      variant={badge.variant || "secondary"}
                      className="text-[10px] px-2 py-0.5 font-medium"
                    >
                      {badge.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Quick actions dropdown for mobile */}
          {actions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actions.onEdit && (
                  <DropdownMenuItem onClick={actions.onEdit}>
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </DropdownMenuItem>
                )}
                {actions.onPreview && (
                  <DropdownMenuItem onClick={actions.onPreview}>
                    <Eye className="h-4 w-4 mr-2" /> Preview
                  </DropdownMenuItem>
                )}
                {actions.onDownload && (
                  <DropdownMenuItem onClick={actions.onDownload}>
                    <FileDown className="h-4 w-4 mr-2" /> Download
                  </DropdownMenuItem>
                )}
                {actions.onDelete && (
                  <DropdownMenuItem onClick={actions.onDelete} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Hapus
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="relative pt-0">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {details.map((detail, idx) => (
            <div key={idx} className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                {detail.label}
              </p>
              <p className="text-sm font-medium truncate">
                {detail.value}
              </p>
            </div>
          ))}
        </div>
        
        {/* Desktop action buttons */}
        {actions && (
          <div className="hidden md:flex items-center gap-2 mt-4 pt-3 border-t border-border/50">
            <TooltipProvider>
              {actions.onEdit && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={actions.onEdit}
                      className="h-8 flex-1"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit dokumen</TooltipContent>
                </Tooltip>
              )}
              {actions.onPreview && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      onClick={actions.onPreview}
                      className="h-8 flex-1"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      Preview
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Lihat preview</TooltipContent>
                </Tooltip>
              )}
              {actions.onDownload && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={actions.onDownload}
                      className="h-8 flex-1"
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />
                      PDF
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download PDF</TooltipContent>
                </Tooltip>
              )}
              {actions.onDelete && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={actions.onDelete}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Hapus</TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ModernPageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  children?: React.ReactNode;
}

export function ModernPageHeader({ title, description, icon: Icon, children }: ModernPageHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-6 mb-6">
      <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/25">
            <Icon className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-muted-foreground mt-1">{description}</p>
          </div>
        </div>
        {children && (
          <div className="flex items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

interface ModernStatsGridProps {
  stats: Array<{
    title: string;
    value: string | number;
    description?: string;
    icon: LucideIcon;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    color?: "primary" | "success" | "warning" | "danger" | "info";
  }>;
}

export function ModernStatsGrid({ stats }: ModernStatsGridProps) {
  const colorMap = {
    primary: "from-primary/20 to-primary/5 text-primary border-primary/20",
    success: "from-green-500/20 to-green-500/5 text-green-600 border-green-500/20",
    warning: "from-amber-500/20 to-amber-500/5 text-amber-600 border-amber-500/20",
    danger: "from-red-500/20 to-red-500/5 text-red-600 border-red-500/20",
    info: "from-blue-500/20 to-blue-500/5 text-blue-600 border-blue-500/20",
  };

  const iconColorMap = {
    primary: "from-primary to-primary/80",
    success: "from-green-500 to-green-600",
    warning: "from-amber-500 to-amber-600",
    danger: "from-red-500 to-red-600",
    info: "from-blue-500 to-blue-600",
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, idx) => {
        const color = stat.color || "primary";
        return (
          <Card key={idx} className={cn(
            "relative overflow-hidden transition-all duration-300 hover:shadow-md",
            "bg-gradient-to-br border",
            colorMap[color]
          )}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  {stat.description && (
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  )}
                  {stat.trendValue && (
                    <div className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                      stat.trend === "up" && "bg-green-500/10 text-green-600",
                      stat.trend === "down" && "bg-red-500/10 text-red-600",
                      stat.trend === "neutral" && "bg-gray-500/10 text-gray-600"
                    )}>
                      {stat.trend === "up" ? "↑" : stat.trend === "down" ? "↓" : "→"} {stat.trendValue}
                    </div>
                  )}
                </div>
                <div className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  "bg-gradient-to-br shadow-sm",
                  iconColorMap[color]
                )}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface ModernFilterBarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: React.ReactNode;
  totalCount?: number;
  filteredCount?: number;
}

export function ModernFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Cari...",
  children,
  totalCount,
  filteredCount,
}: ModernFilterBarProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/50",
              "bg-background/50 backdrop-blur-sm",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30",
              "placeholder:text-muted-foreground text-sm",
              "transition-all duration-200"
            )}
          />
        </div>
        {children && (
          <div className="flex flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>
      {(totalCount !== undefined || filteredCount !== undefined) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50">
            <span className="font-medium text-foreground">{filteredCount ?? totalCount}</span>
            {filteredCount !== undefined && totalCount !== undefined && filteredCount !== totalCount && (
              <span>dari {totalCount}</span>
            )}
            <span>dokumen</span>
          </span>
        </div>
      )}
    </div>
  );
}

interface ModernEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function ModernEmptyState({ icon: Icon, title, description, action }: ModernEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted/50 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground/50" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}
