import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateProjectForm } from "@/components/admin/CreateProjectForm";
import { EditHoursForm } from "@/components/admin/EditHoursForm";
import { Profile, ProjectStats } from "@/lib/types";
import { formatHours } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = createClient();

  const [{ data: projects }, { data: clients }] = await Promise.all([
    supabase.from("project_stats").select("*").order("name"),
    supabase.from("profiles").select("*").eq("role", "client").order("name"),
  ]);

  const rows = (projects ?? []) as ProjectStats[];
  const clientList = (clients ?? []) as Profile[];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">ניהול פרויקטים</h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">פרויקט חדש</h2>
            <CreateProjectForm clients={clientList} />
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          {rows.length === 0 && (
            <Card>
              <p className="text-sm text-slate-400">עדיין אין פרויקטים.</p>
            </Card>
          )}
          {rows.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{p.name}</h3>
                  {p.is_retainer ? (
                    <span className="mt-1 inline-block rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-primary">
                      ריטיינר · שעות בלתי מוגבלות
                    </span>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">
                      נוצלו {formatHours(p.hours_used)} מתוך{" "}
                      {formatHours(p.total_hours_allocated)} ·{" "}
                      <span className="font-medium text-slate-700">
                        נותרו {formatHours(p.hours_remaining)}
                      </span>
                    </p>
                  )}
                </div>

                {!p.is_retainer && (
                  <div>
                    <p className="mb-1 text-xs text-slate-400">
                      עדכון סך שעות
                    </p>
                    <EditHoursForm
                      projectId={p.id}
                      current={p.total_hours_allocated}
                    />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
