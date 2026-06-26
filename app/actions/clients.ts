"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmailHtml, substituteTags } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { dispatchEmail } from "@/lib/email/dispatch";
import { DEFAULT_BRAND, EmailBlock } from "@/lib/email/types";

const SITE = "https://service.uriyaganor.com";

type Result = { ok: boolean; error?: string; warning?: string };

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

// Re-send the welcome email with a fresh set-password link (for clients whose
// original invite link was consumed/expired).
export async function resendWelcome(clientId: string): Promise<Result> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const { data: client } = await admin
      .from("profiles")
      .select("email, first_name, last_name, name")
      .eq("id", clientId)
      .maybeSingle();
    if (!client?.email) return { ok: false, error: "ללקוח אין אימייל" };

    const { setPasswordLink } = await import("@/lib/auth-links");
    const action = await setPasswordLink(client.email);
    if (!action) return { ok: false, error: "לא נוצר קישור להגדרת סיסמה" };

    const res = await dispatchEmail("welcome", client.email, {
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      full_name: client.name ?? "",
      client_name: client.name ?? "",
      email: client.email,
      set_password_link: action,
      login_url: `${SITE}/login`,
      portal_url: `${SITE}/portal`,
      site_url: SITE,
    });
    if (!res.sent) return { ok: false, error: "שליחת המייל נכשלה" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function detailFields(fd: FormData) {
  const firstName = String(fd.get("first_name") ?? "").trim();
  const lastName = String(fd.get("last_name") ?? "").trim();
  return {
    first_name: firstName || null,
    last_name: lastName || null,
    name: `${firstName} ${lastName}`.trim() || null,
    phone: String(fd.get("phone") ?? "").trim() || null,
    company: String(fd.get("company") ?? "").trim() || null,
    company_number: String(fd.get("company_number") ?? "").trim() || null,
    address: String(fd.get("address") ?? "").trim() || null,
    notes: String(fd.get("notes") ?? "").trim() || null,
  };
}

// Create a client with full details.
export async function createClientFull(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    await assertAdmin();
    const email = String(formData.get("email") ?? "").trim();
    const typedPassword = String(formData.get("password") ?? "");
    if (!email) return { ok: false, error: "אימייל נדרש" };
    if (typedPassword && typedPassword.length < 6) {
      return { ok: false, error: "סיסמה חייבת להיות 6+ תווים" };
    }
    const fields = detailFields(formData);
    // If the admin didn't set a password, generate a random one — the
    // client will set their own via the welcome-email link.
    const password = typedPassword || `${crypto.randomUUID()}${crypto.randomUUID()}`;

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: fields.name ?? "",
        first_name: fields.first_name,
        last_name: fields.last_name,
        role: "client",
      },
    });
    if (error) return { ok: false, error: error.message };

    const id = data.user?.id;
    if (id) {
      const db = admin as unknown as { from: (t: string) => any };
      await db.from("profiles").update(fields).eq("id", id);

      // Optionally create an initial project linked to this client.
      const wantProject = formData.get("create_project") === "on";
      const projectName = String(formData.get("project_name") ?? "").trim();
      if (wantProject && projectName) {
        const isRetainer = formData.get("is_retainer") === "on";
        const totalHours = isRetainer ? 0 : Number(formData.get("total_hours") ?? 0);
        await db.from("projects").insert({
          name: projectName,
          client_id: id,
          is_retainer: isRetainer,
          total_hours_allocated: totalHours,
        });
      }
    }

    // Send the welcome email with a set-password link (best-effort;
    // respects the "welcome" template's enabled toggle). Surface a warning to
    // the admin if it fails — the client has only a random password and needs
    // the set-password link to ever log in.
    let warning: string | undefined;
    try {
      const { setPasswordLink } = await import("@/lib/auth-links");
      const action = await setPasswordLink(email);
      const res = await dispatchEmail("welcome", email, {
        first_name: fields.first_name ?? "",
        last_name: fields.last_name ?? "",
        full_name: fields.name ?? "",
        client_name: fields.name ?? "",
        email,
        set_password_link: action ?? `${SITE}/login`,
        login_url: `${SITE}/login`,
        portal_url: `${SITE}/portal`,
        site_url: SITE,
      });
      if (!action) {
        warning = "החשבון נוצר, אך לא נוצר קישור ליצירת סיסמה. שלח/י ללקוח קישור איפוס סיסמה ידנית.";
      } else if (!res.sent) {
        warning = "החשבון נוצר, אך מייל הברוכים הבאים לא נשלח. אפשר לשלוח אותו שוב מכרטיס הלקוח.";
      }
    } catch (e) {
      console.error("welcome email failed:", (e as Error).message);
      warning = "החשבון נוצר, אך שליחת מייל הברוכים הבאים נכשלה. אפשר לשלוח אותו שוב מכרטיס הלקוח.";
    }

    revalidatePath("/admin/clients");
    revalidatePath("/admin/projects");
    return { ok: true, warning };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Admin edits a client's details (no email/password change here).
export async function updateClientDetails(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    const { supabase } = await assertAdmin();
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, error: "מזהה לקוח חסר" };

    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "כתובת אימייל לא תקינה" };
    }

    // The email is the login identity — it lives in Supabase Auth, not just the
    // profiles row. Update Auth first; if the address is taken, surface that and
    // don't touch the profile.
    if (email) {
      const admin = createAdminClient();
      const { error: authErr } = await admin.auth.admin.updateUserById(id, {
        email,
        email_confirm: true,
      });
      if (authErr) {
        const taken = /registered|already|exists|duplicate/i.test(authErr.message);
        return { ok: false, error: taken ? "כתובת האימייל כבר בשימוש" : authErr.message };
      }
    }

    const fields = { ...detailFields(formData), ...(email ? { email } : {}) };
    const { error } = await supabase.from("profiles").update(fields).eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/clients");
    revalidatePath(`/admin/clients/${id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Assign this client to the checked projects (and unassign projects
// that were theirs but are now unchecked).
export async function assignProjects(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    const { supabase } = await assertAdmin();
    const clientId = String(formData.get("client_id") ?? "");
    if (!clientId) return { ok: false, error: "מזהה לקוח חסר" };
    const checked = formData.getAll("project_ids").map(String);

    // Unassign projects currently this client's but not checked.
    const { data: current } = await supabase
      .from("projects")
      .select("id")
      .eq("client_id", clientId);
    const currentIds = ((current ?? []) as { id: string }[]).map((p) => p.id);
    const toUnassign = currentIds.filter((id) => !checked.includes(id));

    if (toUnassign.length) {
      await supabase.from("projects").update({ client_id: null }).in("id", toUnassign);
    }
    if (checked.length) {
      await supabase.from("projects").update({ client_id: clientId }).in("id", checked);
    }

    revalidatePath(`/admin/clients/${clientId}`);
    revalidatePath("/admin/projects");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Add a client as a member of an existing project (many-to-many).
export async function addProjectMember(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const profileId = String(formData.get("profile_id") ?? "");
    if (!projectId || !profileId) return { ok: false, error: "בחר/י לקוח" };
    const admin = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await admin
      .from("project_members")
      .upsert({ project_id: projectId, profile_id: profileId }, { onConflict: "project_id,profile_id" });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Remove a member from a project.
export async function removeProjectMember(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    await assertAdmin();
    const projectId = String(formData.get("project_id") ?? "");
    const profileId = String(formData.get("profile_id") ?? "");
    if (!projectId || !profileId) return { ok: false, error: "מידע חסר" };
    const admin = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await admin
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("profile_id", profileId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/admin/projects/${projectId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Permanently delete a client: detach their projects (kept, just
// unassigned) and remove the auth user + profile.
export async function deleteClient(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    const { userId } = await assertAdmin();
    const id = String(formData.get("id") ?? "");
    if (!id) return { ok: false, error: "מזהה לקוח חסר" };
    if (id === userId) return { ok: false, error: "אי אפשר למחוק את עצמך" };

    const admin = createAdminClient();
    // Keep the projects/work — just unassign so we don't orphan FK refs.
    await admin.from("projects").update({ client_id: null }).eq("client_id", id);
    // Remove project memberships (table may not exist yet — ignore errors).
    try {
      await (admin as unknown as { from: (t: string) => any }).from("project_members").delete().eq("profile_id", id);
    } catch {
      /* table absent */
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    // If the auth user was already gone, still clear the profile row.
    if (error && !/not.*found/i.test(error.message)) return { ok: false, error: error.message };
    await admin.from("profiles").delete().eq("id", id);

    revalidatePath("/admin/clients");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  // Redirect from the server (outside the try, so NEXT_REDIRECT isn't caught).
  // The detail page would otherwise re-render for the just-deleted client and
  // hit notFound() → a 404 flash even though the delete succeeded.
  redirect("/admin/clients");
}

// Send an initiated (free-form) email to a client, wrapped in the
// studio brand design. Merge tags ({first_name} etc.) are supported.
export async function sendClientEmail(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    const { supabase } = await assertAdmin();
    const clientId = String(formData.get("client_id") ?? "");
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    if (!clientId) return { ok: false, error: "מזהה לקוח חסר" };
    if (!subject || !message) return { ok: false, error: "נושא ותוכן נדרשים" };

    const db = supabase as unknown as { from: (t: string) => any };
    const { data: client } = await db
      .from("profiles")
      .select("email, name, first_name, last_name")
      .eq("id", clientId)
      .maybeSingle();
    if (!client?.email) return { ok: false, error: "ללקוח אין אימייל" };

    const { data: s } = await db.from("email_settings").select("*").eq("id", true).maybeSingle();
    const brand = {
      fromName: s?.from_name || DEFAULT_BRAND.fromName,
      fromEmail: s?.from_email || DEFAULT_BRAND.fromEmail,
      replyTo: s?.reply_to || DEFAULT_BRAND.replyTo,
      logoUrl: s?.logo_url || DEFAULT_BRAND.logoUrl,
      brandColor: s?.brand_color || DEFAULT_BRAND.brandColor,
    };

    const vars = {
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      full_name: client.name ?? "",
      client_name: client.name ?? "",
      site_url: "https://service.uriyaganor.com",
      portal_url: "https://service.uriyaganor.com/portal",
    };

    const blocks: EmailBlock[] = [
      { id: "m", type: "text", text: message.replace(/\n/g, "<br>"), align: "right", size: "15" },
    ];
    const html = substituteTags(renderEmailHtml({ blocks, brand }), vars);

    await sendEmail({
      to: client.email,
      subject: substituteTags(subject, vars),
      html,
      from: `${brand.fromName} <${brand.fromEmail}>`,
      replyTo: brand.replyTo || undefined,
      template: "custom",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Portal: a client updates their OWN details (service role, scoped to
// the caller's id; profiles RLS write is admin-only).
export async function updateMyProfile(
  _prev: Result,
  formData: FormData
): Promise<Result> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "לא מחובר" };

    const admin = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await admin.from("profiles").update(detailFields(formData)).eq("id", user.id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/portal");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
