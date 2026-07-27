import { createClient } from "@/lib/supabase/server";
import { TasksTable, TaskRow } from "@/components/admin/TasksTable";
import { CreateTaskForm } from "@/components/admin/CreateTaskForm";
import { toAdminOptions } from "@/lib/admins";
import { ManualTimeForm } from "@/components/admin/ManualTimeForm";
import { QuickStartButton } from "@/components/admin/QuickStartButton";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { StatCard } from "@/components/ui/Card";
import { formatHours } from "@/lib/format";
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
  assignee_id?: string | null;
  created_by?: string | null;
  projects: { name: string; is_retainer: boolean; is_build: boolean; client_id: string | null } | null;
  time_logs: TaskRow["time_logs"];
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: tickets }, { data: projectList }, { data: profiles }, { data: statsRows }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, projects(name, is_retainer, is_build, client_id), time_logs(*)")
      .order("created_at", { ascending: false }),
    supabase.from("projects").select("id, name, is_retainer, is_build").order("name"),
    supabase.from("profiles").select("id, name, role"),
    supabase
      .from("project_stats")
      .select("id, client_id, is_retainer, is_build, has_active, hours_remaining"),
  ]);

  const projectRows = (projectList ?? []) as {
    id: string;
    name: string;
    is_retainer: boolean;
    is_build: boolean;
  }[];
  const projects = projectRows.map((p) => ({ id: p.id, name: p.name }));
  // Manual time only applies to hours-package projects (build / retainer have
  // no time tracking).
  const hoursProjects = projectRows
    .filter((p) => !p.is_retainer && !p.is_build)
    .map((p) => ({ id: p.id, name: p.name }));
  const profileList = (profiles ?? []) as (Pick<Profile, "id" | "name"> & { role: string })[];
  const nameById = new Map<string, string>(profileList.map((p) => [p.id, p.name ?? ""]));
  const roleById = new Map<string, string>(profileList.map((p) => [p.id, p.role]));
  const admins = toAdminOptions(profileList);

  // Latest inbound (client) message time per ticket — the client compares it
  // against a locally-stored "read at" so the dot clears once it's opened.
  const ticketIds = ((tickets ?? []) as RawTicket[]).map((t) => t.id);
  const lastInbound: Record<string, string> = {};
  if (ticketIds.length) {
    const db = supabase as unknown as { from: (t: string) => any };
    const { data: msgs } = await db
      .from("messages")
      .select("ticket_id, created_at")
      .in("ticket_id", ticketIds)
      .eq("direction", "in")
      .order("created_at", { ascending: false });
    for (const m of (msgs ?? []) as { ticket_id: string; created_at: string }[]) {
      if (!(m.ticket_id in lastInbound)) lastInbound[m.ticket_id] = m.created_at;
    }
  }

  const rows: TaskRow[] = ((tickets ?? []) as RawTicket[]).map((t) => {
    // Who opened the task — only surfaced when it's a project member different
    // from the project's primary client (admin-created / old tasks show none).
    const openerId = t.created_by ?? null;
    const openerIsMember =
      !!openerId && roleById.get(openerId) === "client" && openerId !== t.projects?.client_id;
    return {
      ...t,
      projects: t.projects ? { name: t.projects.name, is_retainer: t.projects.is_retainer } : null,
      noTimer: !!t.projects && (t.projects.is_retainer || t.projects.is_build),
      clientName: t.projects?.client_id ? nameById.get(t.projects.client_id) ?? "" : "",
      openedByName: openerIsMember ? nameById.get(openerId) ?? "" : "",
      lastInboundAt: lastInbound[t.id] ?? null,
      assignee_id: t.assignee_id ?? null,
      assigneeName: t.assignee_id ? nameById.get(t.assignee_id) ?? "" : "",
    };
  });

  // ── Top-line stats ─────────────────────────────────────────
  const openCount = rows.filter((r) => r.status !== "completed").length;

  const activeClientSet = new Set<string>();
  // project_id → active-package remaining seconds for the live auto-stop
  // (null = no limit: retainer / build; 0 = exhausted / no active package).
  const pkgRemaining: Record<string, number | null> = {};
  for (const ps of (statsRows ?? []) as {
    id: string;
    client_id: string | null;
    is_retainer: boolean;
    is_build?: boolean;
    has_active?: boolean;
    hours_remaining: number | null;
  }[]) {
    if (ps.client_id && (ps.is_retainer || Number(ps.hours_remaining) > 0)) activeClientSet.add(ps.client_id);
    pkgRemaining[ps.id] =
      ps.is_retainer || ps.is_build
        ? null
        : ps.has_active
          ? Math.max(0, Math.round((Number(ps.hours_remaining) || 0) * 3600))
          : 0;
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let monthSeconds = 0;
  for (const t of (tickets ?? []) as RawTicket[]) {
    for (const l of t.time_logs ?? []) {
      if (l.start_time && new Date(l.start_time).getTime() >= monthStart) monthSeconds += l.duration_seconds ?? 0;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מעקב משימות</h1>
          <p className="mt-1 text-sm text-slate-500">כל המשימות מכל הפרויקטים.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-start [&>button]:w-full sm:[&>button]:w-auto">
          <QuickStartButton />
          {projects.length > 0 ? (
            <>
              {hoursProjects.length > 0 && <ManualTimeForm projects={hoursProjects} />}
              <CreateTaskForm projects={projects} admins={admins} />
            </>
          ) : (
            <p className="text-sm text-amber-600">צור פרויקט תחילה כדי להוסיף משימות.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="משימות פתוחות לטיפול" value={String(openCount)} />
        <StatCard label="לקוחות עם חבילה פעילה" value={String(activeClientSet.size)} />
        <StatCard label="שעות שעבדנו החודש" value={formatHours(monthSeconds / 3600)} />
      </div>

      <TasksTable
        tasks={rows}
        projects={projects}
        admins={admins}
        currentUserId={user?.id}
        pkgRemaining={pkgRemaining}
      />
      <AutoRefresh seconds={45} />
    </div>
  );
}
