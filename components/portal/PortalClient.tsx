"use client";

import { useState } from "react";
import { ProjectStats } from "@/lib/types";
import { Card, StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDuration, formatDate, formatHours } from "@/lib/format";
import { HOUR_PACKAGES } from "@/lib/packages";
import { buyHourPackage } from "@/app/actions/stripe";
import { TicketForm } from "@/components/portal/TicketForm";

interface CompletedTask {
  id: string;
  title: string;
  completed_at: string | null;
  seconds: number;
}

type Tab = "status" | "submit" | "purchase";

const TABS: { id: Tab; label: string }[] = [
  { id: "status", label: "סטטוס הפרויקט" },
  { id: "submit", label: "יצירת משימה" },
  { id: "purchase", label: "רכישת שעות" },
];

export function PortalClient({
  project,
  completedTasks,
}: {
  project: ProjectStats;
  completedTasks: CompletedTask[];
}) {
  const [tab, setTab] = useState<Tab>("status");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
        <p className="mt-1 text-sm text-slate-500">ברוכים הבאים לפורטל השירות</p>
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
          <h2 className="mb-4 font-semibold text-slate-900">פנייה חדשה</h2>
          <TicketForm projectId={project.id} />
        </Card>
      )}
      {tab === "purchase" && <PurchaseView projectId={project.id} />}
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

function PurchaseView({ projectId }: { projectId: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {HOUR_PACKAGES.map((pkg) => (
        <Card key={pkg.id} className="flex flex-col">
          <h3 className="font-semibold text-slate-900">{pkg.label}</h3>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            ₪{pkg.priceIls.toLocaleString("he-IL")}
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
  );
}
