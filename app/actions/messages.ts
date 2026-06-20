"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchEmail } from "@/lib/email/dispatch";
import { logMessage, replyAddress } from "@/lib/email/thread";

// Append the download flag so the signed URL serves the file as an attachment
// (forces a download) with its original name, instead of opening in the tab.
const withDownload = (url: string, name: string) =>
  url && url !== "#"
    ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`
    : url;

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

  const attRows = (atts ?? []) as { message_id: string; file_url: string; file_name: string }[];
  // Sign all download URLs in one batch instead of one round-trip each.
  const urlByPath: Record<string, string> = {};
  if (attRows.length) {
    const { data: signed } = await adb.storage
      .from("attachments")
      .createSignedUrls(attRows.map((a) => a.file_url), 3600);
    for (const s of (signed ?? []) as { path: string | null; signedUrl: string }[]) {
      if (s.path) urlByPath[s.path] = s.signedUrl;
    }
  }
  const byMsg: Record<string, { name: string; url: string }[]> = {};
  for (const a of attRows) {
    (byMsg[a.message_id] ??= []).push({ name: a.file_name, url: withDownload(urlByPath[a.file_url] ?? "#", a.file_name) });
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

    const attRows = (atts ?? []) as { file_url: string; file_name: string }[];
    if (!attRows.length) return [];
    const { data: signed } = await adb.storage
      .from("attachments")
      .createSignedUrls(attRows.map((a) => a.file_url), 3600);
    const urlByPath: Record<string, string> = {};
    for (const s of (signed ?? []) as { path: string | null; signedUrl: string }[]) {
      if (s.path) urlByPath[s.path] = s.signedUrl;
    }
    return attRows.map((a) => ({ name: a.file_name, url: withDownload(urlByPath[a.file_url] ?? "#", a.file_name) }));
  } catch {
    return [];
  }
}

// Client: the files I attached when creating one of MY tasks. Ownership is
// verified before signing (RLS-scoped read of the ticket).
export async function getMyTaskAttachments(
  ticketId: string
): Promise<{ name: string; url: string }[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const db = supabase as unknown as { from: (t: string) => any };
    const { data: t } = await db
      .from("tickets")
      .select("projects(client_id)")
      .eq("id", ticketId)
      .maybeSingle();
    if (!t || t.projects?.client_id !== user.id) return [];

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
    const attRows = (atts ?? []) as { file_url: string; file_name: string }[];
    if (!attRows.length) return [];
    const { data: signed } = await adb.storage
      .from("attachments")
      .createSignedUrls(attRows.map((a) => a.file_url), 3600);
    const urlByPath: Record<string, string> = {};
    for (const s of (signed ?? []) as { path: string | null; signedUrl: string }[]) {
      if (s.path) urlByPath[s.path] = s.signedUrl;
    }
    return attRows.map((a) => ({ name: a.file_name, url: withDownload(urlByPath[a.file_url] ?? "#", a.file_name) }));
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
    let { error } = await adb.from("attachments").insert({
      ticket_id: input.ticketId,
      message_id: input.messageId,
      file_url: input.path,
      file_name: input.fileName,
    });
    // Fall back to a ticket-level attachment if the message_id column
    // hasn't been added yet (migration not run).
    if (error) {
      ({ error } = await adb.from("attachments").insert({
        ticket_id: input.ticketId,
        file_url: input.path,
        file_name: input.fileName,
      }));
    }
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Server-backed read state per admin (cross-device). Falls back silently to {}
// if the message_reads table isn't migrated yet — callers keep their
// localStorage cache, so unread tracking still works before the migration.
export async function getReadState(): Promise<Record<string, number>> {
  try {
    const supabase = await assertAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const db = supabase as unknown as { from: (t: string) => any };
    const { data, error } = await db
      .from("message_reads")
      .select("ticket_id, read_at")
      .eq("admin_id", user!.id);
    if (error) return {};
    const map: Record<string, number> = {};
    for (const r of (data ?? []) as { ticket_id: string; read_at: string }[]) {
      map[r.ticket_id] = new Date(r.read_at).getTime();
    }
    return map;
  } catch {
    return {};
  }
}

export async function markTicketRead(ticketId: string): Promise<void> {
  try {
    const supabase = await assertAdmin();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const db = supabase as unknown as { from: (t: string) => any };
    await db
      .from("message_reads")
      .upsert(
        { admin_id: user!.id, ticket_id: ticketId, read_at: new Date().toISOString() },
        { onConflict: "admin_id,ticket_id" }
      );
  } catch {
    /* table not migrated yet — localStorage cache covers it */
  }
}

export interface Conversation {
  ticketId: string;
  taskTitle: string;
  clientName: string;
  projectName: string;
  preview: string;
  lastMessageAt: string;
  lastDirection: "in" | "out";
  lastInboundAt: string | null;
}

// Admin: one row per ticket that has any messages — the centralized inbox.
// Latest message wins as the preview; lastInboundAt drives the unread dot.
// MVP groups in JS (fine at current volume); swap for a SQL view at scale.
export async function getConversations(): Promise<Conversation[]> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };

    const { data: msgs } = await adb
      .from("messages")
      .select("ticket_id, direction, body_text, links, created_at")
      .order("created_at", { ascending: false });
    const rows = (msgs ?? []) as {
      ticket_id: string;
      direction: "in" | "out";
      body_text: string | null;
      links: string | null;
      created_at: string;
    }[];
    if (!rows.length) return [];

    // Group by ticket: first seen (rows are newest-first) is the latest message.
    const byTicket = new Map<
      string,
      { last: (typeof rows)[number]; lastInboundAt: string | null }
    >();
    for (const r of rows) {
      const cur = byTicket.get(r.ticket_id);
      if (!cur) {
        byTicket.set(r.ticket_id, {
          last: r,
          lastInboundAt: r.direction === "in" ? r.created_at : null,
        });
      } else if (!cur.lastInboundAt && r.direction === "in") {
        cur.lastInboundAt = r.created_at;
      }
    }

    const ticketIds = [...byTicket.keys()];
    const { data: tickets } = await adb
      .from("tickets")
      .select("id, title, projects(name, client_id)")
      .in("id", ticketIds);
    const tById = new Map(
      ((tickets ?? []) as {
        id: string;
        title: string | null;
        projects: { name: string | null; client_id: string | null } | null;
      }[]).map((t) => [t.id, t])
    );

    const clientIds = [
      ...new Set(
        [...tById.values()].map((t) => t.projects?.client_id).filter(Boolean) as string[]
      ),
    ];
    const { data: clients } = clientIds.length
      ? await adb.from("profiles").select("id, name, email").in("id", clientIds)
      : { data: [] };
    const cById = new Map(
      ((clients ?? []) as { id: string; name: string | null; email: string | null }[]).map(
        (c) => [c.id, c]
      )
    );

    const preview = (m: (typeof rows)[number]) => {
      const t = (m.body_text ?? "").trim();
      if (t) return t;
      if ((m.links ?? "").trim()) return "🔗 לינק";
      return "📎 הודעה";
    };

    const list: Conversation[] = ticketIds.map((id) => {
      const g = byTicket.get(id)!;
      const t = tById.get(id);
      const c = t?.projects?.client_id ? cById.get(t.projects.client_id) : null;
      return {
        ticketId: id,
        taskTitle: t?.title || "ללא שם",
        clientName: c?.name || c?.email || "—",
        projectName: t?.projects?.name || "",
        preview: preview(g.last),
        lastMessageAt: g.last.created_at,
        lastDirection: g.last.direction,
        lastInboundAt: g.lastInboundAt,
      };
    });

    list.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
    return list;
  } catch {
    return [];
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

    // Notify admins via the designable "תגובה מלקוח (למנהלים)" template.
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: admins } = await adb.from("profiles").select("email").eq("role", "admin");
    const emails = ((admins ?? []) as { email: string | null }[])
      .map((a) => a.email)
      .filter(Boolean) as string[];
    if (emails.length) {
      const { data: me } = await adb.from("profiles").select("name").eq("id", user.id).maybeSingle();
      const clientName = (me?.name as string) || user.email || "";
      const linksHtml = links.length
        ? `<br><br>לינקים:<br>${links.map((l) => `<a href="${l.replace(/"/g, "")}">${l.replace(/</g, "&lt;")}</a>`).join("<br>")}`
        : "";
      const messageHtml = (message ? message.replace(/\n/g, "<br>") : "") + linksHtml;
      const { runAfter } = await import("@/lib/after");
      await runAfter(() =>
        dispatchEmail(
          "client_reply_admin",
          emails,
          {
            task_title: taskTitle,
            project_name: ticket.projects?.name || "",
            client_name: clientName,
            full_name: clientName,
            task_url: "https://service.uriyaganor.com/admin",
            site_url: "https://service.uriyaganor.com",
          },
          { message: messageHtml },
          { replyTo: replyAddress(ticketId) }
        )
      );
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

    // Attach the actual files to the email (Resend fetches each signed URL at
    // send time). Stay under Resend's ~40MB email cap; anything over the budget
    // falls back to the "available in the portal" note.
    const filePaths = formData.getAll("file_path").map(String);
    const fileNames = formData.getAll("file_name").map(String);
    const fileSizes = formData.getAll("file_size").map((s) => Number(s) || 0);
    const ATTACH_BUDGET = 25 * 1024 * 1024;
    const toAttach: { path: string; name: string }[] = [];
    const overflow: string[] = [];
    let budget = 0;
    for (let i = 0; i < filePaths.length; i++) {
      if (filePaths[i] && budget + fileSizes[i] <= ATTACH_BUDGET) {
        toAttach.push({ path: filePaths[i], name: fileNames[i] || "קובץ" });
        budget += fileSizes[i];
      } else if (filePaths[i]) {
        overflow.push(fileNames[i] || "קובץ");
      }
    }

    let attachments: { filename: string; path: string }[] | undefined;
    if (toAttach.length) {
      const adb = createAdminClient() as unknown as {
        storage: { from: (b: string) => any };
      };
      const { data: signed } = await adb.storage
        .from("attachments")
        .createSignedUrls(toAttach.map((a) => a.path), 3600);
      attachments = ((signed ?? []) as { signedUrl: string | null }[])
        .map((s, idx) => ({ filename: toAttach[idx].name, path: s.signedUrl ?? "" }))
        .filter((a) => a.path);
    }

    // Only mention files in the body that couldn't be attached (too large), or
    // fall back to the generic portal note if we didn't get file refs at all.
    const filesHtml = overflow.length
      ? `<br><br>📎 ${overflow.length} קבצים גדולים זמינים לצפייה והורדה בפורטל השירות.`
      : !filePaths.length && fileCount
        ? `<br><br>📎 צורפו ${fileCount} קבצים — זמינים לצפייה והורדה בפורטל השירות.`
        : "";
    const messageHtml = message.replace(/\n/g, "<br>") + linksHtml + filesHtml;

    // Log the outbound message FIRST so the returned messageId is reliable
    // (file attachments depend on it) and a logging failure doesn't happen
    // after the email already left.
    const messageId = await logMessage({
      ticketId,
      direction: "out",
      fromEmail: null,
      toEmail: client.email,
      subject: `בנוגע למשימה: ${taskTitle}`,
      bodyText: message,
      links: links.join("\n") || null,
    });

    // Render via the designable "התכתבות עם לקוח" template; the admin's
    // typed text is injected (as HTML) through the {message} merge tag.
    // Sent in the background so the reply UI returns immediately.
    const clientEmail = client.email;
    const { runAfter } = await import("@/lib/after");
    await runAfter(() =>
      dispatchEmail(
        "ticket_reply",
        clientEmail,
        {
          task_title: taskTitle,
          project_name: ticket?.projects?.name || "",
          full_name: fullName,
          first_name: firstName || fullName,
          last_name: rest.join(" "),
          client_name: fullName,
        },
        { message: messageHtml },
        { replyTo: replyAddress(ticketId), attachments }
      )
    );

    revalidatePath("/admin");
    return { ok: true, messageId: messageId ?? undefined };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
