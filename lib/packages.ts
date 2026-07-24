// Hour-package ledger service layer. SERVER-ONLY (uses the service-role
// client). Consumption stays DERIVED from time_logs via project_stats;
// these helpers manage the package lifecycle (activate / reconcile / add)
// and expose the active-package state used by the enforcement guards.

import { createAdminClient } from "@/lib/supabase/admin";
import { sumLoggedSeconds } from "@/lib/format";
import type { PackageSource, ProjectPackage } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = { from: (t: string) => any };
function db(): DB {
  return createAdminClient() as unknown as DB;
}

export type ActivePackageState = {
  isRetainer: boolean;
  isBuild: boolean;
  hasActive: boolean;
  activePackageId: string | null;
  remainingHours: number; // from project_stats (rounded, floored at 0)
  remainingSeconds: number;
  // True for an hours-type project with no usable active package —
  // timers / manual time must be blocked.
  blocked: boolean;
};

// Read the active-package state for a project from the stats view.
export async function getActivePackageState(projectId: string): Promise<ActivePackageState> {
  const d = db();
  const { data: s } = await d
    .from("project_stats")
    .select("is_retainer, is_build, has_active, active_package_id, hours_remaining")
    .eq("id", projectId)
    .maybeSingle();

  const isRetainer = !!s?.is_retainer;
  const isBuild = !!s?.is_build;
  const hasActive = !!s?.has_active;
  const remainingHours = Number(s?.hours_remaining ?? 0);
  const remainingSeconds = Math.round(remainingHours * 3600);
  const blocked = !isRetainer && !isBuild && (!hasActive || remainingSeconds <= 0);

  return {
    isRetainer,
    isBuild,
    hasActive,
    activePackageId: (s?.active_package_id as string | null) ?? null,
    remainingHours,
    remainingSeconds,
    blocked,
  };
}

// Promote the oldest queued package to active (FIFO). No-op if one is
// already active. Returns the id of the active package, or null if the
// queue is empty (project is now without an active package).
export async function activateNextPackage(projectId: string): Promise<string | null> {
  const d = db();
  const { data: existing } = await d
    .from("project_packages")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: next } = await d
    .from("project_packages")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) return null;

  await d
    .from("project_packages")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", next.id);
  return next.id as string;
}

// Add a package to a project. Activates immediately if none is active,
// otherwise queues it (FIFO). Used by the admin "create package" action
// and the Stripe purchase webhook.
export async function addPackage(input: {
  projectId: string;
  clientId?: string | null;
  hours: number;
  source: PackageSource;
  activatedBy?: string | null;
  purchaseId?: string | null;
  note?: string | null;
}): Promise<{ ok: boolean; error?: string; packageId?: string; activated?: boolean }> {
  if (!(input.hours > 0)) return { ok: false, error: "כמות שעות חייבת להיות גדולה מאפס" };
  const d = db();

  const { data: active } = await d
    .from("project_packages")
    .select("id")
    .eq("project_id", input.projectId)
    .eq("status", "active")
    .maybeSingle();
  const willActivate = !active;

  const { data: inserted, error } = await d
    .from("project_packages")
    .insert({
      project_id: input.projectId,
      client_id: input.clientId ?? null,
      source: input.source,
      hours: input.hours,
      status: willActivate ? "active" : "queued",
      activated_at: willActivate ? new Date().toISOString() : null,
      activated_by: input.activatedBy ?? null,
      purchase_id: input.purchaseId ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  return { ok: true, packageId: inserted.id as string, activated: willActivate };
}

// List every package on a project (admin-side; bypasses RLS). Ordered
// oldest-first so callers can split into active / queued / history.
export async function listProjectPackages(projectId: string): Promise<ProjectPackage[]> {
  const d = db();
  const { data } = await d
    .from("project_packages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as ProjectPackage[];
}

// Enforce the hard limit for a project. If the active package's derived
// consumption has reached its capacity, cap any running segment at the
// exact boundary timestamp (so nothing bills past the package), mark the
// package depleted, pause the capped ticket, activate the next queued
// package, and notify the responsible admin. Safe to call anytime —
// returns early when within limit or for retainer/build projects.
export async function reconcileProject(projectId: string): Promise<{
  depleted: boolean;
  activatedNext: boolean;
  cappedTicketId: string | null;
}> {
  const out = { depleted: false, activatedNext: false, cappedTicketId: null as string | null };
  const d = db();

  const { data: proj } = await d
    .from("projects")
    .select("is_retainer, is_build")
    .eq("id", projectId)
    .maybeSingle();
  if (!proj || proj.is_retainer || proj.is_build) return out;

  // Tickets of this project (to scope time_logs).
  const { data: tix } = await d.from("tickets").select("id").eq("project_id", projectId);
  const ticketIds = ((tix ?? []) as { id: string }[]).map((t) => t.id);
  if (!ticketIds.length) return out;

  // Bounded loop: a pre-existing overage can cascade across queued packages.
  for (let guard = 0; guard < 20; guard++) {
    const { data: active } = await d
      .from("project_packages")
      .select("id, hours")
      .eq("project_id", projectId)
      .eq("status", "active")
      .maybeSingle();
    if (!active) break; // no active package → blocked state, nothing to cap

    const { data: depletedRows } = await d
      .from("project_packages")
      .select("hours")
      .eq("project_id", projectId)
      .eq("status", "depleted");
    const depletedSeconds =
      ((depletedRows ?? []) as { hours: number }[]).reduce((a, r) => a + Number(r.hours || 0), 0) *
      3600;

    const { data: logs } = await d
      .from("time_logs")
      .select("id, ticket_id, start_time, end_time, duration_seconds")
      .in("ticket_id", ticketIds);
    const rows = (logs ?? []) as {
      id: string;
      ticket_id: string;
      start_time: string;
      end_time: string | null;
      duration_seconds: number | null;
    }[];

    const totalConsumed = sumLoggedSeconds(rows);
    const capacity = Number(active.hours) * 3600;
    const activeConsumed = totalConsumed - depletedSeconds;
    if (activeConsumed < capacity) break; // within limit

    // Over capacity → cap running segment(s) at the exact boundary.
    const closedConsumed =
      rows.filter((r) => r.end_time).reduce((a, r) => a + (r.duration_seconds ?? 0), 0) -
      depletedSeconds;
    const remainingBeforeRunning = Math.max(0, capacity - closedConsumed);

    const running = rows
      .filter((r) => !r.end_time)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    let boundaryIso = new Date().toISOString();
    let cappedTicket: string | null = null;

    if (running.length) {
      const first = running[0];
      const startMs = new Date(first.start_time).getTime();
      const boundaryMs = startMs + remainingBeforeRunning * 1000;
      boundaryIso = new Date(boundaryMs).toISOString();
      await d
        .from("time_logs")
        .update({
          end_time: boundaryIso,
          duration_seconds: Math.max(0, Math.floor((boundaryMs - startMs) / 1000)),
        })
        .eq("id", first.id);
      await d.from("tickets").update({ status: "paused" }).eq("id", first.ticket_id);
      cappedTicket = first.ticket_id;

      // Concurrent extra running segments can't exceed the boundary either.
      for (const r of running.slice(1)) {
        const rStart = new Date(r.start_time).getTime();
        const end = Math.max(rStart, boundaryMs);
        await d
          .from("time_logs")
          .update({
            end_time: new Date(end).toISOString(),
            duration_seconds: Math.max(0, Math.floor((end - rStart) / 1000)),
          })
          .eq("id", r.id);
        await d.from("tickets").update({ status: "paused" }).eq("id", r.ticket_id);
      }
    }

    await d
      .from("project_packages")
      .update({ status: "depleted", closed_at: boundaryIso, notified_depleted: true })
      .eq("id", active.id);
    out.depleted = true;
    out.cappedTicketId = cappedTicket;

    const activatedId = await activateNextPackage(projectId);
    if (activatedId) out.activatedNext = true;

    if (cappedTicket) {
      try {
        const { notifyPackageEnded } = await import("@/lib/email/notifications");
        await notifyPackageEnded(cappedTicket, projectId);
      } catch {
        /* best-effort */
      }
    }

    if (!activatedId) break; // no next package → stop
  }

  return out;
}

// Convenience: reconcile the project a ticket belongs to.
export async function reconcileProjectByTicket(ticketId: string): Promise<void> {
  const d = db();
  const { data: t } = await d.from("tickets").select("project_id").eq("id", ticketId).maybeSingle();
  if (t?.project_id) await reconcileProject(t.project_id as string);
}
