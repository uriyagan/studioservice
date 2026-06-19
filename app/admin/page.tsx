import { createClient } from "@/lib/supabase/server";
import { TasksTable, TaskRow } from "@/components/admin/TasksTable";
import { CreateTaskForm } from "@/components/admin/CreateTaskForm";
import { ManualTimeForm } from "@/components/admin/ManualTimeForm";
import { QuickStartButton } from "@/components/admin/QuickStartButton";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawTicket {
  id: string;
  title: string | null;
  description: string | null;
  link: string | null;
  status: TaskRow["status"];
  project_id: string | null;
  created_at: string;
  completed_at: string | null;
  projects: { name: string; is_retainer: boolean; client_id: string | null } | null;
  time_logs: TaskRow["time_logs"];
}

export default async function AdminDashboard() {
  const supabase = await createClient();

  const [{ data: tickets }, { data: projectList }, { data: profiles }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, projects(name, is_retainer, client_id), time_logs(*)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name").order("name"),
    supabase.from("profiles").select("id, name"),
  ]);

  const projects = (projectList ?? []) as { id: string; name: string }[];
  const nameById = new Map<string, string>(
    ((profiles ?? []) as Pick<Profile, "id" | "name">[]).map((p) => [p.id, p.name ?? ""])
  );

  // Mark tasks whose latest message is from the client (awaiting our reply).
  const ticketIds = ((tickets ?? []) as RawTicket[]).map((t) => t.id);
  const awaitingReply = new Set<string>();
  if (ticketIds.length) {
    const db = supabase as unknown as { from: (t: string) => any };
    const { data: msgs } = await db
      .from("messages")
      .select("ticket_id, direction, created_at")
      .in("ticket_id", ticketIds)
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    for (const m of (msgs ?? []) as { ticket_id: string; direction: string }[]) {
      if (seen.has(m.ticket_id)) continue; // first row per ticket = latest
      seen.add(m.ticket_id);
      if (m.direction === "in") awaitingReply.add(m.ticket_id);
    }
  }

  const rows: TaskRow[] = ((tickets ?? []) as RawTicket[]).map((t) => ({
    ...t,
    projects: t.projects ? { name: t.projects.name, is_retainer: t.projects.is_retainer } : null,
    clientName: t.projects?.client_id ? nameById.get(t.projects.client_id) ?? "" : "",
    unread: awaitingReply.has(t.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מעקב משימות</h1>
          <p className="mt-1 text-sm text-slate-500">כל המשימות מכל הפרויקטים.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <QuickStartButton />
          {projects.length > 0 ? (
            <>
              <ManualTimeForm projects={projects} />
              <CreateTaskForm projects={projects} />
            </>
          ) : (
            <p className="text-sm text-amber-600">צור פרויקט תחילה כדי להוסיף משימות.</p>
          )}
        </div>
      </div>

      <TasksTable tasks={rows} projects={projects} />
      <AutoRefresh seconds={45} />
    </div>
  );
}
