"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

type ActionResult = { ok: boolean; error?: string };

// Create a client login (email + password) via the service-role
// API. The on_auth_user_created trigger inserts the profile row.
export async function createClientUser(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();
    const role = formData.get("role") === "admin" ? "admin" : "client";

    if (!email || password.length < 6) {
      return { ok: false, error: "אימייל וסיסמה (6+ תווים) נדרשים" };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, first_name: firstName, last_name: lastName, role },
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Create a project and link it to a client. Hourly package → set
// total hours; Retainer → unlimited (is_retainer = true).
export async function createProject(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const name = String(formData.get("name") ?? "").trim();
    const clientId = String(formData.get("client_id") ?? "") || null;
    const isRetainer = formData.get("is_retainer") === "on";
    const totalHours = isRetainer
      ? 0
      : Number(formData.get("total_hours") ?? 0);

    if (!name) return { ok: false, error: "שם פרויקט נדרש" };

    const { error } = await supabase.from("projects").insert({
      name,
      client_id: clientId,
      is_retainer: isRetainer,
      total_hours_allocated: totalHours,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Edit a client: name (always), email + password (optional).
// Email/password go through the service-role auth admin API;
// name + email are mirrored into the profiles row for display.
export async function updateClientUser(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const id = String(formData.get("id") ?? "");
    const firstName = String(formData.get("first_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const name = `${firstName} ${lastName}`.trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = formData.get("role") === "admin" ? "admin" : "client";

    if (!id) return { ok: false, error: "מזהה משתמש חסר" };
    if (!email) return { ok: false, error: "אימייל נדרש" };
    if (password && password.length < 6) {
      return { ok: false, error: "סיסמה חייבת להיות 6+ תווים" };
    }

    // Guard: an admin can't strip their own admin role (lockout).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id === id && role !== "admin") {
      return { ok: false, error: "אי אפשר להסיר לעצמך הרשאת אדמין" };
    }

    const admin = createAdminClient();
    const authUpdate: { email: string; email_confirm: boolean; password?: string } = {
      email,
      email_confirm: true,
    };
    if (password) authUpdate.password = password;

    const { error: authErr } = await admin.auth.admin.updateUserById(id, authUpdate);
    if (authErr) return { ok: false, error: authErr.message };

    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        name: name || null,
        first_name: firstName || null,
        last_name: lastName || null,
        email,
        role,
      })
      .eq("id", id);
    if (profErr) return { ok: false, error: profErr.message };

    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Delete a client. Deleting the auth user cascades the profile row
// (FK on delete cascade); their project's client_id becomes NULL
// (FK on delete set null) — the project itself is kept.
export async function deleteClientUser(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, error: "מזהה משתמש חסר" };

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id === id) {
      return { ok: false, error: "אי אפשר למחוק את עצמך" };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/users");
    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Admin creates a task directly and assigns it to a project.
// The task starts as 'pending', ready for "התחל טיפול".
export async function createAdminTicket(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult & { ticketId?: string }> {
  try {
    const supabase = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const link =
      formData
        .getAll("link")
        .map((l) => String(l).trim())
        .filter(Boolean)
        .join("\n") || null;

    if (!projectId) return { ok: false, error: "יש לבחור פרויקט" };
    if (!title) return { ok: false, error: "כותרת נדרשת" };

    const { data, error } = await supabase
      .from("tickets")
      .insert({ project_id: projectId, title, description: description || null, link })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin");
    return { ok: true, ticketId: data.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Manually log used time as a completed task (deducts from the
// package via the project_stats view). Creates a completed ticket
// plus one closed time-log segment of the given duration.
export async function addManualTime(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "") || null;
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const hours = Number(formData.get("hours") ?? 0);
    const minutes = Number(formData.get("minutes") ?? 0);
    const seconds = Math.round((hours * 60 + minutes) * 60);

    if (!projectId) return { ok: false, error: "יש לבחור פרויקט" };
    if (!title) return { ok: false, error: "כותרת נדרשת" };
    if (!Number.isFinite(seconds) || seconds <= 0)
      return { ok: false, error: "יש להזין זמן גדול מאפס" };

    const now = new Date();
    const start = new Date(now.getTime() - seconds * 1000);

    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        project_id: projectId,
        title,
        description: description || null,
        status: "completed",
        completed_at: now.toISOString(),
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };

    const { error: logError } = await supabase.from("time_logs").insert({
      ticket_id: ticket.id,
      start_time: start.toISOString(),
      end_time: now.toISOString(),
      duration_seconds: seconds,
    });
    if (logError) return { ok: false, error: logError.message };

    const { runAfter } = await import("@/lib/after");
    await runAfter(async () => {
      const { checkUsageThresholds } = await import("@/lib/email/notifications");
      await checkUsageThresholds(projectId);
    });

    revalidatePath("/admin");
    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Edit a task retroactively: title, project assignment, description.
// Used to name/assign a task started via the immediate timer.
export async function updateTicket(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const id = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const projectId = String(formData.get("project_id") ?? "") || null;
    const description = String(formData.get("description") ?? "").trim();

    if (!id) return { ok: false, error: "מזהה משימה חסר" };

    const { error } = await supabase
      .from("tickets")
      .update({
        title: title || null,
        project_id: projectId,
        description: description || null,
      })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin");
    revalidatePath("/admin/projects");
    if (projectId) revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Delete a task. Cascades its time logs + attachments (FK cascade).
// Uses the service-role client (tickets have no RLS delete policy).
export async function deleteTicket(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertAdmin();
    const id = String(formData.get("id") ?? "");
    const projectId = String(formData.get("project_id") ?? "");
    if (!id) return { ok: false, error: "מזהה משימה חסר" };

    const admin = createAdminClient();
    const { error } = await admin.from("tickets").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin");
    revalidatePath("/admin/projects");
    if (projectId) revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Full project edit: name, client link, retainer toggle, hours.
export async function updateProject(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const clientId = String(formData.get("client_id") ?? "") || null;
    const isRetainer = formData.get("is_retainer") === "on";
    const totalHours = isRetainer ? 0 : Number(formData.get("total_hours") ?? 0);

    if (!projectId) return { ok: false, error: "מזהה פרויקט חסר" };
    if (!name) return { ok: false, error: "שם פרויקט נדרש" };

    // If the admin tops up hours here (not via Stripe), re-arm the usage
    // threshold emails so 50%/depleted can fire again.
    const { data: cur } = await supabase
      .from("projects")
      .select("total_hours_allocated")
      .eq("id", projectId)
      .maybeSingle();
    const toppedUp = !isRetainer && totalHours > Number(cur?.total_hours_allocated ?? 0);

    const { error } = await supabase
      .from("projects")
      .update({
        name,
        client_id: clientId,
        is_retainer: isRetainer,
        total_hours_allocated: totalHours,
        ...(toppedUp ? { notified_half: false, notified_depleted: false } : {}),
      })
      .eq("id", projectId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Delete a project. Cascades its tickets + time logs (FK cascade).
export async function deleteProject(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    if (!projectId) return { ok: false, error: "מזהה פרויקט חסר" };

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
