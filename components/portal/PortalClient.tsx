"use client";

import { useState } from "react";
import { HourPackageRow, Profile, ProjectStats, Purchase } from "@/lib/types";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatDate, formatHours } from "@/lib/format";
import { buyHourPackage } from "@/app/actions/stripe";
import { TicketForm } from "@/components/portal/TicketForm";
import { ClientDetailsForm } from "@/components/admin/ClientDetailsForm";

type MyProfile = Pick<Profile, "id" | "first_name" | "last_name" | "phone" | "company" | "address" | "notes">;

interface CompletedTask {
  id: string;
  title: string;
  completed_at: string | null;
  seconds: number;
}

type Tab = "status" | "submit" | "purchase" | "details";

const TABS: { id: Tab; label: string }[] = [
  { id: "status", label: "סטטוס הפרויקט" },
  { id: "submit", label: "יצירת משימה" },
  { id: "purchase", label: "רכישת שעות" },
  { id: "details", label: "הפרטים שלי" },
];

export function PortalClient({
  projects,
  completedByProject,
  profile,
  packages,
  purchases,
}: {
  projects: ProjectStats[];
  completedByProject: Record<string, CompletedTask[]>;
  profile: MyProfile;
  packages: HourPackageRow[];
  purchases: Purchase[];
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
          <p className="text-sm text-slate-500">ברוכים הבאים לפורטל השירות</p>
        </div>
        <Button onClick={() => setTab("submit")}>+ משימה חדשה</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium ${
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
        <PurchaseView projectId={project.id} packages={packages} purchases={purchases} />
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
  return (
    <div className="space-y-6">
      {project.is_retainer ? (
        <StatCard
          label="סטטוס חבילה"
          value="ריטיינר פעיל · שעות בלתי מוגבלות"
          accent
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="סך שעות שנרכשו"
            value={formatHours(project.total_hours_allocated)}
          />
          <StatCard label="שעות שנוצלו" value={formatHours(project.hours_used)} />
          <StatCard
            label="שעות שנותרו"
            value={formatHours(project.hours_remaining)}
            accent
          />
        </div>
      )}

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">משימות שהושלמו</h2>
        {completedTasks.length === 0 ? (
          <p className="text-sm text-slate-400">עדיין אין משימות שהושלמו.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-start font-medium">משימה</th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    תאריך השלמה
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    זמן כולל
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {completedTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {t.title}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(t.completed_at)}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                      {formatDuration(t.seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PurchaseView({
  projectId,
  packages,
  purchases,
}: {
  projectId: string;
  packages: HourPackageRow[];
  purchases: Purchase[];
}) {
  return (
    <div className="space-y-8">
      {packages.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-400">אין חבילות זמינות כרגע.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {packages.map((pkg) => (
            <Card key={pkg.id} className="flex flex-col">
              <h3 className="font-semibold text-slate-900">{pkg.name}</h3>
              <p className="mt-2 text-3xl font-bold text-slate-900">
€{Number(pkg.price_ils).toLocaleString("he-IL")}
              </p>
              <p className="mt-1 text-sm text-slate-500">{pkg.hours} שעות עבודה</p>
              <form action={buyHourPackage} className="mt-4">
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="package_id" value={pkg.id} />
                <Button type="submit" className="w-full">
                  רכישה
                </Button>
              </form>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">היסטוריית רכישות</h2>
        {purchases.length === 0 ? (
          <p className="text-sm text-slate-400">עדיין אין רכישות.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" dir="rtl">
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
                        <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          הורדה ↗
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
        )}
      </Card>
    </div>
  );
}
