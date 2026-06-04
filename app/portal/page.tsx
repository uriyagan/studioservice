import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { PortalClient } from "@/components/portal/PortalClient";
import { ProjectStats, Ticket, TimeLog } from "@/lib/types";
import { sumLoggedSeconds } from "@/lib/format";

export const dynamic = "force-dynamic";

interface TicketRow extends Ticket {
  time_logs: TimeLog[];
}

export default async function PortalPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1 client = 1 project. Grab it from the stats view.
  const { data: project } = await supabase
    .from("project_stats")
    .select("*")
    .eq("client_id", user!.id)
    .maybeSingle();

  if (!project) {
    return (
      <Card>
        <p className="text-slate-600">
          עדיין לא שויך אליך פרויקט. אנא פנה אלינו.
        </p>
      </Card>
    );
  }

  const proj = project as ProjectStats;

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*, time_logs(*)")
    .eq("project_id", proj.id)
    .order("created_at", { ascending: false });

  const rows = (tickets ?? []) as TicketRow[];
  const completed = rows
    .filter((t) => t.status === "completed")
    .map((t) => ({
      id: t.id,
      title: t.title,
      completed_at: t.completed_at,
      seconds: sumLoggedSeconds(t.time_logs),
    }));

  return (
    <PortalClient project={proj} completedTasks={completed} />
  );
}
