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
}): Promise<{ id?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY חסר — לא ניתן לשלוח מייל");

  const res = await fetch(RESEND_URL, {
    method: "POST",
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
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json().catch(() => ({}));
}
