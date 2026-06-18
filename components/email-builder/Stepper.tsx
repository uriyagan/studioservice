"use client";

import { Minus, Plus } from "lucide-react";

// Numeric input with −/+ buttons. `block` fills the row width.
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix = "px",
  width = 56,
  block = false,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  width?: number;
  block?: boolean;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const set = (n: number) =>
    onChange(Math.min(max, Math.max(min, round(Number.isFinite(n) ? n : min))));
  const btn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-slate-800";
  return (
    <div className={(block ? "flex w-full" : "inline-flex") + " items-center gap-1"} dir="ltr">
      <button type="button" aria-label="הפחת" onClick={() => set(value - step)} className={btn}>
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => set(Number(e.target.value))}
        className={
          "h-8 rounded-md border border-slate-300 bg-white text-center text-xs outline-none focus:border-primary " +
          (block ? "min-w-0 flex-1" : "")
        }
        style={block ? undefined : { width }}
      />
      <button type="button" aria-label="הוסף" onClick={() => set(value + step)} className={btn}>
        <Plus className="h-3 w-3" />
      </button>
      {suffix ? <span className="shrink-0 text-xs text-slate-500">{suffix}</span> : null}
    </div>
  );
}
