import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logMessage, replyAddress, ticketIdFromAddress } from "@/lib/email/thread";
import { sendEmail } from "@/lib/email/send";
import { DEFAULT_BRAND } from "@/lib/email/types";

// Receives parsed inbound emails (Resend Inbound webhook). Matches the
// reply+<ticketId>@... recipient back to a task, stores the message,
// and pings the admins.
export async function POST(req: NextRequest) {
  // Shared-secret check (token in the webhook URL).
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (expected && req.nextUrl.searchParams.get("token") !== expected) {
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

    // Notify admins there's a new reply.
    const db = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: admins } = await db.from("profiles").select("email").eq("role", "admin");
    const emails = ((admins ?? []) as { email: string | null }[]).map((a) => a.email).filter(Boolean) as string[];
    if (emails.length) {
      await sendEmail({
        to: emails,
        subject: `תגובה חדשה מלקוח${subject ? `: ${subject}` : ""}`,
        from: `${DEFAULT_BRAND.fromName} <${DEFAULT_BRAND.fromEmail}>`,
        replyTo: replyAddress(ticketId),
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;">
          <p>התקבלה תגובה חדשה מלקוח.</p>
          ${text ? `<blockquote style="border-right:3px solid #ddd;padding-right:10px;color:#555;">${String(text).replace(/</g, "&lt;").replace(/\n/g, "<br>")}</blockquote>` : ""}
          <p><a href="https://service.uriyaganor.com/admin">פתח/י במערכת ←</a></p>
        </div>`,
      });
    }
  } catch (e) {
    console.error("inbound processing failed:", (e as Error).message);
  }

  return NextResponse.json({ received: true, matched: true });
}
