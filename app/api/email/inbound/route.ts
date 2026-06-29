import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanInboundReply, logMessage, reopenIfCompleted, replyAddress, ticketIdFromAddress } from "@/lib/email/thread";
import { dispatchEmail } from "@/lib/email/dispatch";

// Receives parsed inbound emails (Resend Inbound webhook). Matches the
// reply+<ticketId>@... recipient back to a task, stores the message,
// and pings the admins.
export async function POST(req: NextRequest) {
  // Shared-secret check (token in the webhook URL). Fail closed: if the
  // secret isn't configured, reject rather than accept forged inbound mail.
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (!expected || req.nextUrl.searchParams.get("token") !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }
  const data = body?.data ?? body ?? {};

  const toRaw = JSON.stringify(data.to ?? data.recipient ?? "");
  const ticketId = ticketIdFromAddress(toRaw);
  if (!ticketId) {
    // Not one of our reply addresses — accept & ignore.
    return NextResponse.json({ received: true, matched: false });
  }

  const extractEmail = (v: unknown): string => {
    if (!v) return "";
    if (typeof v === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = v as any;
      return o.email || o.address || "";
    }
    const s = String(v);
    const m = s.match(/<([^>]+)>/);
    return m ? m[1] : s;
  };

  const fromEmail = extractEmail(Array.isArray(data.from) ? data.from[0] : data.from);
  const subject = data.subject ?? null;

  // The email.received webhook carries metadata only — the body must be
  // fetched from the API with the inbound email's id.
  let text: string | null = data.text ?? data.plain ?? null;
  let html: string | null = data.html ?? null;
  const emailId = data.email_id ?? data.id ?? null;
  if (emailId && !text && !html) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (r.ok) {
        const full = await r.json();
        text = full.text ?? text;
        html = full.html ?? html;
      } else {
        console.error("fetch inbound email failed:", r.status, await r.text().catch(() => ""));
      }
    } catch (e) {
      console.error("fetch inbound email error:", (e as Error).message);
    }
  }

  // Fall back to a stripped-HTML plain text so the thread/notification has
  // readable content even when the client sent HTML only. Drop quoted-history
  // containers and convert block tags to newlines so cleanInboundReply can
  // still find the quote/footer boundaries (line-anchored).
  if (!text && html) {
    text =
      html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
        .replace(/<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][\s\S]*?<\/div>/gi, "")
        .replace(/<div[^>]*id=["'][^"']*(?:divRplyFwdMsg|appendonsend)[^"']*["'][\s\S]*$/gi, "")
        .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/[ \t]+/g, " ")
        .split("\n")
        .map((l) => l.trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null;
  }

  // Strip quoted original, app footers, and signature — keep just the reply.
  if (text) text = cleanInboundReply(text);
  // A genuine inbound reply whose body couldn't be recovered: store a clear
  // placeholder so it never renders as the outbound "designed message" label.
  if (!text) text = "(תגובת לקוח — לא ניתן לטעון את תוכן ההודעה)";

  try {
    await logMessage({
      ticketId,
      direction: "in",
      fromEmail,
      toEmail: replyAddress(ticketId),
      subject,
      bodyText: text,
      bodyHtml: html,
    });

    // A reply on a completed task means more work — pull it back to "פתוחות".
    await reopenIfCompleted(ticketId);

    // Notify admins there's a new reply, via the designable template.
    const db = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: admins } = await db.from("profiles").select("email").eq("role", "admin");
    const emails = ((admins ?? []) as { email: string | null }[]).map((a) => a.email).filter(Boolean) as string[];

    // Task context for the merge tags.
    const { data: ticket } = await db
      .from("tickets")
      .select("title, projects(name, client_id)")
      .eq("id", ticketId)
      .maybeSingle();
    const taskTitle = ticket?.title || subject || "המשימה";
    let clientName = fromEmail;
    if (ticket?.projects?.client_id) {
      const { data: c } = await db.from("profiles").select("name").eq("id", ticket.projects.client_id).maybeSingle();
      clientName = c?.name || fromEmail;
    }

    if (emails.length) {
      // Escape the client's text before turning newlines into <br> — it goes
      // into the email via the raw (unescaped) merge channel.
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const messageHtml = esc(text).replace(/\n/g, "<br>");
      await dispatchEmail(
        "client_reply_admin",
        emails,
        {
          task_title: taskTitle,
          project_name: ticket?.projects?.name || "",
          client_name: clientName,
          full_name: clientName,
          task_url: "https://service.uriyaganor.com/admin",
          site_url: "https://service.uriyaganor.com",
        },
        { message: messageHtml },
        { replyTo: replyAddress(ticketId) }
      );
    }
  } catch (e) {
    console.error("inbound processing failed:", (e as Error).message);
  }

  return NextResponse.json({ received: true, matched: true });
}
