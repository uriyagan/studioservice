import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BrandSettingsForm } from "@/components/email-builder/BrandSettingsForm";
import { DEFAULT_BRAND, EMAIL_DEFS } from "@/lib/email/types";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface EmailLogRow {
  id: string;
  to_email: string;
  subject: string | null;
  template: string | null;
  status: string;
  created_at: string;
}

export default async function EmailsPage() {
  const supabase = await createClient();
  const db = supabase as unknown as { from: (t: string) => any };

  const [{ data: templates }, { data: settings }, { data: logRows }] = await Promise.all([
    db.from("email_templates").select("template_key, enabled"),
    db.from("email_settings").select("*").eq("id", true).maybeSingle(),
    db.from("email_log").select("id, to_email, subject, template, status, created_at").order("created_at", { ascending: false }).limit(200),
  ]);

  const log = (logRows ?? []) as EmailLogRow[];
  const titleByKey = new Map<string, string>(EMAIL_DEFS.map((d) => [d.key, d.title]));
  const templateLabel = (t: string | null) =>
    !t ? "—" : t === "custom" ? "מייל ידני" : t === "test" ? "בדיקה" : titleByKey.get(t) ?? t;

  const enabledMap = new Map<string, boolean>(
    (templates ?? []).map((t: { template_key: string; enabled: boolean }) => [t.template_key, t.enabled])
  );

  const brand = {
    fromName: settings?.from_name || DEFAULT_BRAND.fromName,
    fromEmail: settings?.from_email || DEFAULT_BRAND.fromEmail,
    replyTo: settings?.reply_to || DEFAULT_BRAND.replyTo,
    logoUrl: settings?.logo_url || DEFAULT_BRAND.logoUrl,
    brandColor: settings?.brand_color || DEFAULT_BRAND.brandColor,
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">ניהול מיילים</h1>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">מיתוג ושולח</h2>
        <BrandSettingsForm initial={brand} />
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">אוטומציות מייל</h2>
        <div className="divide-y divide-slate-100">
          {EMAIL_DEFS.map((d) => {
            const enabled = enabledMap.get(d.key) ?? true;
            return (
              <div key={d.key} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-800">{d.title}</p>
                  <p className="text-xs text-slate-400">
                    {d.to === "admin" ? "נשלח למנהלים" : "נשלח ללקוח"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {enabled ? "פעיל" : "כבוי"}
                  </span>
                  <Link
                    href={`/admin/emails/builder?email=${d.key}`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    ערוך
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-900">לוג שליחת מיילים</h2>
        <p className="mb-4 text-sm text-slate-500">
          כל המיילים שיצאו מהמערכת (200 האחרונים). מקור האמת המלא נמצא ב‑Resend.
        </p>
        {log.length === 0 ? (
          <p className="text-sm text-slate-400">לא נשלחו עדיין מיילים (או שטבלת הלוג טרם הופעלה).</p>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="space-y-2 sm:hidden">
              {log.map((e) => (
                <div key={e.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-slate-800" dir="ltr">{e.to_email}</span>
                    <StatusPill status={e.status} />
                  </div>
                  {e.subject && <p className="mt-1 break-words text-sm text-slate-600">{e.subject}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                    <span>{templateLabel(e.template)}</span>
                    <span>{formatDate(e.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-sm" dir="rtl">
                <thead className="border-b border-slate-100 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-right font-semibold">תאריך</th>
                    <th className="px-3 py-2 text-right font-semibold">נמען</th>
                    <th className="px-3 py-2 text-right font-semibold">סוג</th>
                    <th className="px-3 py-2 text-right font-semibold">נושא</th>
                    <th className="px-3 py-2 text-right font-semibold">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatDate(e.created_at)}</td>
                      <td className="px-3 py-2 text-slate-800" dir="ltr">{e.to_email}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{templateLabel(e.template)}</td>
                      <td className="px-3 py-2 text-slate-600">{e.subject || "—"}</td>
                      <td className="px-3 py-2"><StatusPill status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "sent";
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
      {ok ? "נשלח" : "נכשל"}
    </span>
  );
}
