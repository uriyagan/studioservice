"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEmail } from "@/lib/email/dispatch";
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
  links: string[];
  attachments: { name: string; url: string }[];
}

// Enrich raw message rows with their parsed links + signed download URLs.
// Signing uses the service role so both sides can download every file in a
// conversation they're allowed to read (storage RLS would otherwise block
// downloading the other party's uploads).
async function enrichMessages(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[]
): Promise<ThreadMessage[]> {
  if (!rows.length) return [];
  const adb = createAdminClient() as unknown as {
    from: (t: string) => any;
    storage: { from: (b: string) => any };
  };
  const ids = rows.map((r) => r.id);
  const { data: atts } = await adb
    .from("attachments")
    .select("message_id, file_url, file_name")
    .in("message_id", ids);

  const byMsg: Record<string, { name: string; url: string }[]> = {};
  for (const a of (atts ?? []) as { message_id: string; file_url: string; file_name: string }[]) {
    const { data: signed } = await adb.storage
      .from("attachments")
      .createSignedUrl(a.file_url, 3600);
    (byMsg[a.message_id] ??= []).push({ name: a.file_name, url: signed?.signedUrl ?? "#" });
  }

  return rows.map((r) => ({
    id: r.id,
    direction: r.direction,
    from_email: r.from_email,
    to_email: r.to_email,
    subject: r.subject,
    body_text: r.body_text,
    body_html: r.body_html,
    created_at: r.created_at,
    links: String(r.links ?? "")
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean),
    attachments: byMsg[r.id] ?? [],
  }));
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
    return enrichMessages(data ?? []);
  } catch {
    return [];
  }
}

// Client-side: read the full conversation for one of MY tasks.
// RLS restricts the rows to tasks on the logged-in client's projects.
export async function getMyTicketMessages(ticketId: string): Promise<ThreadMessage[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const db = supabase as unknown as { from: (t: string) => any };
    const { data } = await db
      .from("messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    return enrichMessages(data ?? []);
  } catch {
    return [];
  }
}

// Admin: the files a client attached when submitting the task itself
// (message_id is null → not part of the email thread). Returns signed URLs.
export async function getTaskAttachments(
  ticketId: string
): Promise<{ name: string; url: string }[]> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: atts } = await adb
      .from("attachments")
      .select("file_url, file_name")
      .eq("ticket_id", ticketId)
      .is("message_id", null)
      .order("created_at", { ascending: true });

    const out: { name: string; url: string }[] = [];
    for (const a of (atts ?? []) as { file_url: string; file_name: string }[]) {
      const { data: signed } = await adb.storage
        .from("attachments")
        .createSignedUrl(a.file_url, 3600);
      out.push({ name: a.file_name, url: signed?.signedUrl ?? "#" });
    }
    return out;
  } catch {
    return [];
  }
}

// Record an uploaded file against a message. Verifies the caller may
// access the ticket (admin or owning client), then inserts via service role.
export async function recordMessageAttachment(input: {
  messageId: string;
  ticketId: string;
  path: string;
  fileName: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "לא מחובר" };
    const db = supabase as unknown as { from: (t: string) => any };

    const { data: prof } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (prof?.role !== "admin") {
      // Client: confirm they own the ticket.
      const { data: t } = await db
        .from("tickets")
        .select("projects(client_id)")
        .eq("id", input.ticketId)
        .maybeSingle();
      if (!t || t.projects?.client_id !== user.id) return { ok: false, error: "אין הרשאה" };
    }

    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb.from("attachments").insert({
      ticket_id: input.ticketId,
      message_id: input.messageId,
      file_url: input.path,
      file_name: input.fileName,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Client replies from the portal → logs the message (inbound) and emails
// the admins. Ownership is verified via RLS before writing.
export async function sendClientReply(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "לא מחובר" };

    const ticketId = String(formData.get("ticket_id") ?? "");
    const message = String(formData.get("message") ?? "").trim();
    const links = formData
      .getAll("link")
      .map((l) => String(l).trim())
      .filter(Boolean);
    const fileCount = Number(formData.get("file_count") ?? 0);
    if (!ticketId) return { ok: false, error: "מזהה משימה חסר" };
    if (!message && !links.length && !fileCount) return { ok: false, error: "יש להזין תוכן" };

    const db = supabase as unknown as { from: (t: string) => any };
    const { data: ticket } = await db
      .from("tickets")
      .select("title, projects(name, client_id)")
      .eq("id", ticketId)
      .maybeSingle();
    if (!ticket || ticket.projects?.client_id !== user.id) {
      return { ok: false, error: "אין הרשאה" };
    }

    const taskTitle = ticket.title || "המשימה שלי";
    const messageId = await logMessage({
      ticketId,
      direction: "in",
      fromEmail: user.email ?? null,
      toEmail: replyAddress(ticketId),
      subject: `בנוגע למשימה: ${taskTitle}`,
      bodyText: message,
      links: links.join("\n") || null,
    });

    // Notify admins by email.
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: admins } = await adb.from("profiles").select("email").eq("role", "admin");
    const emails = ((admins ?? []) as { email: string | null }[])
      .map((a) => a.email)
      .filter(Boolean) as string[];
    if (emails.length) {
      const linksHtml = links.length
        ? `<p>לינקים:<br>${links.map((l) => `<a href="${l.replace(/"/g, "")}">${l.replace(/</g, "&lt;")}</a>`).join("<br>")}</p>`
        : "";
      await sendEmail({
        to: emails,
        subject: `תגובה חדשה מלקוח: ${taskTitle}`,
        from: `${DEFAULT_BRAND.fromName} <${DEFAULT_BRAND.fromEmail}>`,
        replyTo: replyAddress(ticketId),
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;">
          <p><b>בנוגע למשימה:</b> ${taskTitle.replace(/</g, "&lt;")}</p>
          ${message ? `<blockquote style="border-right:3px solid #ddd;padding-right:10px;color:#555;">${message.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</blockquote>` : ""}
          ${linksHtml}
          <p><a href="https://service.uriyaganor.com/admin">פתח/י במערכת ←</a></p>
        </div>`,
      });
    }

    revalidatePath("/admin");
    revalidatePath("/portal");
    return { ok: true, messageId: messageId ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Admin replies in a task thread → emails the client (reply-to threads
// back into the task) and logs the outbound message.
export async function sendTicketReply(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  try {
    const supabase = await assertAdmin();
    const ticketId = String(formData.get("ticket_id") ?? "");
    const message = String(formData.get("message") ?? "").trim();
    const links = formData
      .getAll("link")
      .map((l) => String(l).trim())
      .filter(Boolean);
    const fileCount = Number(formData.get("file_count") ?? 0);
    if (!ticketId) return { ok: false, error: "מזהה משימה חסר" };
    if (!message && !links.length && !fileCount) return { ok: false, error: "יש להזין תוכן" };

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

    // Append any links to the message body that goes into the email template.
    const linksHtml = links.length
      ? `<br><br>לינקים:<br>${links.map((l) => `<a href="${l.replace(/"/g, "")}">${l.replace(/</g, "&lt;")}</a>`).join("<br>")}`
      : "";
    const messageHtml = message.replace(/\n/g, "<br>") + linksHtml;

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
      { message: messageHtml },
      { replyTo: replyAddress(ticketId) }
    );

    // Log the outbound message with the raw text so the admin thread stays readable.
    const messageId = await logMessage({
      ticketId,
      direction: "out",
      fromEmail: null,
      toEmail: client.email,
      subject: `בנוגע למשימה: ${taskTitle}`,
      bodyText: message,
      links: links.join("\n") || null,
    });

    revalidatePath("/admin");
    return { ok: true, messageId: messageId ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
