import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TaskCard, TaskCardTicket } from "@/components/admin/TaskCard";
import { CreateTaskForm } from "@/components/admin/CreateTaskForm";
import { ProjectStats } from "@/lib/types";
import { formatHours } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: project }, { data: tickets }, { data: projectList }] =
    await Promise.all([
      supabase.from("project_stats").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("tickets")
        .select("*, projects(name, is_retainer), time_logs(*)")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, name").order("name"),
    ]);

  if (!project) notFound();

  const p = project as ProjectStats;
  const rows = (tickets ?? []) as TaskCardTicket[];
  const projects = (projectList ?? []) as { id: string; name: string }[];
  const open = rows.filter((t) => t.status !== "completed");
  const done = rows.filter((t) => t.status === "completed");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/projects"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← חזרה לפרויקטים
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{p.name}</h1>
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
          <CreateTaskForm fixedProjectId={id} />
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          פעילות ({open.length})
        </h2>
        {open.length === 0 && (
          <Card>
            <p className="text-sm text-slate-400">אין משימות פעילות בפרויקט זה.</p>
          </Card>
        )}
        {open.map((ticket) => (
          <TaskCard
            key={ticket.id}
            ticket={ticket}
            projects={projects}
            showProject={false}
          />
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            הושלמו ({done.length})
          </h2>
          {done.map((ticket) => (
            <TaskCard
              key={ticket.id}
              ticket={ticket}
              projects={projects}
              showProject={false}
            />
          ))}
        </section>
      )}
    </div>
  );
}
