// Best-effort email notifications fired from server actions. All
// functions swallow their own errors so they never break the action.

import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEmail } from "./dispatch";
import { renderTasksSummary } from "./render";
import { replyAddress, taskRecipient } from "./thread";
import { formatHours, sumLoggedSeconds } from "@/lib/format";

const SITE = "https://service.uriyaganor.com";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): { from: (t: string) => any } {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

// Minimal HTML escape for user-supplied text injected as a raw merge var.
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A styled "studio note" box for the completion email, or "" when there's no
// note. Returned as raw HTML so the {completion_note} tag renders it directly.
function completionNoteHtml(note?: string): string {
  const text = note?.trim();
  if (!text) return "";
  const body = escHtml(text).replace(/\n/g, "<br>");
  return `<div style="margin-top:12px;padding:12px 14px;background:#f6f7f9;border-right:3px solid #111111;border-radius:8px;text-align:right;"><div style="font-weight:bold;margin-bottom:4px;">הערה מהסטודיו</div><div style="font-size:14px;line-height:1.6;">${body}</div></div>`;
}

// Email the client that a task was completed, then check usage thresholds.
// `note` is an optional free-text summary the admin attaches at completion.
export async function notifyTaskCompleted(ticketId: string, note?: string) {
  try {
    const d = db();
    const { data: ticket } = await d
      .from("tickets")
      .select("title, description, project_id, time_logs(start_time, end_time, duration_seconds)")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket?.project_id) return;

    const taskSeconds = sumLoggedSeconds(ticket.time_logs ?? []);

    const { data: stats } = await d
      .from("project_stats")
      .select("*")
      .eq("id", ticket.project_id)
      .maybeSingle();

    if (stats?.client_id) {
      // Build / retainer projects aren't billed by the hour, so they use a
      // separate template with no time / package-balance line.
      const flat = !!stats.is_retainer || !!stats.is_build;
      // Notify whoever opened the task (a project member), falling back to the
      // project's primary client.
      const client = await taskRecipient(ticketId);
      if (client?.email) {
        await dispatchEmail(
          flat ? "task_completed_flat" : "task_completed",
          client.email,
          {
            first_name: client.first_name ?? "",
            last_name: client.last_name ?? "",
            full_name: client.name ?? "",
            client_name: client.name ?? "",
            project_name: stats.name ?? "",
            task_title: ticket.title ?? "",
            task_description: ticket.description ?? "",
            task_time: formatHours(taskSeconds / 3600),
            hours_used: formatHours(stats.hours_used),
            hours_remaining: formatHours(stats.hours_remaining),
            total_hours: formatHours(stats.total_hours_allocated),
            portal_url: `${SITE}/portal`,
            site_url: SITE,
          },
          { completion_note: completionNoteHtml(note) },
          { replyTo: replyAddress(ticketId), ticketId, logToThread: true }
        );
      }
    }

    await checkUsageThresholds(ticket.project_id);
  } catch (e) {
    console.error("notifyTaskCompleted failed:", (e as Error).message);
  }
}

// Fire the 50% / depleted emails once each, gated by flags on the ACTIVE
// package (each new package gets a fresh set of thresholds). Values come
// from project_stats, which is scoped to the active package.
export async function checkUsageThresholds(projectId: string) {
  try {
    const d = db();
    const { data: stats } = await d
      .from("project_stats")
      .select(
        "client_id, name, is_retainer, has_active, active_package_id, total_hours_allocated, hours_used, hours_remaining"
      )
      .eq("id", projectId)
      .maybeSingle();
    if (!stats || stats.is_retainer || !stats.client_id || !stats.has_active) return;

    const total = Number(stats.total_hours_allocated) || 0;
    if (total <= 0) return;
    const used = Number(stats.hours_used) || 0;
    const remaining = Number(stats.hours_remaining) || 0;

    const { data: pkg } = await d
      .from("project_packages")
      .select("notified_half, notified_depleted")
      .eq("id", stats.active_package_id)
      .maybeSingle();
    const notifiedHalf = !!pkg?.notified_half;
    const notifiedDepleted = !!pkg?.notified_depleted;

    const { data: client } = await d
      .from("profiles")
      .select("email, name, first_name, last_name")
      .eq("id", stats.client_id)
      .maybeSingle();
    if (!client?.email) return;

    const vars = {
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      full_name: client.name ?? "",
      client_name: client.name ?? "",
      project_name: stats.name ?? "",
      hours_used: formatHours(used),
      hours_remaining: formatHours(remaining),
      total_hours: formatHours(total),
      buy_url: `${SITE}/portal`,
      portal_url: `${SITE}/portal`,
      site_url: SITE,
    };

    if (used >= total && !notifiedDepleted) {
      const rows = await packageTaskRows(projectId, await windowStart(projectId, null), null);
      await dispatchEmail("package_depleted", client.email, vars, {
        tasks_summary: renderTasksSummary(rows),
      });
      await d
        .from("project_packages")
        .update({ notified_depleted: true, notified_half: true })
        .eq("id", stats.active_package_id);
      return;
    }

    if (used < total && used >= total * 0.5 && !notifiedHalf) {
      await dispatchEmail("package_half", client.email, vars);
      await d
        .from("project_packages")
        .update({ notified_half: true })
        .eq("id", stats.active_package_id);
    }
  } catch (e) {
    console.error("checkUsageThresholds failed:", (e as Error).message);
  }
}

// Where a package's window starts: the moment the PREVIOUS package closed,
// not this package's activated_at. Consumption is allocated by cumulative
// time, so work logged before a (back-filled) activation still counts against
// the package — anchoring on activated_at would silently drop it from the
// summary. Null means "from the beginning of the project".
async function windowStart(projectId: string, beforeIso: string | null): Promise<string | null> {
  const d = db();
  let q = d
    .from("project_packages")
    .select("closed_at")
    .eq("project_id", projectId)
    .eq("status", "depleted")
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: false })
    .limit(1);
  if (beforeIso) q = q.lt("closed_at", beforeIso);
  const { data } = await q;
  return ((data ?? [])[0]?.closed_at as string | undefined) ?? null;
}

// Per-task time consumed inside ONE package's window, for {tasks_summary}.
// Scoped to the window rather than the project's whole history, so the table's
// total matches the package it describes — a client on their third package
// must not be re-shown work they already paid for. Any task that burned time
// counts, finished or not: an open task spent the hours just the same.
async function packageTaskRows(
  projectId: string,
  fromIso: string | null,
  toIso: string | null
): Promise<{ title: string | null; seconds: number }[]> {
  const d = db();
  const { data: tix } = await d.from("tickets").select("id, title").eq("project_id", projectId);
  const tickets = (tix ?? []) as { id: string; title: string | null }[];
  if (!tickets.length) return [];

  type Log = { ticket_id: string; start_time: string; end_time: string | null; duration_seconds: number | null };
  let q = d
    .from("time_logs")
    .select("ticket_id, start_time, end_time, duration_seconds")
    .in("ticket_id", tickets.map((t) => t.id));
  // Segments are capped at the package boundary when it closes, so a segment
  // belongs to the window it started in.
  if (fromIso) q = q.gte("start_time", fromIso);
  if (toIso) q = q.lte("start_time", toIso);
  const { data: logs } = await q;

  const byTicket = new Map<string, Log[]>();
  for (const l of (logs ?? []) as Log[]) {
    const arr = byTicket.get(l.ticket_id) ?? [];
    arr.push(l);
    byTicket.set(l.ticket_id, arr);
  }

  return tickets
    .map((t) => ({ title: t.title, seconds: sumLoggedSeconds(byTicket.get(t.id) ?? []) }))
    .filter((r) => r.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
}

// Email the client that their package ran out. Fired at the MOMENT of
// depletion (from reconcileProject), not from checkUsageThresholds: closing a
// package clears the project's active package, and project_stats then reports
// has_active=false with zeroed hours — so the threshold check can no longer
// see the event that just happened, and bails before it would send.
export async function notifyPackageDepleted(projectId: string, packageId: string) {
  try {
    const d = db();
    // Only tell the client once — the flag means "the client was told".
    const { data: pkg } = await d
      .from("project_packages")
      .select("hours, notified_depleted, closed_at")
      .eq("id", packageId)
      .maybeSingle();
    if (!pkg || pkg.notified_depleted) return;

    // A zero-hour package is a placeholder (projects migrated into the ledger
    // with no hours carry one), not something the client bought — telling them
    // it "ran out" would be nonsense. Mirrors the total <= 0 guard in
    // checkUsageThresholds.
    const hours = Number(pkg.hours) || 0;
    if (hours <= 0) return;

    const { data: proj } = await d
      .from("projects")
      .select("name, client_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj?.client_id) return;

    const { data: client } = await d
      .from("profiles")
      .select("email, name, first_name, last_name")
      .eq("id", proj.client_id)
      .maybeSingle();
    if (!client?.email) return;

    const closedAt = (pkg.closed_at as string | null) ?? new Date().toISOString();
    const rows = await packageTaskRows(projectId, await windowStart(projectId, closedAt), closedAt);

    // The package is spent by definition, so the figures come from the
    // package that just closed (project_stats no longer reports them).
    const res = await dispatchEmail(
      "package_depleted",
      client.email,
      {
        first_name: client.first_name ?? "",
        last_name: client.last_name ?? "",
        full_name: client.name ?? "",
        client_name: client.name ?? "",
        project_name: proj.name ?? "",
        hours_used: formatHours(hours),
        hours_remaining: formatHours(0),
        total_hours: formatHours(hours),
        buy_url: `${SITE}/portal`,
        portal_url: `${SITE}/portal`,
        site_url: SITE,
      },
      { tasks_summary: renderTasksSummary(rows) }
    );

    // Set the flag only on a real send: a disabled template or a Resend
    // failure must not be recorded as "the client knows".
    if (res.sent) {
      await d.from("project_packages").update({ notified_depleted: true }).eq("id", packageId);
    }
  } catch (e) {
    console.error("notifyPackageDepleted failed:", (e as Error).message);
  }
}

// Email the client that the studio added a new package for them.
export async function notifyPackageAdded(projectId: string, hoursAdded: number) {
  try {
    const d = db();
    const { data: stats } = await d
      .from("project_stats")
      .select("client_id, name, hours_remaining, total_hours_allocated")
      .eq("id", projectId)
      .maybeSingle();
    if (!stats?.client_id) return;

    const { data: client } = await d
      .from("profiles")
      .select("email, name, first_name, last_name")
      .eq("id", stats.client_id)
      .maybeSingle();
    if (!client?.email) return;

    await dispatchEmail("package_added_studio", client.email, {
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      full_name: client.name ?? "",
      client_name: client.name ?? "",
      project_name: stats.name ?? "",
      hours_added: formatHours(hoursAdded),
      hours_remaining: formatHours(stats.hours_remaining ?? 0),
      total_hours: formatHours(stats.total_hours_allocated ?? 0),
      portal_url: `${SITE}/portal`,
      site_url: SITE,
    });
  } catch (e) {
    console.error("notifyPackageAdded failed:", (e as Error).message);
  }
}

// Email the responsible admin (the task's assignee, falling back to all
// admins) when a package is exhausted and a running timer is auto-stopped.
export async function notifyPackageEnded(ticketId: string, projectId: string) {
  try {
    const d = db();
    const { data: ticket } = await d
      .from("tickets")
      .select("title, assignee_id")
      .eq("id", ticketId)
      .maybeSingle();

    let recipients: string[] = [];
    if (ticket?.assignee_id) {
      const { data: a } = await d
        .from("profiles")
        .select("email")
        .eq("id", ticket.assignee_id)
        .maybeSingle();
      if (a?.email) recipients = [a.email];
    }
    if (!recipients.length) {
      const { data: admins } = await d.from("profiles").select("email").eq("role", "admin");
      recipients = ((admins ?? []) as { email: string | null }[])
        .map((x) => x.email)
        .filter(Boolean) as string[];
    }
    if (!recipients.length) return;

    const { data: proj } = await d
      .from("projects")
      .select("name, client_id")
      .eq("id", projectId)
      .maybeSingle();
    let clientName = "";
    if (proj?.client_id) {
      const { data: c } = await d.from("profiles").select("name").eq("id", proj.client_id).maybeSingle();
      clientName = c?.name ?? "";
    }

    await dispatchEmail(
      "package_ended_admin",
      recipients,
      {
        project_name: proj?.name ?? "",
        client_name: clientName,
        task_title: ticket?.title ?? "",
        task_url: `${SITE}/admin/tasks/${ticketId}`,
        site_url: SITE,
        portal_url: `${SITE}/portal`,
      },
      {},
      { ticketId }
    );
  } catch (e) {
    console.error("notifyPackageEnded failed:", (e as Error).message);
  }
}

// When an admin replies in a task thread, notify the admin who OPENED the task
// (so a collaborator sees the response) — but never the replier themselves, and
// only when the opener is an admin (a client opener already gets the reply as
// the client-facing email).
export async function notifyOpenerOfAdminReply(
  ticketId: string,
  senderId: string,
  messageHtml: string
) {
  try {
    const d = db();
    const { data: ticket } = await d
      .from("tickets")
      .select("title, created_by, project_id")
      .eq("id", ticketId)
      .maybeSingle();
    const openerId = (ticket?.created_by as string | null) ?? null;
    if (!openerId || openerId === senderId) return;

    const { data: opener } = await d
      .from("profiles")
      .select("email, role")
      .eq("id", openerId)
      .maybeSingle();
    if (!opener || opener.role !== "admin" || !opener.email) return;

    const { data: sender } = await d.from("profiles").select("name").eq("id", senderId).maybeSingle();
    let projectName = "";
    if (ticket?.project_id) {
      const { data: proj } = await d.from("projects").select("name").eq("id", ticket.project_id).maybeSingle();
      projectName = proj?.name ?? "";
    }

    await dispatchEmail(
      "admin_reply_opener",
      opener.email,
      {
        task_title: ticket?.title ?? "",
        project_name: projectName,
        replier_name: sender?.name ?? "",
        task_url: `${SITE}/admin/tasks/${ticketId}`,
        site_url: SITE,
        portal_url: `${SITE}/portal`,
      },
      { message: messageHtml },
      { replyTo: replyAddress(ticketId), ticketId }
    );
  } catch (e) {
    console.error("notifyOpenerOfAdminReply failed:", (e as Error).message);
  }
}

// Email the assignee (a studio team member) when a task is assigned to them.
export async function notifyTaskAssigned(ticketId: string, assigneeId: string) {
  try {
    const d = db();
    const { data: assignee } = await d
      .from("profiles")
      .select("email, name, first_name")
      .eq("id", assigneeId)
      .maybeSingle();
    if (!assignee?.email) return;

    const { data: ticket } = await d
      .from("tickets")
      .select("title, description, project_id")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket) return;

    let projectName = "";
    let clientName = "";
    if (ticket.project_id) {
      const { data: proj } = await d
        .from("projects")
        .select("name, client_id")
        .eq("id", ticket.project_id)
        .maybeSingle();
      projectName = proj?.name ?? "";
      if (proj?.client_id) {
        const { data: c } = await d.from("profiles").select("name").eq("id", proj.client_id).maybeSingle();
        clientName = c?.name ?? "";
      }
    }

    await dispatchEmail(
      "task_assigned",
      assignee.email,
      {
        assignee_name: assignee.first_name || assignee.name || "",
        first_name: assignee.first_name ?? "",
        full_name: assignee.name ?? "",
        client_name: clientName,
        project_name: projectName,
        task_title: ticket.title ?? "",
        task_description: ticket.description ?? "",
        task_url: `${SITE}/admin/tasks/${ticketId}`,
        site_url: SITE,
        portal_url: `${SITE}/portal`,
      },
      {},
      { ticketId }
    );
  } catch (e) {
    console.error("notifyTaskAssigned failed:", (e as Error).message);
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
        task_url: `${SITE}/admin/tasks/${ticketId}`,
        site_url: SITE,
        portal_url: `${SITE}/portal`,
      },
      {},
      { replyTo: replyAddress(ticketId), ticketId }
    );
  } catch (e) {
    console.error("notifyAdminsNewTask failed:", (e as Error).message);
  }
}
