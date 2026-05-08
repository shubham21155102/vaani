// Themed dropdown matching the Vaani cyberpunk aesthetic.
// Replaces native <select> so we can style options + groups freely.
//
// Renders the open menu into document.body via a Portal so it can never
// be clipped by a parent stacking context (glass-panel uses backdrop-filter,
// which creates one — z-index alone can't escape it).
//
// Usage:
//   <Select value={x} onChange={setX} options={[{value, label}]} />
//   <Select value={x} onChange={setX} groups={[{label:"EN", options:[…]}]} />
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  meta?: string;       // small monospace text on the right (e.g. voice id)
  badge?: string;      // accent-colored short tag (e.g. "★", "🇮🇳")
  hint?: string;       // muted text under the label
  disabled?: boolean;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
  size?: "sm" | "md";
}

interface MenuRect {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
}

const MENU_GAP = 8;
const MENU_MARGIN = 16; // viewport edge breathing room
const MENU_MAX_HEIGHT = 320;

export function Select({
  value,
  onChange,
  options,
  groups,
  placeholder = "Select…",
  disabled = false,
  className = "",
  emptyText = "No options",
  size = "md",
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [rect, setRect] = useState<MenuRect | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Flatten so keyboard nav can index into a single linear list.
  const flat = useMemo<SelectOption[]>(
    () => (groups ? groups.flatMap((g) => g.options) : options || []),
    [groups, options]
  );
  const selected = flat.find((o) => o.value === value);

  // Position the portal-rendered menu relative to the trigger.
  const computeRect = (): MenuRect | null => {
    const t = triggerRef.current;
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom - MENU_MARGIN;
    const spaceAbove = r.top - MENU_MARGIN;
    const wantBelow = spaceBelow >= Math.min(MENU_MAX_HEIGHT, 160) || spaceBelow >= spaceAbove;
    const placement: "below" | "above" = wantBelow ? "below" : "above";
    const maxHeight = Math.max(
      160,
      Math.min(MENU_MAX_HEIGHT, placement === "below" ? spaceBelow : spaceAbove)
    );
    const top =
      placement === "below" ? r.bottom + MENU_GAP : Math.max(MENU_MARGIN, r.top - MENU_GAP - maxHeight);
    return {
      top,
      left: r.left,
      width: r.width,
      maxHeight,
      placement,
    };
  };

  // Recompute when opening, on scroll, on resize.
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    setRect(computeRect());
    const update = () => setRect(computeRect());
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Highlight selected option when opening, default to 0 if none.
  useEffect(() => {
    if (open) {
      const idx = flat.findIndex((o) => o.value === value);
      setHighlight(idx >= 0 ? idx : 0);
    }
  }, [open, flat, value]);

  // Outside click + keyboard.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => {
          let i = h;
          do {
            i = (i + 1) % flat.length;
          } while (flat[i]?.disabled && i !== h);
          return i;
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => {
          let i = h;
          do {
            i = (i - 1 + flat.length) % flat.length;
          } while (flat[i]?.disabled && i !== h);
          return i;
        });
      }
      if (e.key === "Home") {
        e.preventDefault();
        setHighlight(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        setHighlight(flat.length - 1);
      }
      if (e.key === "Enter" || e.key === " ") {
        const opt = flat[highlight];
        if (opt && !opt.disabled) {
          e.preventDefault();
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, flat, highlight, onChange]);

  // Auto-scroll highlighted option into view.
  useEffect(() => {
    if (!open || highlight < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const padY = size === "sm" ? "py-2" : "py-3";

  let optIdx = 0;
  const renderOption = (opt: SelectOption) => {
    const idx = optIdx++;
    const isSelected = opt.value === value;
    const isHighlighted = idx === highlight && !opt.disabled;
    return (
      <button
        key={`${opt.value}-${idx}`}
        type="button"
        data-idx={idx}
        disabled={opt.disabled}
        onMouseEnter={() => setHighlight(idx)}
        onClick={() => {
          if (opt.disabled) return;
          onChange(opt.value);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        className={[
          "w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors",
          "border-l-2",
          isHighlighted
            ? "bg-accent/10 border-accent text-accent shadow-[inset_0_0_20px_rgba(255,42,95,0.05)]"
            : "border-transparent hover:bg-panel-2/80 text-text/90",
          isSelected && !isHighlighted ? "text-accent text-glow" : "",
          opt.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="flex-1 min-w-0">
          <div className="text-sm font-bold tracking-tight truncate flex items-center gap-2 uppercase">
            {opt.label}
            {opt.badge && (
              <span className="text-[10px] font-mono font-black text-accent-2 bg-accent-2/10 px-1.5 py-0.5 rounded shrink-0">
                {opt.badge}
              </span>
            )}
          </div>
          {opt.hint && (
            <div className="text-[10px] font-mono text-muted/60 mt-1 truncate">
              {opt.hint}
            </div>
          )}
        </span>
        {opt.meta && (
          <span className="text-[10px] font-mono text-muted/40 truncate max-w-[120px] shrink-0 bg-bg/50 px-1.5 py-0.5 rounded border border-border/30">
            {opt.meta}
          </span>
        )}
        {isSelected && (
          <Check size={14} className="text-accent shrink-0 drop-shadow-[0_0_5px_#ff2a5f]" strokeWidth={3} />
        )}
      </button>
    );
  };

  const menu = open && rect ? (
    <div
      ref={listRef}
      role="listbox"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        maxHeight: rect.maxHeight,
        zIndex: 1000,
      }}
      className="rounded-2xl border border-accent/40 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(255,42,95,0.1)] overflow-y-auto bg-bg/95 backdrop-blur-2xl animate-slide-up origin-top"
    >
      {flat.length === 0 ? (
        <div className="p-6 text-sm text-muted/60 text-center font-mono uppercase tracking-widest">
          {emptyText}
        </div>
      ) : groups ? (
        groups.map((g) => (
          <div key={g.label}>
            <div className="px-5 py-2.5 text-[9px] font-display font-bold uppercase tracking-[0.2em] text-accent/70 border-b border-border/50 bg-panel-2/80 sticky top-0 backdrop-blur-md z-10">
              {g.label}
            </div>
            <div className="py-1">
              {g.options.map(renderOption)}
            </div>
          </div>
        ))
      ) : (
        <div className="py-1">
          {options?.map(renderOption)}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "w-full bg-panel-2/40 glass-panel border rounded-xl px-4 text-left",
          padY,
          "flex items-center gap-3 transition-all duration-300",
          open
            ? "border-accent ring-1 ring-accent/40 shadow-[0_0_25px_rgba(255,42,95,0.2)]"
            : "border-border/50 hover:border-accent/40 hover:bg-panel-2/60",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
      >
        <span className="flex-1 min-w-0 truncate text-sm">
          {selected ? (
            <span className="flex items-center gap-3 font-bold tracking-tight uppercase">
              <span className="truncate">{selected.label}</span>
              {selected.badge && (
                <span className="text-[10px] font-mono font-black text-accent-2 bg-accent-2/10 px-1.5 py-0.5 rounded shrink-0">
                  {selected.badge}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted/40 font-bold tracking-tight uppercase">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? "rotate-180 text-accent" : "text-muted/60"
          }`}
        />
      </button>

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
