import { Card } from "@/components/ui/Card";
import { formatHours } from "@/lib/format";
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
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <Stat label="נרכשו" value={formatHours(p.total_hours_allocated)} />
              <Stat label="נוצלו" value={formatHours(p.hours_used)} />
              <Stat label="נותרו" value={formatHours(p.hours_remaining)} strong />
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
