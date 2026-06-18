"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  revalidatePath("/admin");
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

  revalidatePath("/admin");
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

  revalidatePath("/admin");
}

// "Task Completed" — stop any running timer, save the final
// segment, mark completed. hours_used updates automatically via
// the project_stats view (no manual deduction, no drift).
export async function completeTask(ticketId: string) {
  const supabase = await assertAdmin();
  await closeActiveSegment(supabase, ticketId);

  const { error } = await supabase
    .from("tickets")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
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
