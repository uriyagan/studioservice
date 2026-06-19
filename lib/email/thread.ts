// Per-task email thread helpers. Replies use a unique address
// reply+<ticketId>@service.uriyaganor.com so inbound mail can be
// matched back to the task.

import { createAdminClient } from "@/lib/supabase/admin";

export const INBOUND_DOMAIN = "service.uriyaganor.com";

export function replyAddress(ticketId: string): string {
  return `reply+${ticketId}@${INBOUND_DOMAIN}`;
}

// Pull the ticket id out of a reply+<id>@... recipient address.
export function ticketIdFromAddress(to: string): string | null {
  const m = String(to || "").match(/reply\+([0-9a-fA-F-]{36})@/);
  return m ? m[1] : null;
}

export async function logMessage(msg: {
  ticketId: string;
  direction: "in" | "out";
  fromEmail?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  links?: string | null;
}): Promise<string | null> {
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => any };
    const base = {
      ticket_id: msg.ticketId,
      direction: msg.direction,
      from_email: msg.fromEmail ?? null,
      to_email: msg.toEmail ?? null,
      subject: msg.subject ?? null,
      body_text: msg.bodyText ?? null,
      body_html: msg.bodyHtml ?? null,
    };
    // Include `links` only when present; retry without it if the column
    // hasn't been added yet (migration not run) so sends never hard-fail.
    const payload = msg.links != null ? { ...base, links: msg.links } : base;
    let res = await db.from("messages").insert(payload).select("id").single();
    if (res.error && msg.links != null) {
      res = await db.from("messages").insert(base).select("id").single();
    }
    return res.data?.id ?? null;
  } catch (e) {
    console.error("logMessage failed:", (e as Error).message);
    return null;
  }
}
