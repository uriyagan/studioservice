import { createClient } from "@/lib/supabase/server";
import { PackagesManager } from "@/components/admin/PackagesManager";
import { HourPackageRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const db = supabase as unknown as { from: (t: string) => any };
  const { data } = await db.from("hour_packages").select("*").order("sort");
  const packages = (data ?? []) as HourPackageRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">חבילות ותשלומים</h1>
        <p className="mt-1 text-sm text-slate-500">
          נהל את חבילות השעות שהלקוח יכול לרכוש. התשלום מתבצע בסטרייפ והשעות מתווספות אוטומטית.
        </p>
      </div>
      <PackagesManager packages={packages} />
    </div>
  );
}
