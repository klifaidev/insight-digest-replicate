// Reusable inspector primitives for the chart editor.
// Keep these small + zero-dependency-on-block so we can reuse for any block kind.

import { useState } from "react";
import { ChevronRight, Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { BRAND_COLORS } from "./types";

export function Section({
  title, defaultOpen = false, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-border/40 bg-card/30">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span>{title}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {open && <div className="space-y-2 border-t border-border/40 p-2">{children}</div>}
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <div className="flex-1 max-w-[60%]">{children}</div>
    </div>
  );
}

export function ToggleField({ label, value, onChange }:
  { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
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
    <div className="flex h-7 items-center rounded-md border border-input">
      <button type="button" className="px-1.5 hover:bg-secondary"
        onClick={() => onChange(clamp(value - step))}>
        <Minus className="h-3 w-3" />
      </button>
      <input type="number" value={value}
        onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0))}
        className="w-full min-w-0 border-0 bg-transparent px-1 text-[11px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
      {suffix && <span className="px-1 text-[10px] text-muted-foreground">{suffix}</span>}
      <button type="button" className="px-1.5 hover:bg-secondary"
        onClick={() => onChange(clamp(value + step))}>
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ColorField({ value, onChange }:
  { value: string; onChange: (hex: string) => void }) {
  const v = value.startsWith("#") ? value : `#${value}`;
  return (
    <div className="flex items-center gap-1">
      <input type="color" value={v.slice(0, 7)}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 cursor-pointer rounded border border-input bg-transparent" />
      <Input value={v} onChange={(e) => onChange(e.target.value)}
        className="h-7 flex-1 px-1.5 text-[11px]" />
      <div className="flex gap-0.5">
        {BRAND_COLORS.slice(0, 4).map((c) => (
          <button key={c} title={c} onClick={() => onChange(c)}
            className="h-5 w-5 rounded border border-border/60"
            style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

export function SelectField<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}
      className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-[11px]">
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled} title={o.title}>
          {o.label}{o.disabled ? " — indisponível" : ""}
        </option>
      ))}
    </select>
  );
}
