import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateProjectForm } from "@/components/admin/CreateProjectForm";
import { ProjectRow } from "@/components/admin/ProjectRow";
import { Profile, ProjectStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();

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
            <ProjectRow key={p.id} project={p} clients={clientList} />
          ))}
        </div>
      </div>
    </div>
  );
}
