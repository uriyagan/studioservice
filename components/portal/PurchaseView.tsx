"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PurchaseForm, BillingInfo } from "@/components/portal/PurchaseForm";
import { formatHours, formatDate } from "@/lib/format";
import { History, Download, ArrowLeft } from "@/components/icons";
import { HourPackageRow, ProjectPackage, ProjectStats, Purchase } from "@/lib/types";

export function PurchaseView({
  projects,
  packages,
  purchases,
  projectPackages = [],
  billing,
}: {
  projects: ProjectStats[];
  packages: HourPackageRow[];
  purchases: Purchase[];
  projectPackages?: ProjectPackage[];
  billing: BillingInfo;
}) {
  const [selected, setSelected] = useState<HourPackageRow | null>(null);
  // Hours get credited to this project. Default: first hours-based project.
  const buyable = projects.filter((p) => !p.is_build);
  const targets = buyable.length ? buyable : projects;
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const queued = projectPackages.filter((p) => p.status === "queued");
  const history = projectPackages
    .filter((p) => p.status === "depleted")
    .sort((a, b) => (b.closed_at ?? b.created_at).localeCompare(a.closed_at ?? a.created_at));
  const sourceLabel = (s: ProjectPackage["source"]) =>
    s === "studio" ? 'נוספה ע"י הצוות' : "רכשת";

  return (
    <div className="space-y-8">
      {/* Active packages */}
      <div>
        <h2 className="mb-3 font-semibold text-slate-900">חבילות פעילות</h2>
        <Card>
          <div className="space-y-5">
            {projects.map((p) => {
              if (p.is_build) {
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="text-sm text-slate-500">פרוייקט הקמה</span>
                  </div>
                );
              }
              if (p.is_retainer) {
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="text-sm text-slate-500">ריטיינר · ללא הגבלה</span>
                  </div>
                );
              }
              const total = Number(p.total_hours_allocated) || 0;
              const remaining = Math.max(0, Number(p.hours_remaining) || 0);
              const used = Math.max(0, total - remaining);
              const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
              const low = total > 0 && remaining / total <= 0.2;
              if (!p.has_active) {
                return (
                  <div key={p.id}>
                    <div className="mb-2 font-semibold text-slate-800">{p.name}</div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                      <p className="font-medium text-amber-700">אין חבילה פעילה — החבילה הסתיימה</p>
                      <p className="mt-1 text-slate-500">כדי להמשיך יש לרכוש חבילה חדשה למטה.</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={p.id}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-800">{p.name}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {p.active_source === "studio" ? 'נוספה ע"י הצוות' : "רכשת"}
                    </span>
                    {p.active_started_at && (
                      <span className="text-xs text-slate-400">הופעלה {formatDate(p.active_started_at)}</span>
                    )}
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${low ? "bg-red-500" : "bg-primary"}`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                    <span>
                      נרכשו: <b className="font-medium text-slate-800">{formatHours(total)}</b>
                    </span>
                    <span>
                      נוצלו: <b className="font-medium text-slate-800">{formatHours(used)}</b>
                    </span>
                    <span>
                      נותרו:{" "}
                      <b className={`font-medium ${low ? "text-red-600" : "text-slate-800"}`}>
                        {formatHours(remaining)}
                      </b>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Queued packages */}
      {queued.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-slate-900">חבילות בתור</h2>
          <Card>
            <div className="space-y-3">
              {queued.map((pk) => (
                <div key={pk.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                      ממתינה
                    </span>
                    <span className="font-medium text-slate-800">חבילת {formatHours(pk.hours)}</span>
                    {projects.length > 1 && (
                      <span className="text-sm text-slate-400">· {nameById.get(pk.project_id) ?? ""}</span>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">
                    תופעל כשהחבילה הנוכחית תסתיים · {sourceLabel(pk.source)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Buy a new package */}
      <div>
        <h2 className="mb-3 font-semibold text-slate-900">רכישת חבילה חדשה</h2>
        {selected ? (
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 truncate font-semibold text-slate-900">תשלום עבור {selected.name}</h3>
              <button onClick={() => setSelected(null)} className="flex shrink-0 items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-3.5 w-3.5" /> בחירת חבילה אחרת
              </button>
            </div>
            {targets.length > 1 && (
              <div className="mb-4">
                <label className="mb-1 block text-sm text-slate-600">שיוך השעות לפרויקט</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
                  dir="rtl"
                >
                  {targets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <PurchaseForm pkg={selected} projectId={targetId} billing={billing} onCancel={() => setSelected(null)} />
          </Card>
        ) : packages.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-400">אין חבילות זמינות כרגע.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className="flex flex-col">
                <h3 className="font-semibold text-slate-900">{pkg.name}</h3>
                <p className="mt-2 text-3xl font-bold text-slate-900">
                  €{Number(pkg.price_ils).toLocaleString("he-IL")}
                </p>
                <p className="mt-1 text-sm text-slate-500">{pkg.hours} שעות עבודה</p>
                <Button type="button" className="mt-4 w-full" onClick={() => setSelected(pkg)}>
                  לרכישת החבילה
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-slate-900">היסטוריית חבילות</h2>
          <Card>
            <div className="overflow-x-auto">
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
                  {history.map((pk) => (
                    <tr key={pk.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {formatDate(pk.activated_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                        {formatDate(pk.closed_at)}
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-800">{formatHours(pk.hours)}</td>
                      <td className="px-3 py-2 text-slate-600">{sourceLabel(pk.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-3 flex items-center gap-1.5 font-semibold text-slate-900">
          <History className="h-4 w-4 text-black" /> היסטוריית רכישות
        </h2>
        <Card>
          {purchases.length === 0 ? (
            <p className="text-sm text-slate-400">עדיין אין רכישות.</p>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="space-y-2 sm:hidden">
                {purchases.map((p) => (
                  <div key={p.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-medium text-slate-800">{p.package_name || "—"}</span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{formatDate(p.created_at)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>{p.hours != null ? `${p.hours} שעות` : "—"}</span>
                      <span className="font-medium text-slate-800">
                        {p.amount_ils != null ? `€${Number(p.amount_ils).toLocaleString("he-IL")}` : "—"}
                      </span>
                      {p.receipt_url && (
                        <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="ms-auto inline-flex items-center gap-1 text-primary hover:underline">
                          <Download className="h-3.5 w-3.5" /> הורדה
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop: table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[480px] text-sm" dir="rtl">
                  <thead className="border-b border-slate-100 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-semibold">תאריך</th>
                      <th className="px-3 py-2 text-right font-semibold">חבילה</th>
                      <th className="px-3 py-2 text-right font-semibold">שעות</th>
                      <th className="px-3 py-2 text-right font-semibold">סכום</th>
                      <th className="px-3 py-2 text-left font-semibold">חשבונית</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchases.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50">
                        <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatDate(p.created_at)}</td>
                        <td className="px-3 py-2 text-slate-800">{p.package_name || "—"}</td>
                        <td className="px-3 py-2 text-slate-700">{p.hours ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {p.amount_ils != null ? `€${Number(p.amount_ils).toLocaleString("he-IL")}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-left">
                          {p.receipt_url ? (
                            <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              <Download className="h-3.5 w-3.5" /> הורדה
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
