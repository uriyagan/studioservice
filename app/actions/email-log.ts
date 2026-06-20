"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_LOG_PAGE, type EmailLogRow } from "@/lib/email-log-shared";

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

// Paginated + searchable read of the email log.
export async function getEmailLog(opts: {
  offset?: number;
  query?: string;
}): Promise<EmailLogRow[]> {
  try {
    const supabase = await assertAdmin();
    const db = supabase as unknown as { from: (t: string) => any };
    const offset = opts.offset ?? 0;
    let q = db
      .from("email_log")
      .select("id, to_email, subject, template, status, created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + EMAIL_LOG_PAGE - 1);
    const search = (opts.query ?? "").trim();
    if (search) q = q.or(`to_email.ilike.%${search}%,subject.ilike.%${search}%`);
    const { data } = await q;
    return (data ?? []) as EmailLogRow[];
  } catch {
    return [];
  }
}

// One-time import of historical sends from Resend's API into the log.
export async function backfillEmailLog(): Promise<{ ok: boolean; imported?: number; error?: string }> {
  try {
    await assertAdmin();
    const key = process.env.RESEND_API_KEY;
    if (!key) return { ok: false, error: "RESEND_API_KEY חסר" };
    const adb = createAdminClient() as unknown as { from: (t: string) => any };

    // The Resend account is shared across projects — only import emails this app
    // actually sent (matched by its own sending domain), never other projects'.
    const { DEFAULT_BRAND } = await import("@/lib/email/types");
    const { data: settings } = await adb
      .from("email_settings")
      .select("from_email")
      .eq("id", true)
      .maybeSingle();
    const fromEmail: string = settings?.from_email || DEFAULT_BRAND.fromEmail;
    const ownDomain = fromEmail.includes("@") ? fromEmail.split("@")[1] : fromEmail;

    let imported = 0;
    let after: string | undefined;
    let hasMore = true;
    // `after` paginates toward OLDER emails; stop on has_more=false. Cap pages
    // so a huge history can't run away (20 × 100 = 2000 emails).
    for (let page = 0; page < 20 && hasMore; page++) {
      const url = new URL("https://api.resend.com/emails");
      url.searchParams.set("limit", "100");
      if (after) url.searchParams.set("after", after);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${await r.text().catch(() => "")}` };
      const j = (await r.json().catch(() => ({}))) as {
        has_more?: boolean;
        data?: { id: string; from?: string; to?: string[] | string; subject?: string; created_at?: string; last_event?: string }[];
      };
      const data = j.data ?? [];
      if (!data.length) break;

      // Keep only this app's emails (shared Resend account).
      const own = data.filter((e) => (e.from ?? "").includes(ownDomain));
      const rows = own.map((e) => ({
        resend_id: e.id,
        to_email: Array.isArray(e.to) ? e.to[0] ?? "" : e.to ?? "",
        subject: e.subject ?? null,
        template: null,
        status: e.last_event ?? "sent",
        created_at: e.created_at ?? new Date().toISOString(),
      }));
      if (rows.length) {
        const { error } = await adb.from("email_log").upsert(rows, { onConflict: "resend_id" });
        if (error) return { ok: false, error: error.message };
        imported += rows.length;
      }

      after = data[data.length - 1].id; // paginate over the full page
      hasMore = !!j.has_more;
    }
    return { ok: true, imported };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
