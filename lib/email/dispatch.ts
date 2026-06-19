// High-level: load a template + brand settings, render to HTML,
// substitute merge tags, and send. Best-effort — never throws to the
// caller (a failed email must not break completing a task, etc.).

import { createAdminClient } from "@/lib/supabase/admin";
import { renderEmailHtml, substituteTags } from "./render";
import { DEFAULT_BRAND, EmailBlock, EmailKey } from "./types";

// Built-in fallback bodies used when an admin hasn't designed the
// template yet (so e.g. the welcome email still carries its link).
const DEFAULT_BLOCKS: Partial<Record<EmailKey, EmailBlock[]>> = {
  welcome: [
    { id: "h", type: "heading", text: "ברוכים הבאים, {first_name}!", level: "h2", align: "right" },
    { id: "t", type: "text", text: "נוצר עבורך חשבון בפורטל השירות. לחצו על הכפתור כדי לבחור סיסמה ולהתחבר.", align: "right", size: "15" },
    { id: "b", type: "button", text: "יצירת סיסמה", href: "{set_password_link}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "16" },
  ],
  password_reset: [
    { id: "h", type: "heading", text: "איפוס סיסמה", level: "h2", align: "right" },
    { id: "t", type: "text", text: "קיבלנו בקשה לאיפוס הסיסמה שלך. לחצו על הכפתור כדי לבחור סיסמה חדשה. אם לא ביקשת זאת, אפשר להתעלם מהמייל.", align: "right", size: "15" },
    { id: "b", type: "button", text: "איפוס סיסמה", href: "{reset_link}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "16" },
  ],
};

const FALLBACK_SUBJECT: Record<EmailKey, string> = {
  welcome: "ברוכים הבאים",
  password_reset: "איפוס סיסמה",
  task_completed: "המשימה הושלמה",
  package_half: "ניצלת 50% מהחבילה",
  package_depleted: "החבילה הסתיימה",
  hours_added: "נוספו שעות לחבילה",
  new_task_admin: "פנייה חדשה מלקוח",
};

type Vars = Record<string, string | number | undefined>;

export async function dispatchEmail(
  key: EmailKey,
  to: string | string[],
  vars: Vars,
  rawVars: Record<string, string | undefined> = {}
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (recipients.length === 0) return { sent: false, reason: "no recipients" };

    const db = createAdminClient() as unknown as {
      from: (t: string) => any;
    };

    const { data: tpl } = await db
      .from("email_templates")
      .select("*")
      .eq("template_key", key)
      .maybeSingle();

    if (tpl && tpl.enabled === false) return { sent: false, reason: "disabled" };

    const { data: settingsRow } = await db
      .from("email_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    const brand = {
      fromName: settingsRow?.from_name || DEFAULT_BRAND.fromName,
      fromEmail: settingsRow?.from_email || DEFAULT_BRAND.fromEmail,
      replyTo: settingsRow?.reply_to || DEFAULT_BRAND.replyTo,
      logoUrl: settingsRow?.logo_url || DEFAULT_BRAND.logoUrl,
      brandColor: settingsRow?.brand_color || DEFAULT_BRAND.brandColor,
    };

    const blocks =
      Array.isArray(tpl?.blocks) && tpl.blocks.length ? tpl.blocks : DEFAULT_BLOCKS[key] ?? [];
    const subjectTemplate = tpl?.subject || FALLBACK_SUBJECT[key];
    const subject = substituteTags(subjectTemplate, vars);
    const html = substituteTags(
      renderEmailHtml({ blocks, design: tpl?.design ?? undefined, brand }),
      vars,
      rawVars
    );

    const { sendEmail } = await import("./send");
    await sendEmail({
      to: recipients,
      subject,
      html,
      from: `${brand.fromName} <${brand.fromEmail}>`,
      replyTo: brand.replyTo || undefined,
    });
    return { sent: true };
  } catch (e) {
    console.error(`dispatchEmail(${key}) failed:`, (e as Error).message);
    return { sent: false, reason: (e as Error).message };
  }
}
