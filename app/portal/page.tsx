import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { PortalClient } from "@/components/portal/PortalClient";
import { HourPackageRow, ProjectStats, Purchase, Ticket, TimeLog } from "@/lib/types";
import { sumLoggedSeconds } from "@/lib/format";

export const dynamic = "force-dynamic";

interface TicketRow extends Ticket {
  time_logs: TimeLog[];
}

export interface PortalTask {
  id: string;
  title: string;
  status: Ticket["status"];
  completed_at: string | null;
  seconds: number;
}

export default async function PortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, company, company_number, address, notes")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: projectRows } = await supabase
    .from("project_stats")
    .select("*")
    .eq("client_id", user!.id)
    .order("name");
  const projects = (projectRows ?? []) as ProjectStats[];

  if (projects.length === 0) {
    return (
      <Card>
        <p className="text-slate-600">עדיין לא שויך אליך פרויקט. אנא פנה אלינו.</p>
      </Card>
    );
  }

  // Completed tasks per project (one query for all the client's projects).
  const projectIds = projects.map((p) => p.id);
  const { data: tickets } = await supabase
    .from("tickets")
    .select("*, time_logs(*)")
    .in("project_id", projectIds)
    .order("created_at", { ascending: false });

  const tasksByProject: Record<string, PortalTask[]> = {};
  for (const id of projectIds) tasksByProject[id] = [];
  for (const t of (tickets ?? []) as (TicketRow & { project_id: string })[]) {
    (tasksByProject[t.project_id] ??= []).push({
      id: t.id,
      title: t.title ?? "—",
      status: t.status,
      completed_at: t.completed_at,
      seconds: sumLoggedSeconds(t.time_logs),
    });
  }

  const db = supabase as unknown as { from: (t: string) => any };
  const [{ data: pkgs }, { data: purchaseRows }] = await Promise.all([
    db.from("hour_packages").select("*").eq("active", true).order("sort"),
    db.from("purchases").select("*").eq("client_id", user!.id).order("created_at", { ascending: false }),
  ]);
  const packages = (pkgs ?? []) as HourPackageRow[];
  const purchases = (purchaseRows ?? []) as Purchase[];

  return (
    <PortalClient
      projects={projects}
      completedByProject={tasksByProject}
      packages={packages}
      purchases={purchases}
      profile={{
        id: user!.id,
        first_name: myProfile?.first_name ?? null,
        last_name: myProfile?.last_name ?? null,
        phone: myProfile?.phone ?? null,
        company: myProfile?.company ?? null,
        company_number: myProfile?.company_number ?? null,
        address: myProfile?.address ?? null,
        notes: null,
      }}
      billing={{
        company: myProfile?.company ?? "",
        company_number: myProfile?.company_number ?? "",
        email: user!.email ?? "",
        phone: myProfile?.phone ?? "",
        address: myProfile?.address ?? "",
      }}
    />
  );
}
