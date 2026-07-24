"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { createProjectPackage } from "@/app/actions/project-packages";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { PlusCircle } from "@/components/icons";
import { formatHours, formatDate } from "@/lib/format";
import { ProjectPackage, ProjectStats } from "@/lib/types";

const initial = { ok: false, error: undefined as string | undefined };

function sourceLabel(source: ProjectPackage["source"]): string {
  return source === "studio" ? "הסטודיו" : "הלקוח";
}

function Pill({ tone, children }: { tone: "green" | "slate" | "amber"; children: ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-600"
      : tone === "amber"
        ? "bg-amber-50 text-amber-600"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function PackagesPanel({
  projectId,
  stats,
  packages,
}: {
  projectId: string;
  stats: ProjectStats;
  packages: ProjectPackage[];
}) {
  const active = packages.find((p) => p.status === "active") ?? null;
  const queued = packages
    .filter((p) => p.status === "queued")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const history = packages
    .filter((p) => p.status === "depleted")
    .sort((a, b) => (b.closed_at ?? b.created_at).localeCompare(a.closed_at ?? a.created_at));

  const total = Number(stats.total_hours_allocated) || 0;
  const remaining = Math.max(0, Number(stats.hours_remaining) || 0);
  const used = Math.max(0, total - remaining);
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const low = total > 0 && remaining / total <= 0.2;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">חבילות שעות</h2>
        <CreatePackageButton projectId={projectId} />
      </div>

      {/* Active package */}
      {active ? (
        <div className="rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Pill tone="green">פעילה</Pill>
              <span className="font-semibold text-slate-800">חבילת {formatHours(active.hours)}</span>
            </div>
            <Pill tone="slate">מקור: {sourceLabel(active.source)}</Pill>
          </div>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all ${low ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
            <span>
              נותרו:{" "}
              <b className={`font-medium ${low ? "text-red-600" : "text-slate-800"}`}>
                {formatHours(remaining)}
              </b>
            </span>
            <span>
              נוצלו: <b className="font-medium text-slate-800">{formatHours(used)}</b>
            </span>
            <span>
              מתוך: <b className="font-medium text-slate-800">{formatHours(total)}</b>
            </span>
            {active.activated_at && (
              <span>
                הופעלה: <b className="font-medium text-slate-800">{formatDate(active.activated_at)}</b>
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-medium text-amber-700">אין חבילה פעילה</p>
          <p className="mt-1 text-sm text-slate-500">
            הטיימר חסום עד שתוקם חבילה חדשה או שהלקוח ירכוש חבילה.
          </p>
        </div>
      )}

      {/* Queue */}
      {queued.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            בתור ({queued.length})
          </p>
          <div className="space-y-2">
            {queued.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex items-center gap-2">
                  <Pill tone="amber">ממתינה</Pill>
                  <span className="font-medium text-slate-800">חבילת {formatHours(p.hours)}</span>
                </div>
                <span className="text-sm text-slate-500">
                  תופעל אוטומטית · מקור: {sourceLabel(p.source)} · {formatDate(p.created_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            היסטוריית חבילות
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[420px] text-sm" dir="rtl">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold">התחלה</th>
                  <th className="px-3 py-2 text-right font-semibold">סיום</th>
                  <th className="px-3 py-2 text-right font-semibold">שעות</th>
                  <th className="px-3 py-2 text-right font-semibold">מקור</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {formatDate(p.activated_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                      {formatDate(p.closed_at)}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{formatHours(p.hours)}</td>
                    <td className="px-3 py-2 text-slate-600">{sourceLabel(p.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "מקים..." : "הקמת חבילה"}
    </Button>
  );
}

function CreatePackageButton({ projectId }: { projectId: string }) {
  const [state, action] = useActionState(createProjectPackage, initial);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <PlusCircle className="h-4 w-4" /> הקמת חבילה חדשה
      </Button>
      {open && (
        <Modal title="הקמת חבילת שעות" onClose={() => setOpen(false)}>
          <form ref={formRef} action={action} className="space-y-3">
            <input type="hidden" name="project_id" value={projectId} />
            <div>
              <label className="mb-1 block text-sm text-slate-600">כמות שעות</label>
              <input
                name="hours"
                type="number"
                min="0"
                step="0.5"
                required
                placeholder="לדוגמה: 10"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">הערה (אופציונלי)</label>
              <input name="note" placeholder="לדוגמה: רכישה חיצונית" className={inputCls} />
            </div>
            <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
              החבילה מתועדת אוטומטית כ״הוקמה ע״י הסטודיו״. תופעל מיד אם אין חבילה פעילה, אחרת תיכנס
              לתור.
            </p>
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            <div className="flex gap-2">
              <SubmitBtn />
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
