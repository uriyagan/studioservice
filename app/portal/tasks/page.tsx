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
    tasks = ((data ?? []) as (Ticket & { time_logs: TimeLog[]; project_id: string })[]).map((t) => ({
      id: t.id,
      title: t.title ?? "—",
      status: t.status,
      completed_at: t.completed_at,
      seconds: sumLoggedSeconds(t.time_logs),
      description: t.description ?? null,
      link: t.link ?? null,
      projectId: t.project_id,
      projectName: nameById.get(t.project_id) ?? "",
    }));
  }

  return <TasksView projects={projects} tasks={tasks} />;
}
