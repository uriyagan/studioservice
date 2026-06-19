// Best-effort email notifications fired from server actions. All
// functions swallow their own errors so they never break the action.

import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEmail } from "./dispatch";
import { renderTasksSummary } from "./render";
import { replyAddress } from "./thread";

const SITE = "https://service.uriyaganor.com";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): { from: (t: string) => any } {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

// Email the client that a task was completed, then check usage thresholds.
export async function notifyTaskCompleted(ticketId: string) {
  try {
    const d = db();
    const { data: ticket } = await d
      .from("tickets")
      .select("title, description, project_id")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket?.project_id) return;

    const { data: stats } = await d
      .from("project_stats")
      .select("*")
      .eq("id", ticket.project_id)
      .maybeSingle();

    if (stats?.client_id) {
      const { data: client } = await d
        .from("profiles")
        .select("email, name, first_name, last_name")
        .eq("id", stats.client_id)
        .maybeSingle();
      if (client?.email) {
        await dispatchEmail(
          "task_completed",
          client.email,
          {
            first_name: client.first_name ?? "",
            last_name: client.last_name ?? "",
            full_name: client.name ?? "",
            client_name: client.name ?? "",
            project_name: stats.name ?? "",
            task_title: ticket.title ?? "",
            task_description: ticket.description ?? "",
            hours_used: stats.hours_used ?? "",
            hours_remaining: stats.hours_remaining ?? "",
            total_hours: stats.total_hours_allocated ?? "",
            portal_url: `${SITE}/portal`,
            site_url: SITE,
          },
          {},
          { replyTo: replyAddress(ticketId), ticketId }
        );
      }
    }

    await checkUsageThresholds(ticket.project_id);
  } catch (e) {
    console.error("notifyTaskCompleted failed:", (e as Error).message);
  }
}

// Fire the 50% / depleted emails once each (gated by project flags).
export async function checkUsageThresholds(projectId: string) {
  try {
    const d = db();
    const { data: proj } = await d
      .from("projects")
      .select("is_retainer, total_hours_allocated, client_id, notified_half, notified_depleted, name")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj || proj.is_retainer || !proj.client_id) return;

    const total = Number(proj.total_hours_allocated) || 0;
    if (total <= 0) return;

    const { data: stats } = await d
      .from("project_stats")
      .select("hours_used, hours_remaining, total_hours_allocated, name")
      .eq("id", projectId)
      .maybeSingle();
    const used = Number(stats?.hours_used) || 0;
    const remaining = Number(stats?.hours_remaining) || 0;

    const { data: client } = await d
      .from("profiles")
      .select("email, name, first_name, last_name")
      .eq("id", proj.client_id)
      .maybeSingle();
    if (!client?.email) return;

    const vars = {
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      full_name: client.name ?? "",
      client_name: client.name ?? "",
      project_name: stats?.name ?? proj.name ?? "",
      hours_used: used,
      hours_remaining: remaining,
      total_hours: total,
      buy_url: `${SITE}/portal`,
      portal_url: `${SITE}/portal`,
      site_url: SITE,
    };

    if (used >= total && !proj.notified_depleted) {
      const { data: tix } = await d
        .from("tickets")
        .select("title, time_logs(duration_seconds)")
        .eq("project_id", projectId)
        .eq("status", "completed");
      const rows = ((tix ?? []) as { title: string | null; time_logs: { duration_seconds: number | null }[] }[]).map((t) => ({
        title: t.title,
        seconds: (t.time_logs ?? []).reduce((a, l) => a + (l.duration_seconds ?? 0), 0),
      }));
      await dispatchEmail("package_depleted", client.email, vars, {
        tasks_summary: renderTasksSummary(rows),
      });
      await d.from("projects").update({ notified_depleted: true, notified_half: true }).eq("id", projectId);
      return;
    }

    if (used < total && used >= total * 0.5 && !proj.notified_half) {
      await dispatchEmail("package_half", client.email, vars);
      await d.from("projects").update({ notified_half: true }).eq("id", projectId);
    }
  } catch (e) {
    console.error("checkUsageThresholds failed:", (e as Error).message);
  }
}

// Email all admins when a client opens a new task.
export async function notifyAdminsNewTask(ticketId: string) {
  try {
    const d = db();
    const { data: ticket } = await d
      .from("tickets")
      .select("title, description, project_id")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket) return;

    let projectName = "";
    let clientName = "";
    let firstName = "";
    let lastName = "";
    if (ticket.project_id) {
      const { data: proj } = await d.from("projects").select("name, client_id").eq("id", ticket.project_id).maybeSingle();
      projectName = proj?.name ?? "";
      if (proj?.client_id) {
        const { data: c } = await d.from("profiles").select("name, first_name, last_name").eq("id", proj.client_id).maybeSingle();
        clientName = c?.name ?? "";
        firstName = c?.first_name ?? "";
        lastName = c?.last_name ?? "";
      }
    }

    const { data: admins } = await d.from("profiles").select("email").eq("role", "admin");
    const emails = ((admins ?? []) as { email: string | null }[]).map((a) => a.email).filter(Boolean) as string[];
    if (!emails.length) return;

    await dispatchEmail(
      "new_task_admin",
      emails,
      {
        client_name: clientName,
        full_name: clientName,
        first_name: firstName,
        last_name: lastName,
        project_name: projectName,
        task_title: ticket.title ?? "",
        task_description: ticket.description ?? "",
        task_url: `${SITE}/admin`,
        site_url: SITE,
        portal_url: `${SITE}/portal`,
      },
      {},
      { replyTo: replyAddress(ticketId) }
    );
  } catch (e) {
    console.error("notifyAdminsNewTask failed:", (e as Error).message);
  }
}
