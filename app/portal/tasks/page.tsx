import { getMyProjects } from "@/lib/portal-data";
import { TasksView } from "@/components/portal/TasksView";
import { PortalTask } from "@/components/portal/types";
import { Ticket, TimeLog } from "@/lib/types";
import { sumLoggedSeconds } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PortalTasksPage() {
  const { supabase, user, projects } = await getMyProjects();
  if (!user) return null;

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  const ids = projects.map((p) => p.id);

  let tasks: PortalTask[] = [];
  if (ids.length) {
    const { data } = await supabase
      .from("tickets")
      .select("*, time_logs(*)")
      .in("project_id", ids)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as (Ticket & { time_logs: TimeLog[]; project_id: string })[];

    // Conversation stats per task (RLS scopes both queries to my own rows):
    // message count + latest studio ("out") message, and my last-read marks.
    const ticketIds = rows.map((t) => t.id);
    const db = supabase as unknown as { from: (t: string) => any };
    const [{ data: msgs }, { data: reads }] = ticketIds.length
      ? await Promise.all([
          db
            .from("messages")
            .select("ticket_id, direction, created_at")
            .in("ticket_id", ticketIds),
          db
            .from("message_reads")
            .select("ticket_id, read_at")
            .eq("admin_id", user.id),
        ])
      : [{ data: [] }, { data: [] }];

    const msgCount = new Map<string, number>();
    const lastOutAt = new Map<string, string>();
    for (const m of (msgs ?? []) as { ticket_id: string; direction: "in" | "out"; created_at: string }[]) {
      msgCount.set(m.ticket_id, (msgCount.get(m.ticket_id) ?? 0) + 1);
      if (m.direction === "out") {
        const cur = lastOutAt.get(m.ticket_id);
        if (!cur || m.created_at > cur) lastOutAt.set(m.ticket_id, m.created_at);
      }
    }
    const readAt = new Map(
      ((reads ?? []) as { ticket_id: string; read_at: string }[]).map((r) => [r.ticket_id, r.read_at])
    );

    tasks = rows.map((t) => {
      const lastOut = lastOutAt.get(t.id);
      const myRead = readAt.get(t.id);
      // Client-facing status: "in care" from the studio's first touch (any
      // timer log OR any studio message) until completion — pausing the timer
      // does NOT drop it back to "ממתין".
      const touched = t.time_logs.length > 0 || !!lastOut;
      return {
        id: t.id,
        title: t.title ?? "—",
        status: t.status,
        clientStatus: t.status === "completed" ? "completed" : touched ? "active" : "pending",
        completed_at: t.completed_at,
        seconds: sumLoggedSeconds(t.time_logs),
        description: t.description ?? null,
        link: t.link ?? null,
        projectId: t.project_id,
        projectName: nameById.get(t.project_id) ?? "",
        msgCount: msgCount.get(t.id) ?? 0,
        unread: !!lastOut && (!myRead || lastOut > myRead),
      };
    });
  }

  return <TasksView projects={projects} tasks={tasks} />;
}
