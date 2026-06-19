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
  ticket_reply: [
    { id: "ctx", type: "text", text: "<b>בנוגע למשימה:</b> {task_title}", align: "right", size: "14" },
    { id: "div", type: "divider", color: "#e5e7eb" },
    { id: "m", type: "text", text: "{message}", align: "right", size: "15" },
  ],
  client_reply_admin: [
    { id: "h", type: "heading", text: "תגובה חדשה מלקוח", level: "h3", align: "right" },
    { id: "ctx", type: "text", text: "<b>בנוגע למשימה:</b> {task_title}", align: "right", size: "14" },
    { id: "div", type: "divider", color: "#e5e7eb" },
    { id: "m", type: "text", text: "{message}", align: "right", size: "15" },
    { id: "b", type: "button", text: "פתח/י במערכת", href: "{task_url}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "15" },
  ],
  task_completed: [
    { id: "badge", type: "html", html: `<div style="text-align:center;margin-bottom:12px;"><span style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:#10b981;color:#ffffff;font-size:30px;font-weight:bold;text-align:center;">&#10003;</span></div>` },
    { id: "h", type: "heading", text: "המשימה הושלמה", level: "h2", align: "right" },
    { id: "t", type: "text", text: "היי {first_name}, המשימה <b>{task_title}</b> הושלמה.", align: "right", size: "15" },
    { id: "t2", type: "text", text: "זמן ביצוע: {task_time}<br>זמן שנותר בחבילה: {hours_remaining}", align: "right", size: "15" },
  ],
  hours_added: [
    { id: "h", type: "heading", text: "נוספו שעות לחבילה", level: "h2", align: "right" },
    { id: "t", type: "text", text: "היי {first_name}, נוספו {hours_added} לחבילת השירות שלך.", align: "right", size: "15" },
    { id: "t2", type: "text", text: "זמן שנותר בחבילה: {hours_remaining} מתוך {total_hours}.", align: "right", size: "15" },
  ],
  package_half: [
    { id: "h", type: "heading", text: "ניצלת 50% מהחבילה", level: "h2", align: "right" },
    { id: "t", type: "text", text: "היי {first_name}, ניצלת מחצית מחבילת השירות. נותרו {hours_remaining} מתוך {total_hours}.", align: "right", size: "15" },
    { id: "b", type: "button", text: "רכישת שעות נוספות", href: "{buy_url}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "15" },
  ],
  package_depleted: [
    { id: "h", type: "heading", text: "החבילה הסתיימה", level: "h2", align: "right" },
    { id: "t", type: "text", text: "היי {first_name}, ניצלת את כל השעות בחבילת השירות. להמשך עבודה יש לרכוש חבילה נוספת.", align: "right", size: "15" },
    { id: "s", type: "text", text: "{tasks_summary}", align: "right", size: "14" },
    { id: "b", type: "button", text: "רכישת חבילה", href: "{buy_url}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "15" },
  ],
  new_task_admin: [
    { id: "h", type: "heading", text: "פנייה חדשה מלקוח", level: "h3", align: "right" },
    { id: "t", type: "text", text: "<b>{client_name}</b> פתח/ה משימה חדשה בפרויקט {project_name}:", align: "right", size: "15" },
    { id: "ctx", type: "text", text: "<b>{task_title}</b><br>{task_description}", align: "right", size: "14" },
    { id: "b", type: "button", text: "פתח/י במערכת", href: "{task_url}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "15" },
  ],
};

const FALLBACK_SUBJECT: Record<EmailKey, string> = {
  welcome: "ברוכים הבאים",
  password_reset: "איפוס סיסמה",
  task_completed: "✓ המשימה הושלמה",
  package_half: "ניצלת 50% מהחבילה",
  package_depleted: "החבילה הסתיימה",
  hours_added: "נוספו שעות לחבילה",
  new_task_admin: "פנייה חדשה מלקוח",
  ticket_reply: "בנוגע למשימה: {task_title}",
  client_reply_admin: "תגובה חדשה מלקוח: {task_title}",
};

type Vars = Record<string, string | number | undefined>;

export async function dispatchEmail(
  key: EmailKey,
  to: string | string[],
  vars: Vars,
  rawVars: Record<string, string | undefined> = {},
  opts: { replyTo?: string; ticketId?: string } = {}
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
    // Brand fields are usable from any template via {logo_url}/{brand_color}.
    const allVars = { ...vars, logo_url: brand.logoUrl, brand_color: brand.brandColor };
    const subjectTemplate = tpl?.subject || FALLBACK_SUBJECT[key];
    const subject = substituteTags(subjectTemplate, allVars);
    const html = substituteTags(
      renderEmailHtml({ blocks, design: tpl?.design ?? undefined, brand }),
      allVars,
      rawVars
    );

    const { sendEmail } = await import("./send");
    await sendEmail({
      to: recipients,
      subject,
      html,
      from: `${brand.fromName} <${brand.fromEmail}>`,
      replyTo: opts.replyTo || brand.replyTo || undefined,
    });

    if (opts.ticketId) {
      const { logMessage } = await import("./thread");
      await logMessage({
        ticketId: opts.ticketId,
        direction: "out",
        fromEmail: brand.fromEmail,
        toEmail: recipients.join(", "),
        subject,
        bodyHtml: html,
      });
    }
    return { sent: true };
  } catch (e) {
    console.error(`dispatchEmail(${key}) failed:`, (e as Error).message);
    return { sent: false, reason: (e as Error).message };
  }
}
