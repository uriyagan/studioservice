"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { saveBrandSettings } from "@/app/actions/email";
import { BrandSettings } from "@/lib/email/types";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export function BrandSettingsForm({ initial }: { initial: BrandSettings }) {
  const [v, setV] = useState<BrandSettings>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [isSaving, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveBrandSettings(v);
      setMsg(r.ok ? "נשמר ✓" : r.error || "שגיאה");
      setTimeout(() => setMsg(null), 2500);
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-slate-500">שם השולח</label>
          <input value={v.fromName} onChange={(e) => setV({ ...v, fromName: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">כתובת השולח (דומיין מאומת)</label>
          <input value={v.fromEmail} onChange={(e) => setV({ ...v, fromEmail: e.target.value })} className={inputCls} dir="ltr" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-slate-500">כתובת לתשובות (Reply-To)</label>
          <input value={v.replyTo} onChange={(e) => setV({ ...v, replyTo: e.target.value })} className={inputCls} dir="ltr" placeholder="info@uriyaganor.com" />
          <p className="mt-1 text-[11px] text-slate-400">לכאן יגיעו תשובות של לקוחות (תיבת דואר אמיתית).</p>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-slate-500">כתובת לוגו (URL)</label>
          <input value={v.logoUrl} onChange={(e) => setV({ ...v, logoUrl: e.target.value })} className={inputCls} dir="ltr" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">צבע מותג</label>
          <div className="flex items-center gap-2" dir="ltr">
            <input type="color" value={v.brandColor} onChange={(e) => setV({ ...v, brandColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-slate-300" />
            <input value={v.brandColor} onChange={(e) => setV({ ...v, brandColor: e.target.value })} className={inputCls} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={isSaving}>
          {isSaving ? "שומר..." : "שמירת מיתוג"}
        </Button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>
    </div>
  );
}
