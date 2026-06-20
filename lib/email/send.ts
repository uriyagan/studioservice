// Low-level email send via the Resend HTTP API. RESEND_API_KEY is a
// Cloudflare Worker secret (read from process.env, like the Supabase
// service-role key).

import { DEFAULT_BRAND } from "./types";

const RESEND_URL = "https://api.resend.com/emails";

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  // Resend fetches each `path` URL at send time and attaches it (no local
  // download/encoding needed on the Worker).
  attachments?: { filename: string; path: string }[];
}): Promise<{ id?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY חסר — לא ניתן לשלוח מייל");

  // Hard timeout so a slow/unreachable Resend never blocks the caller
  // (e.g. the new-task action would otherwise hang on "creating...").
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from ?? `${DEFAULT_BRAND.fromName} <${DEFAULT_BRAND.fromEmail}>`,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json().catch(() => ({}));
}
