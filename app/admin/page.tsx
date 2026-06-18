import { createClient } from "@/lib/supabase/server";
import { TaskCard, TaskCardTicket } from "@/components/admin/TaskCard";
import { CreateTaskForm } from "@/components/admin/CreateTaskForm";
import { ManualTimeForm } from "@/components/admin/ManualTimeForm";
import { QuickStartButton } from "@/components/admin/QuickStartButton";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ data: tickets }, { data: projectList }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, projects(name, is_retainer), time_logs(*)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  const rows = (tickets ?? []) as TaskCardTicket[];
  const projects = (projectList ?? []) as { id: string; name: string }[];
  const open = rows.filter((t) => t.status !== "completed");
  const done = rows.filter((t) => t.status === "completed");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">דשבורד פניות</h1>
          <p className="mt-1 text-sm text-slate-500">
            כל הפניות מכל הפרויקטים. הפעל טיימר לכל משימה.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <QuickStartButton />
          {projects.length > 0 ? (
            <>
              <ManualTimeForm projects={projects} />
              <CreateTaskForm projects={projects} />
            </>
          ) : (
            <p className="text-sm text-amber-600">
              צור פרויקט תחילה כדי להוסיף משימות.
            </p>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          פעילות ({open.length})
        </h2>
        {open.length === 0 && (
          <p className="text-sm text-slate-400">אין פניות פעילות.</p>
        )}
        {open.map((ticket) => (
          <TaskCard key={ticket.id} ticket={ticket} projects={projects} />
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            הושלמו ({done.length})
          </h2>
          {done.map((ticket) => (
            <TaskCard key={ticket.id} ticket={ticket} projects={projects} />
          ))}
        </section>
      )}
    </div>
  );
}
