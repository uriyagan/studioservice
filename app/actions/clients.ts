"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmailHtml, substituteTags } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { dispatchEmail } from "@/lib/email/dispatch";
import { DEFAULT_BRAND, EmailBlock } from "@/lib/email/types";

const SITE = "https://service.uriyaganor.com";

type Result = { ok: boolean; error?: string };

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
    // respects the "welcome" template's enabled toggle).
    try {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${SITE}/set-password` },
      });
      const setLink = linkData?.properties?.action_link ?? `${SITE}/login`;
      await dispatchEmail("welcome", email, {
        first_name: fields.first_name ?? "",
        last_name: fields.last_name ?? "",
        full_name: fields.name ?? "",
        client_name: fields.name ?? "",
        email,
        set_password_link: setLink,
        login_url: `${SITE}/login`,
        portal_url: `${SITE}/portal`,
        site_url: SITE,
      });
    } catch {
      /* non-fatal: client is created even if the email fails */
    }

    revalidatePath("/admin/clients");
    revalidatePath("/admin/projects");
    return { ok: true };
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

    const { error } = await supabase.from("profiles").update(detailFields(formData)).eq("id", id);
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
