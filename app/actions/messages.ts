"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dispatchEmail } from "@/lib/email/dispatch";
import { logMessage, replyAddress } from "@/lib/email/thread";

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

    const taskTitle = ticket?.title || "המשימה שלך";
    const fullName = (client.name || "").trim();
    const [firstName, ...rest] = fullName.split(/\s+/);

    // Render via the designable "התכתבות עם לקוח" template; the admin's
    // typed text is injected (as HTML) through the {message} merge tag.
    await dispatchEmail(
      "ticket_reply",
      client.email,
      {
        task_title: taskTitle,
        project_name: ticket?.projects?.name || "",
        full_name: fullName,
        first_name: firstName || fullName,
        last_name: rest.join(" "),
        client_name: fullName,
      },
      { message: message.replace(/\n/g, "<br>") },
      { replyTo: replyAddress(ticketId) }
    );

    // Log the outbound message with the raw text so the admin thread stays readable.
    await logMessage({
      ticketId,
      direction: "out",
      fromEmail: null,
      toEmail: client.email,
      subject: `בנוגע למשימה: ${taskTitle}`,
      bodyText: message,
    });

    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
