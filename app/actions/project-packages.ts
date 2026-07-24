"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { addPackage } from "@/lib/packages";

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
  return { supabase, userId: user.id };
}

type ActionResult = { ok: boolean; error?: string };

// Admin creates a NEW discrete package on a project (a gift, or an
// externally-paid package). It activates immediately if the project has
// no active package, otherwise it queues (FIFO). The source is always
// 'studio' — no reason/subtype is recorded. Emails the client.
export async function createProjectPackage(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const hours = Number(formData.get("hours") ?? 0);
    const note = String(formData.get("note") ?? "").trim() || null;

    if (!projectId) return { ok: false, error: "מזהה פרויקט חסר" };
    if (!Number.isFinite(hours) || hours <= 0)
      return { ok: false, error: "יש להזין כמות שעות גדולה מאפס" };

    // Guard: packages only apply to hours-type projects.
    const { data: proj } = await supabase
      .from("projects")
      .select("client_id, is_retainer, is_build")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj) return { ok: false, error: "פרויקט לא נמצא" };
    if (proj.is_retainer || proj.is_build)
      return { ok: false, error: "לא ניתן להוסיף חבילת שעות לפרויקט ריטיינר/הקמה" };

    const res = await addPackage({
      projectId,
      clientId: proj.client_id,
      hours,
      source: "studio",
      activatedBy: userId,
      note,
    });
    if (!res.ok) return { ok: false, error: res.error };

    const { runAfter } = await import("@/lib/after");
    await runAfter(async () => {
      const { notifyPackageAdded } = await import("@/lib/email/notifications");
      await notifyPackageAdded(projectId, hours);
    });

    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
