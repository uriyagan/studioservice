import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { TimerControl } from "@/components/TimerControl";
import { CreateTaskForm } from "@/components/admin/CreateTaskForm";
import { Ticket, TimeLog } from "@/lib/types";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface TicketRow extends Ticket {
  projects: { name: string; is_retainer: boolean } | null;
  time_logs: TimeLog[];
}

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ data: tickets }, { data: projectList }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, projects(name, is_retainer), time_logs(*)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
  ]);

  const rows = (tickets ?? []) as TicketRow[];
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
        {projects.length > 0 ? (
          <CreateTaskForm projects={projects} />
        ) : (
          <p className="text-sm text-amber-600">
            צור פרויקט תחילה כדי להוסיף משימות.
          </p>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          פעילות ({open.length})
        </h2>
        {open.length === 0 && (
          <p className="text-sm text-slate-400">אין פניות פעילות.</p>
        )}
        {open.map((ticket) => (
          <Card key={ticket.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">
                    {ticket.title}
                  </h3>
                  <StatusBadge status={ticket.status} />
                </div>
                <p className="mt-0.5 text-sm text-slate-500">
                  {ticket.projects?.name ?? "—"}
                  {ticket.projects?.is_retainer && " · ריטיינר"}
                  {" · "}
                  {formatDate(ticket.created_at)}
                </p>
                {ticket.description && (
                  <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm text-slate-600">
                    {ticket.description}
                  </p>
                )}
                {ticket.link && (
                  <a
                    href={ticket.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-primary hover:underline"
                  >
                    לינק רלוונטי ↗
                  </a>
                )}
              </div>

              <div className="shrink-0">
                <TimerControl ticket={ticket} logs={ticket.time_logs} />
              </div>
            </div>
          </Card>
        ))}
      </section>

      {done.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            הושלמו ({done.length})
          </h2>
          {done.map((ticket) => (
            <Card key={ticket.id} className="opacity-80">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-700">
                      {ticket.title}
                    </h3>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {ticket.projects?.name ?? "—"} ·{" "}
                    {formatDate(ticket.completed_at)}
                  </p>
                </div>
                <TimerControl ticket={ticket} logs={ticket.time_logs} />
              </div>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
