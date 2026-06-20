import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TaskCard, TaskCardTicket } from "@/components/admin/TaskCard";
import { CreateTaskForm } from "@/components/admin/CreateTaskForm";
import { ManualTimeForm } from "@/components/admin/ManualTimeForm";
import { ProjectStats } from "@/lib/types";
import { ProjectMembers, MemberRow } from "@/components/admin/ProjectMembers";
import { ProjectNotes } from "@/components/admin/ProjectNotes";
import { ArrowRight } from "@/components/icons";
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

  // Members (additional viewers). The members table may not exist yet —
  // both queries fail gracefully to an empty list.
  const db = supabase as unknown as { from: (t: string) => any };
  const [{ data: clientRows }, { data: memberRows }] = await Promise.all([
    db.from("profiles").select("id, name, email, role").eq("role", "client").order("name"),
    db.from("project_members").select("profile_id").eq("project_id", id),
  ]);
  const clients: MemberRow[] = ((clientRows ?? []) as { id: string; name: string | null; email: string | null }[]).map(
    (c) => ({ id: c.id, name: c.name ?? "", email: c.email ?? "" })
  );
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const members: MemberRow[] = ((memberRows ?? []) as { profile_id: string }[])
    .map((m) => clientById.get(m.profile_id))
    .filter(Boolean) as MemberRow[];

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/projects"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowRight className="h-4 w-4" /> חזרה לפרויקטים
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-start [&_button]:w-full sm:[&_button]:w-auto">
            <ManualTimeForm fixedProjectId={id} />
            <CreateTaskForm fixedProjectId={id} />
          </div>
        </div>
      </div>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-900">משתתפים בפרויקט</h2>
        <p className="mb-4 text-sm text-slate-500">
          מי שמשויך כאן רואה את הפרויקט בפורטל, יכול לפתוח משימות ולראות את ההתכתבות.
        </p>
        <ProjectMembers projectId={id} ownerId={p.client_id} members={members} clients={clients} />
      </Card>

      <Card>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-slate-900">הערות פנימיות</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">לאדמינים בלבד</span>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          הערות וקבצים פנימיים על הפרויקט. הלקוח לא רואה את התוכן הזה.
        </p>
        <ProjectNotes projectId={id} />
      </Card>

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
