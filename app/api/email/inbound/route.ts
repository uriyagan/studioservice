import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMessage, replyAddress, ticketIdFromAddress } from "@/lib/email/thread";
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
  const text = data.text ?? data.plain ?? null;
  const html = data.html ?? null;

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
      const messageHtml = text ? String(text).replace(/\n/g, "<br>") : "(ללא טקסט)";
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
