import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  contentClassName?: string;
  maxHeight?: string;
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyMessage = "Tidak ada data.",
  disabled = false,
  loading = false,
  className,
  contentClassName,
  maxHeight = "400px",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((opt) => {
      const haystack = `${opt.label} ${opt.description || ""} ${opt.keywords || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [options, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
      modal={false}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            "w-full justify-between font-normal h-auto min-h-10 py-2",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate text-left pr-2">
            {loading
              ? "Memuat..."
              : selected
              ? selected.label
              : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        avoidCollisions={true}
        collisionPadding={16}
        className={cn(
          "p-0 z-[9999] w-[var(--radix-popover-trigger-width)]",
          contentClassName
        )}
        style={{
          minWidth: "min(560px, 90vw)",
          maxWidth: "90vw",
        }}
        // Render ke body agar tidak terpotong dialog
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col" style={{ maxHeight: `calc(${maxHeight} + 60px)` }}>
          {/* Header dengan Search */}
          <div className="flex items-center gap-2 border-b px-3 py-2 sticky top-0 bg-popover z-10">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          {/* List */}
          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: maxHeight }}
          >
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Memuat data...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filtered.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onValueChange(isSelected ? "" : opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground",
                      "flex items-start gap-2 transition-colors",
                      isSelected && "bg-accent/60"
                    )}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mt-0.5 shrink-0",
                        isSelected ? "opacity-100 text-primary" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                      <span className="text-sm font-medium leading-tight break-words">
                        {opt.label}
                      </span>
                      {opt.description && (
                        <span className="text-xs text-muted-foreground leading-tight break-words">
                          {opt.description}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between sticky bottom-0 bg-popover">
            <span>
              {filtered.length} dari {options.length} item
            </span>
            <span className="hidden sm:inline">↑↓ navigasi • Enter pilih • Esc tutup</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SearchableSelect;
