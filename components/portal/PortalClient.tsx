"use client";

import { useState } from "react";
import { HourPackageRow, Profile, ProjectStats, Purchase, TicketStatus } from "@/lib/types";
import { Card, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDurationShort, formatDate, formatHours } from "@/lib/format";
import { TicketForm } from "@/components/portal/TicketForm";
import { ClientDetailsForm } from "@/components/admin/ClientDetailsForm";
import { PurchaseForm, BillingInfo } from "@/components/portal/PurchaseForm";
import { ClientTaskThread } from "@/components/portal/ClientTaskThread";
import { MessageSquare, Download, History, ArrowLeft, PlusCircle } from "@/components/icons";

type MyProfile = Pick<Profile, "id" | "first_name" | "last_name" | "phone" | "company" | "company_number" | "address" | "notes">;

interface CompletedTask {
  id: string;
  title: string;
  status: TicketStatus;
  completed_at: string | null;
  seconds: number;
  description: string | null;
  link: string | null;
}

type Tab = "status" | "submit" | "purchase" | "details";

const TABS: { id: Tab; label: string }[] = [
  { id: "status", label: "סטטוס הפרויקט" },
  { id: "submit", label: "יצירת משימה" },
  { id: "purchase", label: "חבילות שירות" },
  { id: "details", label: "הפרטים שלי" },
];

export function PortalClient({
  projects,
  completedByProject,
  profile,
  packages,
  purchases,
  billing,
}: {
  projects: ProjectStats[];
  completedByProject: Record<string, CompletedTask[]>;
  profile: MyProfile;
  packages: HourPackageRow[];
  purchases: Purchase[];
  billing: BillingInfo;
}) {
  const [tab, setTab] = useState<Tab>("status");
  const [projectId, setProjectId] = useState(projects[0].id);
  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const completedTasks = completedByProject[project.id] ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {projects.length > 1 ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-lg font-bold text-slate-900 outline-none focus:border-primary"
              dir="rtl"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          )}
        </div>
        <Button onClick={() => setTab("submit")} className="flex items-center gap-1.5">
          <PlusCircle className="h-4 w-4 text-white" /> משימה חדשה
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "bg-primary text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "status" && (
        <StatusView project={project} completedTasks={completedTasks} />
      )}
      {tab === "submit" && (
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">משימה חדשה</h2>
          <TicketForm projectId={project.id} />
        </Card>
      )}
      {tab === "purchase" && (
        <PurchaseView
          projectId={project.id}
          projects={projects}
          packages={packages}
          purchases={purchases}
          billing={billing}
        />
      )}
      {tab === "details" && (
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">הפרטים שלי</h2>
          <ClientDetailsForm profile={profile} mode="self" />
        </Card>
      )}
    </div>
  );
}

function StatusView({
  project,
  completedTasks,
}: {
  project: ProjectStats;
  completedTasks: CompletedTask[];
}) {
  const [openTask, setOpenTask] = useState<CompletedTask | null>(null);
  return (
    <div className="space-y-6">
      {project.is_build ? (
        <StatCard
          label="סוג הפרויקט"
          value="פרוייקט הקמה"
          accent
        />
      ) : project.is_retainer ? (
        <StatCard
          label="סטטוס חבילה"
          value="ריטיינר פעיל · שעות בלתי מוגבלות"
          accent
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="סך שעות שנרכשו"
            value={formatHours(project.total_hours_allocated)}
          />
          <StatCard label="שעות שנוצלו" value={formatHours(project.hours_used)} />
          <StatCard
            label="שעות שנותרו"
            value={formatHours(project.hours_remaining)}
          />
        </div>
      )}

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">משימות</h2>
        {completedTasks.length === 0 ? (
          <p className="text-sm text-slate-400">עדיין אין משימות.</p>
        ) : (
          <>
            {/* Mobile: tap-to-open cards */}
            <div className="space-y-2 sm:hidden">
              {completedTasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenTask(t)}
                  className="flex w-full flex-col gap-2 rounded-lg border border-slate-200 p-3 text-start hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-slate-800">{t.title}</span>
                    <span className="shrink-0">
                      <StatusBadge status={t.status} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono tabular-nums text-slate-600">{formatDurationShort(t.seconds)}</span>
                    <span className="inline-flex items-center gap-1.5 text-primary">
                      <MessageSquare className="h-4 w-4" /> צפייה בשיחה
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
              <table className="w-full min-w-[480px] text-start text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium">כותרת משימה</th>
                    <th className="px-4 py-2.5 text-start font-medium">סטטוס</th>
                    <th className="px-4 py-2.5 text-start font-medium">זמן ביצוע</th>
                    <th className="px-4 py-2.5 text-start font-medium">שיחה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {completedTasks.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setOpenTask(t)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{t.title}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                        {formatDurationShort(t.seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-primary hover:underline">
                          <MessageSquare className="h-4 w-4" />
                          צפייה בשיחה
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {openTask && (
        <ClientTaskThread
          ticketId={openTask.id}
          title={openTask.title}
          description={openTask.description}
          link={openTask.link}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  );
}

function PurchaseView({
  projectId,
  projects,
  packages,
  purchases,
  billing,
}: {
  projectId: string;
  projects: ProjectStats[];
  packages: HourPackageRow[];
  purchases: Purchase[];
  billing: BillingInfo;
}) {
  const [selected, setSelected] = useState<HourPackageRow | null>(null);

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
              // Bar fills with hours USED (empty = nothing used, full = depleted).
              const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
              const low = total > 0 && remaining / total <= 0.2;
              return (
                <div key={p.id}>
                  <div className="mb-2 font-semibold text-slate-800">{p.name}</div>
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
            <PurchaseForm pkg={selected} projectId={projectId} billing={billing} onCancel={() => setSelected(null)} />
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
                  רכישה
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

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
