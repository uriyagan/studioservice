import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BrandSettingsForm } from "@/components/email-builder/BrandSettingsForm";
import { DEFAULT_BRAND, EMAIL_DEFS } from "@/lib/email/types";
import { EmailLogView } from "@/components/admin/EmailLogView";
import { getEmailLog } from "@/app/actions/email-log";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  const supabase = await createClient();
  const db = supabase as unknown as { from: (t: string) => any };

  const [{ data: templates }, { data: settings }, log] = await Promise.all([
    db.from("email_templates").select("template_key, enabled"),
    db.from("email_settings").select("*").eq("id", true).maybeSingle(),
    getEmailLog({ offset: 0 }),
  ]);

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

      <EmailLogView initialRows={log} />
    </div>
  );
}
