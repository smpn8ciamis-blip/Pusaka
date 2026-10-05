import { useState, useMemo, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Reset highlight saat query berubah
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Auto-focus input saat popover terbuka
  useEffect(() => {
    if (open) {
      // delay sedikit agar Radix selesai render
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    } else {
      setQuery("");
    }
  }, [open]);

  // Scroll ke item yang di-highlight
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("button[data-option]");
    const item = items[highlightIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightIndex]) {
        onValueChange(filtered[highlightIndex].value);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const parts = text.split(
      new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")
    );
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 text-foreground rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const displayed = filtered.slice(0, 100);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
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
        sticky="always"
        className={cn(
          "p-0 z-[9999] flex flex-col",
          "w-[var(--radix-popover-trigger-width)]",
          contentClassName
        )}
        style={{
          minWidth: "min(560px, 90vw)",
          maxWidth: "min(90vw, 90vw)",
          // ✅ Tinggi total dibatasi oleh viewport
          maxHeight: "min(70vh, 560px)",
        }}
      >
        {/* Header dengan Search — STICKY */}
        <div className="flex items-center gap-2 border-b px-3 py-2 bg-popover shrink-0">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="h-8 border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 flex-1"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Bersihkan pencarian"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* List — SCROLL */}
        <div
          ref={listRef}
          className="overflow-y-auto py-1 flex-1 min-h-0"
        >
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Memuat data...
            </div>
          ) : displayed.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          ) : (
            displayed.map((opt, idx) => {
              const isSelected = value === opt.value;
              const isHighlight = highlightIndex === idx;
              return (
                <button
                  key={opt.value}
                  data-option
                  type="button"
                  onMouseEnter={() => setHighlightIndex(idx)}
                  onClick={() => {
                    onValueChange(isSelected ? "" : opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 transition-colors",
                    "flex items-start gap-2",
                    isHighlight && "bg-accent text-accent-foreground",
                    isSelected && !isHighlight && "bg-accent/40"
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
                      {highlightMatch(opt.label, query)}
                    </span>
                    {opt.description && (
                      <span className="text-xs text-muted-foreground leading-tight break-words">
                        {highlightMatch(opt.description, query)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer — STICKY */}
        <div className="border-t px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between bg-popover shrink-0">
          <span>
            {displayed.length} dari {filtered.length} item
            {filtered.length > 100 && " (persempit pencarian)"}
          </span>
          <span className="hidden sm:inline">
            ↑↓ navigasi • Enter pilih • Esc tutup
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SearchableSelect;
