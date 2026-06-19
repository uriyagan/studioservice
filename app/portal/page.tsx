import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { PortalClient } from "@/components/portal/PortalClient";
import { HourPackageRow, ProjectStats, Purchase, Ticket, TimeLog } from "@/lib/types";
import { sumLoggedSeconds } from "@/lib/format";

export const dynamic = "force-dynamic";

interface TicketRow extends Ticket {
  time_logs: TimeLog[];
}

export default async function PortalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, company, address, notes")
    .eq("id", user!.id)
    .maybeSingle();

  // A client may have one or more projects; show the first for now.
  const { data: projects } = await supabase
    .from("project_stats")
    .select("*")
    .eq("client_id", user!.id)
    .order("name");
  const project = (projects ?? [])[0] ?? null;

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
      title: t.title ?? "—",
      completed_at: t.completed_at,
      seconds: sumLoggedSeconds(t.time_logs),
    }));

  const db = supabase as unknown as { from: (t: string) => any };
  const [{ data: pkgs }, { data: purchaseRows }] = await Promise.all([
    db.from("hour_packages").select("*").eq("active", true).order("sort"),
    db.from("purchases").select("*").eq("client_id", user!.id).order("created_at", { ascending: false }),
  ]);
  const packages = (pkgs ?? []) as HourPackageRow[];
  const purchases = (purchaseRows ?? []) as Purchase[];

  return (
    <PortalClient
      project={proj}
      completedTasks={completed}
      packages={packages}
      purchases={purchases}
      profile={{
        id: user!.id,
        first_name: myProfile?.first_name ?? null,
        last_name: myProfile?.last_name ?? null,
        phone: myProfile?.phone ?? null,
        company: myProfile?.company ?? null,
        address: myProfile?.address ?? null,
        notes: null,
      }}
    />
  );
}
