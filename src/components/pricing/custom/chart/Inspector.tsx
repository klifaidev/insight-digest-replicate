// Reusable inspector primitives for the chart editor — Apple-style refresh.
// Sentence-case labels, h-8 inputs, p-3 cards, popover color picker.

import { useState } from "react";
import { ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select as RxSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BRAND_COLORS } from "./types";

export function Section({
  title, defaultOpen = false, children, onReset,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/50 bg-card/40">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-1.5 text-left text-[12px] font-medium text-foreground/85 hover:text-foreground">
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
          <span>{title}</span>
        </button>
        {onReset && open && (
          <button type="button" onClick={onReset} title="Restaurar padrão"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && <div className="space-y-3 border-t border-border/40 p-3">{children}</div>}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <Label className="min-w-0 flex-1 truncate text-[12px] font-normal text-muted-foreground">{label}</Label>
      <div className="min-w-0 flex-1 max-w-[62%]">{children}</div>
    </div>
  );
}

export function ToggleField({ label, value, onChange }:
  { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[12px] font-normal text-muted-foreground">{label}</Label>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

export function NumberStepper({
  value, onChange, min, max, step = 1, suffix,
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  const clamp = (n: number) => {
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    return n;
  };
  return (
    <div className="flex h-8 items-center rounded-md border border-input bg-background">
      <button type="button" className="px-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => onChange(clamp(value - step))}>
        <Minus className="h-3 w-3" />
      </button>
      <input type="number" value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
        className="w-full min-w-0 border-0 bg-transparent px-1 text-center text-[13px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      {suffix && <span className="px-1 text-[11px] font-normal text-muted-foreground/70">{suffix}</span>}
      <button type="button" className="px-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => onChange(clamp(value + step))}>
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// Popover color picker — replaces the old inline color+hex+swatches row.
export function ColorField({ value, onChange }:
  { value: string; onChange: (hex: string) => void }) {
  const v = (value || "#000000").startsWith("#") ? (value || "#000000") : `#${value}`;
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className="h-8 w-8 rounded-md border border-input shadow-sm transition-shadow hover:shadow"
          style={{ background: v.slice(0, 7) }}
          aria-label="Escolher cor" />
      </PopoverTrigger>
      <PopoverContent side="left" align="start" className="w-[220px] p-3">
        <HexColorPicker color={v.slice(0, 7)} onChange={onChange} style={{ width: "100%" }} />
        <div className="mt-2 flex items-center gap-2">
          <Input value={v} onChange={(e) => onChange(e.target.value)}
            className="h-8 px-2 text-[12px]" />
        </div>
        <div className="mt-2 grid grid-cols-8 gap-1">
          {BRAND_COLORS.map((c) => (
            <button key={c} title={c} onClick={() => onChange(c)}
              className="h-5 w-5 rounded border border-border/60"
              style={{ background: c }} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SelectField<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
}) {
  const safe = options.find((o) => o.value === value) ? value : (options[0]?.value as T);
  return (
    <RxSelect value={safe} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-8 w-full min-w-0 px-2 text-[13px] [&>span]:truncate">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}
            title={o.title} className="text-[13px]">
            {o.label}{o.disabled ? " — indisponível" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </RxSelect>
  );
}

export function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode; title?: string }[];
}) {
  return (
    <div className="flex h-8 rounded-md border border-input bg-background overflow-hidden">
      {options.map((o) => (
        <button key={o.value} type="button" title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 px-2 text-[12px] transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value, onChange, min = 0, max = 100, step = 1, suffix = "%",
}: {
  value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-primary" />
      <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">
        {value}{suffix}
      </span>
    </div>
  );
}

// Kept for API compatibility — use Section.onReset for new code.
export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
      <RotateCcw className="h-3 w-3" /> Restaurar padrão
    </button>
  );
}

// Icon-only toggle button (e.g., B / I / direction arrows).
export function IconToggle({
  active, onClick, title, children,
}: {
  active: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-input text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}>
      {children}
    </button>
  );
}
