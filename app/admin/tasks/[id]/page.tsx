import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TaskPageView } from "@/components/admin/TaskPageView";
import { toAdminOptions } from "@/lib/admins";
import { Profile, Ticket, TimeLog } from "@/lib/types";

export const dynamic = "force-dynamic";

// The single task workspace: everything about one task — details, internal
// log, conversation, timer and completion — replaces the old trio of modals.
export default async function AdminTaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: ticket }, { data: profiles }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, projects(name, client_id), time_logs(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profiles").select("id, name, role"),
  ]);
  if (!ticket) notFound();

  const t = ticket as Ticket & {
    assignee_id?: string | null;
    created_by?: string | null;
    projects: { name: string; client_id: string | null } | null;
    time_logs: TimeLog[];
  };

  const profileList = (profiles ?? []) as (Pick<Profile, "id" | "name"> & { role: string })[];
  const nameById = new Map(profileList.map((p) => [p.id, p.name ?? ""]));
  const roleById = new Map(profileList.map((p) => [p.id, p.role]));

  // Opener — surfaced only when a project member (not the primary client)
  // opened the task, same rule as the tasks table.
  const openerId = t.created_by ?? null;
  const openerIsMember =
    !!openerId && roleById.get(openerId) === "client" && openerId !== t.projects?.client_id;

  return (
    <TaskPageView
      task={{
        id: t.id,
        title: t.title,
        description: t.description,
        link: t.link,
        status: t.status,
        created_at: t.created_at,
        project_id: t.project_id,
        projectName: t.projects?.name ?? "",
        clientName: t.projects?.client_id ? nameById.get(t.projects.client_id) ?? "" : "",
        openedByName: openerIsMember ? nameById.get(openerId) ?? "" : "",
        assignee_id: t.assignee_id ?? null,
        time_logs: t.time_logs ?? [],
      }}
      admins={toAdminOptions(profileList)}
      currentUserId={user?.id ?? ""}
    />
  );
}
