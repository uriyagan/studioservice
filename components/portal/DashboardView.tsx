import { Card } from "@/components/ui/Card";
import { formatHours, formatDate } from "@/lib/format";
import { ProjectStats } from "@/lib/types";

// Read-only status of every project the client is associated with.
export function DashboardView({ projects }: { projects: ProjectStats[] }) {
  return (
    <div className="space-y-4">
      {projects.map((p) => (
        <Card key={p.id}>
          <h2 className="font-semibold text-slate-900">{p.name}</h2>

          {p.is_build ? (
            <span className="mt-3 inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              פרוייקט הקמה · ללא מעקב שעות
            </span>
          ) : p.is_retainer ? (
            <span className="mt-3 inline-block rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-primary">
              ריטיינר פעיל · שעות בלתי מוגבלות
            </span>
          ) : p.has_active ? (
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
                  {p.active_source === "studio" ? 'נוספה ע"י הצוות' : "רכשת"}
                </span>
                {p.active_started_at && <span>הופעלה {formatDate(p.active_started_at)}</span>}
                {p.queued_count ? <span>· {p.queued_count} בתור</span> : null}
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="נרכשו" value={formatHours(p.total_hours_allocated)} />
                <Stat label="נוצלו" value={formatHours(p.hours_used)} />
                <Stat label="נותרו" value={formatHours(p.hours_remaining)} strong />
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
              <p className="font-medium text-amber-700">אין חבילה פעילה</p>
              <p className="mt-1 text-slate-500">כדי להמשיך יש לרכוש חבילה חדשה.</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${strong ? "text-slate-900" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}
