"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, sumLoggedSeconds } from "@/lib/format";

// All four actions are admin-only. RLS on `tickets`/`time_logs`
// also enforces this at the database level (defense in depth).

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("אין הרשאה");
  return supabase;
}

// Immediate start: create a blank task (no project, no title) and
// start its timer right now. Project + name are filled in later via
// updateTicket. Returns the new ticket id.
export async function quickStartTimer(): Promise<string> {
  const supabase = await assertAdmin();

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .insert({ status: "in_progress" })
    .select("id")
    .single();
  if (ticketError) throw new Error(ticketError.message);

  const { error: logError } = await supabase
    .from("time_logs")
    .insert({ ticket_id: ticket.id });
  if (logError) throw new Error(logError.message);

  revalidatePath("/admin", "layout");
  return ticket.id;
}

// "Start Treatment" / "Resume Timer" — both open a fresh active
// time-log segment and mark the ticket in_progress.
export async function startTimer(ticketId: string) {
  const supabase = await assertAdmin();

  // Guard: close any stray active segment first (shouldn't happen,
  // but keeps the one-active-per-ticket invariant safe).
  await closeActiveSegment(supabase, ticketId);

  const { error: logError } = await supabase
    .from("time_logs")
    .insert({ ticket_id: ticketId });
  if (logError) throw new Error(logError.message);

  const { error } = await supabase
    .from("tickets")
    .update({ status: "in_progress" })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin", "layout");
}

// "Pause Timer" — close the active segment, store its duration,
// mark the ticket paused.
export async function pauseTimer(ticketId: string) {
  const supabase = await assertAdmin();
  await closeActiveSegment(supabase, ticketId);

  const { error } = await supabase
    .from("tickets")
    .update({ status: "paused" })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin", "layout");
}

// "Task Completed" — stop any running timer, save the final
// segment, mark completed. hours_used updates automatically via
// the project_stats view (no manual deduction, no drift).
export async function completeTask(ticketId: string, note?: string) {
  const supabase = await assertAdmin();
  await closeActiveSegment(supabase, ticketId);

  const { error } = await supabase
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  const trimmedNote = note?.trim() || undefined;
  const { runAfter } = await import("@/lib/after");
  await runAfter(async () => {
    const { notifyTaskCompleted } = await import("@/lib/email/notifications");
    await notifyTaskCompleted(ticketId, trimmedNote);
  });

  revalidatePath("/admin", "layout");
}

// Correct the time on an EXISTING task by `deltaSeconds` — positive to add
// (e.g. the timer was never started), negative to take time back (e.g. the
// timer was left running over a lunch break).
//
// Both directions are one closed time_logs segment; a reduction is simply a
// row with a negative duration_seconds. Nothing needs to hunt down and rewrite
// the original segments, and the correction stays visible as its own row.
// `duration_seconds` is summed raw by the project_stats view and by
// sumLoggedSeconds, so a negative genuinely subtracts everywhere.
//
// Task status is untouched, so the task stays open and the client gets no
// email — they're only updated when it's completed.
export async function adjustTaskTime(
  ticketId: string,
  deltaSeconds: number
): Promise<{ ok: boolean; error?: string; totalSeconds?: number }> {
  try {
    const supabase = await assertAdmin();
    if (!ticketId) return { ok: false, error: "מזהה משימה חסר" };
    if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0)
      return { ok: false, error: "יש להזין זמן גדול מאפס" };

    // A reduction must not drive the task's total below zero — the display
    // helpers all clamp at 0, so it would look fine while quietly subtracting
    // from the project's hours_used. Read the total the same way the UI does
    // (a running segment counts as elapsed-so-far) so the check matches what
    // the admin is looking at.
    const { data: logs, error: readError } = await supabase
      .from("time_logs")
      .select("start_time, end_time, duration_seconds")
      .eq("ticket_id", ticketId);
    if (readError) return { ok: false, error: readError.message };

    const current = sumLoggedSeconds(logs ?? []);
    if (current + deltaSeconds < 0)
      return {
        // Same wording and same format as the client-side guard in TaskDetails —
        // whichever one an admin trips, the stated limit reads identically.
        ok: false,
        error: `לא ניתן להפחית יותר מהזמן שתועד (${formatDuration(current)})`,
      };

    const now = new Date();
    // An addition stands for work that just happened, so back-date its start.
    // A reduction is a correction made right now — back-dating it by a negative
    // delta would put start_time in the future, which would mis-bucket it in
    // the dashboard's this-month rollup (that filter reads start_time).
    const start = deltaSeconds > 0 ? new Date(now.getTime() - deltaSeconds * 1000) : now;

    const { error } = await supabase.from("time_logs").insert({
      ticket_id: ticketId,
      start_time: start.toISOString(),
      end_time: now.toISOString(),
      duration_seconds: deltaSeconds,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin", "layout");
    return { ok: true, totalSeconds: current + deltaSeconds };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Close the currently-running segment (end_time IS NULL), if any,
// computing its duration from start_time.
async function closeActiveSegment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticketId: string
) {
  const { data: active } = await supabase
    .from("time_logs")
    .select("id, start_time")
    .eq("ticket_id", ticketId)
    .is("end_time", null)
    .maybeSingle();

  if (!active) return;

  const end = new Date();
  const duration = Math.max(
    0,
    Math.floor((end.getTime() - new Date(active.start_time).getTime()) / 1000)
  );

  await supabase
    .from("time_logs")
    .update({ end_time: end.toISOString(), duration_seconds: duration })
    .eq("id", active.id);
}
