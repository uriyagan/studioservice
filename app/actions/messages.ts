"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { renderEmailHtml } from "@/lib/email/render";
import { sendEmail } from "@/lib/email/send";
import { logMessage, replyAddress } from "@/lib/email/thread";
import { DEFAULT_BRAND } from "@/lib/email/types";

export interface ThreadMessage {
  id: string;
  direction: "in" | "out";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  created_at: string;
}

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (p?.role !== "admin") throw new Error("אין הרשאה");
  return supabase;
}

export async function getTicketMessages(ticketId: string): Promise<ThreadMessage[]> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const { data } = await db
      .from("messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    return (data ?? []) as ThreadMessage[];
  } catch {
    return [];
  }
}

// Admin replies in a task thread → emails the client (reply-to threads
// back into the task) and logs the outbound message.
export async function sendTicketReply(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await assertAdmin();
    const ticketId = String(formData.get("ticket_id") ?? "");
    const message = String(formData.get("message") ?? "").trim();
    if (!ticketId) return { ok: false, error: "מזהה משימה חסר" };
    if (!message) return { ok: false, error: "יש להזין תוכן" };

    const db = supabase as unknown as { from: (t: string) => any };
    const { data: ticket } = await db
      .from("tickets")
      .select("title, project_id, projects(name, client_id)")
      .eq("id", ticketId)
      .maybeSingle();
    const clientId = ticket?.projects?.client_id;
    if (!clientId) return { ok: false, error: "למשימה זו אין לקוח משויך" };

    const { data: client } = await db
      .from("profiles")
      .select("email, name")
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

    const subject = `Re: ${ticket?.title || "המשימה שלך"}`;
    const html = renderEmailHtml({
      blocks: [{ id: "m", type: "text", text: message.replace(/\n/g, "<br>"), align: "right", size: "15" }],
      brand,
    });

    await sendEmail({
      to: client.email,
      subject,
      html,
      from: `${brand.fromName} <${brand.fromEmail}>`,
      replyTo: replyAddress(ticketId),
    });

    await logMessage({
      ticketId,
      direction: "out",
      fromEmail: brand.fromEmail,
      toEmail: client.email,
      subject,
      bodyText: message,
      bodyHtml: html,
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
