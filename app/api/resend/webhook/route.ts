import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Resend event type → our status.
const STATUS_BY_TYPE: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
};

// Priority so an out-of-order event never regresses a row (e.g. a late "sent"
// after "delivered").
const PRIORITY: Record<string, number> = {
  failed: 0,
  sent: 1,
  delayed: 2,
  delivered: 3,
  opened: 4,
  clicked: 5,
  complained: 6,
  bounced: 7,
};

// Verify the Svix signature Resend sends (skipped if no secret configured).
async function verifySvix(secret: string, headers: Headers, body: string): Promise<boolean> {
  try {
    const id = headers.get("svix-id");
    const ts = headers.get("svix-timestamp");
    const sigHeader = headers.get("svix-signature");
    if (!id || !ts || !sigHeader) return false;
    const secretBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", secretBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
    return sigHeader.split(" ").some((p) => p.split(",")[1] === expected);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !(await verifySvix(secret, req.headers, body))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }

  const status = event.type ? STATUS_BY_TYPE[event.type] : undefined;
  const emailId = event.data?.email_id;
  // "sent" is already logged at send time; ignore unknown events.
  if (!status || status === "sent" || !emailId) return NextResponse.json({ ok: true });

  try {
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: row } = await adb
      .from("email_log")
      .select("status")
      .eq("resend_id", emailId)
      .maybeSingle();
    if (row && (PRIORITY[status] ?? 1) >= (PRIORITY[row.status] ?? 1)) {
      await adb.from("email_log").update({ status }).eq("resend_id", emailId);
    }
  } catch {
    /* ignore */
  }
  return NextResponse.json({ ok: true });
}
