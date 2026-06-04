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
    const name = String(formData.get("name") ?? "").trim();

    if (!email || password.length < 6) {
      return { ok: false, error: "אימייל וסיסמה (6+ תווים) נדרשים" };
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: "client" },
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

// Admin creates a task directly and assigns it to a project.
// The task starts as 'pending', ready for "התחל טיפול".
export async function createAdminTicket(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!projectId) return { ok: false, error: "יש לבחור פרויקט" };
    if (!title) return { ok: false, error: "כותרת נדרשת" };

    const { error } = await supabase.from("tickets").insert({
      project_id: projectId,
      title,
      description: description || null,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Manually adjust a project's allocated hours at any time.
export async function updateProjectHours(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const supabase = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const totalHours = Number(formData.get("total_hours") ?? 0);

    const { error } = await supabase
      .from("projects")
      .update({ total_hours_allocated: totalHours })
      .eq("id", projectId);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
