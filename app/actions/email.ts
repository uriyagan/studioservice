"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { renderEmailHtml, renderTasksSummary, substituteTags } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import {
  BrandSettings,
  DEFAULT_BRAND,
  EmailBlock,
  EmailDesign,
  EmailKey,
} from "@/lib/email/types";

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

type Result = { ok: boolean; error?: string };

// Sample values so merge tags render to something in test emails.
const SAMPLE_VARS: Record<string, string> = {
  first_name: "ישראל",
  last_name: "ישראלי",
  full_name: "ישראל ישראלי",
  client_name: "ישראל ישראלי",
  project_name: "פרויקט לדוגמה",
  portal_url: "https://service.uriyaganor.com/portal",
  site_url: "https://service.uriyaganor.com",
  email: "client@example.com",
  login_url: "https://service.uriyaganor.com/login",
  reset_link: "https://service.uriyaganor.com/reset",
  task_title: "עיצוב באנר לקמפיין",
  task_description: "הכנת באנר ראשי לעמוד הבית",
  task_url: "https://service.uriyaganor.com/admin",
  hours_used: "5",
  hours_remaining: "5",
  total_hours: "10",
  hours_added: "5",
  buy_url: "https://service.uriyaganor.com/portal",
};

export async function saveEmailTemplate(input: {
  key: EmailKey;
  subject: string;
  blocks: EmailBlock[];
  design: EmailDesign;
  enabled: boolean;
}): Promise<Result> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("email_templates").upsert(
      {
        template_key: input.key,
        subject: input.subject,
        blocks: input.blocks,
        design: input.design,
        enabled: input.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "template_key" }
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/emails");
    revalidatePath("/admin/emails/builder");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setEmailEnabled(
  key: EmailKey,
  enabled: boolean
): Promise<Result> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("email_templates").upsert(
      { template_key: key, enabled, updated_at: new Date().toISOString() },
      { onConflict: "template_key" }
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function saveBrandSettings(input: BrandSettings): Promise<Result> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("email_settings").upsert(
      {
        id: true,
        from_name: input.fromName,
        from_email: input.fromEmail,
        reply_to: input.replyTo,
        logo_url: input.logoUrl,
        brand_color: input.brandColor,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/admin/emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Render the *current* (possibly unsaved) builder content and send a
// test to the logged-in admin, with sample merge-tag values.
export async function sendTestEmail(input: {
  subject: string;
  blocks: EmailBlock[];
  design: EmailDesign;
}): Promise<Result> {
  try {
    const supabase = await assertAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const to = user?.email;
    if (!to) return { ok: false, error: "לא נמצא אימייל למשתמש המחובר" };
    const db = supabase as unknown as { from: (t: string) => any };
    const { data: s } = await db
      .from("email_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    const brand: BrandSettings = {
      fromName: s?.from_name || DEFAULT_BRAND.fromName,
      fromEmail: s?.from_email || DEFAULT_BRAND.fromEmail,
      replyTo: s?.reply_to || DEFAULT_BRAND.replyTo,
      logoUrl: s?.logo_url || DEFAULT_BRAND.logoUrl,
      brandColor: s?.brand_color || DEFAULT_BRAND.brandColor,
    };

    const rawVars = {
      tasks_summary: renderTasksSummary([
        { title: "עיצוב באנר לקמפיין", seconds: 5400 },
        { title: "תיקוני אתר", seconds: 3600 },
        { title: "פגישת אפיון", seconds: 1800 },
      ]),
    };
    const subject = substituteTags(input.subject || "בדיקה", SAMPLE_VARS);
    const html = substituteTags(
      renderEmailHtml({ blocks: input.blocks, design: input.design, brand }),
      SAMPLE_VARS,
      rawVars
    );

    await sendEmail({
      to,
      subject: `[בדיקה] ${subject}`,
      html,
      from: `${brand.fromName} <${brand.fromEmail}>`,
      replyTo: brand.replyTo || undefined,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
