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

// Strip the noise from an inbound email reply (quoted original, app footers
// like "Sent with Spark", and the trailing signature block) so only the new
// message text remains.
export function cleanInboundReply(raw: string): string {
  if (!raw) return raw;
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");

  // 1) Cut from the first quoted-original / app-footer / signature-delimiter line.
  const isBoundary = (l: string): boolean => {
    const t = l.trim();
    if (!t) return false;
    if (t.startsWith(">")) return true;
    if (/^-{2,}$/.test(t) || /^_{5,}/.test(t)) return true; // "--" sig / "____"
    if (/^On\b.*\bwrote:?\s*$/i.test(t)) return true; // "On <date> ... wrote:"
    if (/^-{2,}\s*Original Message/i.test(t)) return true;
    if (/^From:\s/i.test(t) && l.includes("@")) return true; // forwarded header
    if (/^בתאריך\b/.test(t)) return true; // Hebrew quote header
    if (/כתב(ה)?\s*:?\s*$/.test(t) && /\d/.test(t)) return true;
    if (/^Sent (with|from|via)\b/i.test(t)) return true; // Spark / "Sent from my iPhone"
    if (/^Get Outlook for\b/i.test(t)) return true;
    return false;
  };
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (isBoundary(lines[i])) {
      cut = i;
      break;
    }
  }
  const kept = lines.slice(0, cut);

  // 2) Strip a trailing signature block (contact-info lines + the name above).
  const isSig = (l: string): boolean => {
    const t = l.trim();
    if (!t) return false;
    if (/\|/.test(t)) return true; // brand pipe line
    if (/https?:\/\//i.test(t)) return true;
    if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t)) return true; // email
    if (/\+?\d[\d().\s-]{6,}\d/.test(t)) return true; // phone
    if (/\b(Founder|CEO|CTO|COO|Manager|Director|Ltd|Inc|LLC)\b/i.test(t)) return true;
    if (/(מנכ.?ל|מייסד|מנהל|בע.?מ)/.test(t)) return true;
    return false;
  };
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  let removedSig = false;
  while (kept.length && isSig(kept[kept.length - 1])) {
    kept.pop();
    removedSig = true;
  }
  if (removedSig) {
    while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
    const last = (kept[kept.length - 1] || "").trim();
    // A lone short line just above the signature is likely the sender's name.
    if (kept.length > 1 && last && last.split(/\s+/).length <= 3 && !/[.!?,:;]$/.test(last)) {
      kept.pop();
    }
  }

  const result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result || raw.trim();
}

// Resolve who should receive correspondence about a task. The person who
// opened the task (tickets.created_by — typically a project member) takes
// priority over the project's primary billing client (projects.client_id).
// Falls back to the owner for older tasks (no created_by), admin-created
// tasks (admin creator), or a creator without an email.
export async function taskRecipient(ticketId: string): Promise<{
  id: string;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as unknown as { from: (t: string) => any };

  let res = await db
    .from("tickets")
    .select("created_by, projects(client_id)")
    .eq("id", ticketId)
    .maybeSingle();
  if (res.error) {
    // created_by column not present yet — fall back to the owner only.
    res = await db.from("tickets").select("projects(client_id)").eq("id", ticketId).maybeSingle();
  }
  const ticket = res.data as
    | { created_by?: string | null; projects?: { client_id: string | null } | null }
    | null;
  if (!ticket) return null;

  const ownerId = ticket.projects?.client_id ?? null;
  const creatorId = ticket.created_by ?? null;

  // Try the creator first, then the owner. The creator only wins if they're a
  // client with an email (an admin creator stays on the project owner).
  const candidates = [...new Set([creatorId, ownerId].filter(Boolean) as string[])];
  for (const id of candidates) {
    const { data: p } = await db
      .from("profiles")
      .select("id, email, name, first_name, last_name, role")
      .eq("id", id)
      .maybeSingle();
    if (p?.email && (id === ownerId || p.role === "client")) {
      return {
        id: p.id,
        email: p.email,
        name: p.name ?? null,
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
      };
    }
  }
  return null;
}

// A client added something new to a *completed* task → there's more work to do.
// Flip it back to "pending" (the default open state) and clear completed_at so
// it returns to the "פתוחות" tab. No-op for tasks that aren't completed.
// Service role: clients have no update rights on tickets. Best-effort.
export async function reopenIfCompleted(ticketId: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as unknown as { from: (t: string) => any };
    await db
      .from("tickets")
      .update({ status: "pending", completed_at: null })
      .eq("id", ticketId)
      .eq("status", "completed");
  } catch (e) {
    console.error("reopenIfCompleted failed:", (e as Error).message);
  }
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
