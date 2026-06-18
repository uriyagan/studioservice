"use client";

import { Trash2, Plus } from "lucide-react";
import type { EmailBlock } from "@/lib/email/types";
import { ALIGN_OPTS, SOCIAL_NETWORKS, blockLabel } from "./blocks";
import { Stepper } from "./Stepper";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      {children}
    </div>
  );
}

function SizeRow({
  label,
  value,
  onChange,
  step = 1,
  suffix = "px",
  fallback = 0,
  min = 0,
  max = 9999,
}: {
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  step?: number;
  suffix?: string;
  fallback?: number;
  min?: number;
  max?: number;
}) {
  const raw = value === undefined || value === null || value === "" ? fallback : Number(value);
  const num = Number.isFinite(raw) ? raw : fallback;
  return (
    <Field label={label}>
      <Stepper block value={num} step={step} suffix={suffix} min={min} max={max} onChange={(n) => onChange(String(n))} />
    </Field>
  );
}

export function Inspector({
  block,
  onChange,
  onClose,
}: {
  block: EmailBlock;
  onChange: (p: Partial<EmailBlock>) => void;
  onClose: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = block as any;

  const colorField = (key: string, label: string) => (
    <Field label={label}>
      <div className="flex items-center gap-2" dir="ltr">
        <input
          type="color"
          value={s[key] || "#000000"}
          onChange={(e) => onChange({ [key]: e.target.value } as Partial<EmailBlock>)}
          className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white"
        />
        <input
          value={s[key] || ""}
          onChange={(e) => onChange({ [key]: e.target.value } as Partial<EmailBlock>)}
          className={inputCls}
        />
      </div>
    </Field>
  );

  const alignField = (
    <Field label="יישור">
      <select value={s.align ?? "right"} onChange={(e) => onChange({ align: e.target.value } as Partial<EmailBlock>)} className={inputCls} dir="rtl">
        {ALIGN_OPTS.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-white p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-800">עיצוב בלוק: {blockLabel(block.type)}</div>
        <button onClick={onClose} className="text-[11px] text-slate-500 hover:text-slate-800">
          סגור
        </button>
      </div>

      {block.type === "heading" && (
        <>
          <p className="text-[11px] text-slate-500">ערוך את הטקסט ישירות על המייל.</p>
          <Field label="רמה">
            <select value={s.level ?? "h2"} onChange={(e) => onChange({ level: e.target.value } as Partial<EmailBlock>)} className={inputCls} dir="rtl">
              <option value="h1">גדול (H1)</option>
              <option value="h2">בינוני (H2)</option>
              <option value="h3">קטן (H3)</option>
            </select>
          </Field>
          {alignField}
        </>
      )}

      {block.type === "text" && (
        <>
          <p className="text-[11px] text-slate-500">ערוך את הטקסט ישירות על המייל.</p>
          {alignField}
          <SizeRow label="גודל פונט" value={s.size} fallback={15} min={8} max={72} onChange={(v) => onChange({ size: v } as Partial<EmailBlock>)} />
        </>
      )}

      {block.type === "image" && (
        <>
          <Field label="כתובת תמונה">
            <input value={s.src ?? ""} onChange={(e) => onChange({ src: e.target.value })} dir="ltr" className={inputCls} placeholder="https://..." />
          </Field>
          <Field label="טקסט חלופי (alt)">
            <input value={s.alt ?? ""} onChange={(e) => onChange({ alt: e.target.value })} className={inputCls} />
          </Field>
          <Field label="קישור בלחיצה (אופציונלי)">
            <input value={s.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} dir="ltr" className={inputCls} />
          </Field>
          <SizeRow label="רוחב" value={s.width} fallback={100} suffix="%" min={10} max={100} step={5} onChange={(v) => onChange({ width: v } as Partial<EmailBlock>)} />
          {alignField}
        </>
      )}

      {block.type === "button" && (
        <>
          <p className="text-[11px] text-slate-500">ערוך את טקסט הכפתור ישירות על המייל.</p>
          <Field label="קישור">
            <input value={s.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} dir="ltr" className={inputCls} />
          </Field>
          {alignField}
          {colorField("bg", "צבע רקע")}
          {colorField("color", "צבע טקסט")}
          <SizeRow label="גודל פונט" value={s.fontSize} fallback={16} min={10} max={40} onChange={(v) => onChange({ fontSize: v } as Partial<EmailBlock>)} />
          <SizeRow label="עיגול פינות" value={s.radius} fallback={6} max={60} onChange={(v) => onChange({ radius: v } as Partial<EmailBlock>)} />
        </>
      )}

      {block.type === "divider" && colorField("color", "צבע הקו")}
      {block.type === "spacer" && <SizeRow label="גובה" value={s.height} fallback={24} max={300} onChange={(v) => onChange({ height: v } as Partial<EmailBlock>)} />}

      {block.type === "footer" && (
        <>
          <p className="text-[11px] text-slate-500">ערוך את הטקסט ישירות על המייל.</p>
          {alignField}
          {colorField("color", "צבע")}
        </>
      )}

      {block.type === "video" && (
        <>
          <Field label="קישור לסרטון (YouTube)">
            <input value={s.url ?? ""} onChange={(e) => onChange({ url: e.target.value } as Partial<EmailBlock>)} dir="ltr" className={inputCls} placeholder="https://youtube.com/watch?v=..." />
          </Field>
          {alignField}
          <p className="text-[11px] text-slate-500">במייל תוצג תמונה ממוזערת עם כפתור נגן המקושרת לסרטון.</p>
        </>
      )}

      {block.type === "html" && (
        <Field label="HTML">
          <textarea value={s.html ?? ""} onChange={(e) => onChange({ html: e.target.value })} rows={6} dir="ltr" className={`${inputCls} font-mono`} />
        </Field>
      )}

      {block.type === "social" && (
        <>
          {alignField}
          {colorField("color", "צבע האייקונים")}
          <SizeRow label="גודל אייקון" value={s.iconSize} fallback={28} min={16} max={64} onChange={(v) => onChange({ iconSize: v } as Partial<EmailBlock>)} />
          <SizeRow label="מרווח בין אייקונים" value={s.gap} fallback={10} max={60} onChange={(v) => onChange({ gap: v } as Partial<EmailBlock>)} />
          <div className="space-y-2">
            {((s.networks ?? []) as Array<{ type: string; url: string }>).map((n, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={n.type}
                  onChange={(e) => {
                    const nx = [...s.networks];
                    nx[i] = { ...nx[i], type: e.target.value };
                    onChange({ networks: nx } as Partial<EmailBlock>);
                  }}
                  className={`${inputCls} w-28`}
                  dir="rtl"
                >
                  {SOCIAL_NETWORKS.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
                <input
                  value={n.url}
                  onChange={(e) => {
                    const nx = [...s.networks];
                    nx[i] = { ...nx[i], url: e.target.value };
                    onChange({ networks: nx } as Partial<EmailBlock>);
                  }}
                  dir="ltr"
                  className={`${inputCls} flex-1`}
                  placeholder={n.type === "email" ? "name@example.com" : n.type === "phone" ? "050-1234567" : "https://"}
                />
                <button
                  className="text-slate-500 hover:text-red-600"
                  onClick={() => onChange({ networks: s.networks.filter((_: unknown, idx: number) => idx !== i) } as Partial<EmailBlock>)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange({ networks: [...(s.networks ?? []), { type: "facebook", url: "" }] } as Partial<EmailBlock>)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" /> רשת
            </button>
          </div>
        </>
      )}

      {block.type === "columns" && (
        <>
          <Field label="מספר עמודות">
            <select
              value={String(s.count ?? 2)}
              onChange={(e) => {
                const count = Number(e.target.value);
                const cols = [...(s.columns ?? [])];
                while (cols.length < count) cols.push({ blocks: [] });
                onChange({ count, columns: cols.slice(0, count) } as Partial<EmailBlock>);
              }}
              className={inputCls}
              dir="rtl"
            >
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </Field>
          <p className="text-[11px] text-slate-500">גרור בלוקים אל תוך כל עמודה ישירות על המייל.</p>
        </>
      )}

      <div className="my-1 h-px bg-slate-200" />
      <div className="text-[11px] text-slate-500">מרווחים</div>
      <SizeRow label="מרווח חיצוני" value={s.outer} fallback={8} max={120} onChange={(v) => onChange({ outer: v } as Partial<EmailBlock>)} />
      <SizeRow label="מרווח פנימי" value={s.inner} fallback={0} max={120} onChange={(v) => onChange({ inner: v } as Partial<EmailBlock>)} />
    </div>
  );
}
