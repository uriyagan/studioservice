import { BuyPackages } from "@/components/portal/BuyPackages";
import { BillingInfo } from "@/components/portal/PurchaseForm";
import { HourPackageRow } from "@/lib/types";

// Shown to clients with no project yet — pick a package to get started
// (the purchase creates their first project automatically).
export function BuyWelcome({
  packages,
  billing,
}: {
  packages: HourPackageRow[];
  billing: BillingInfo;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">ברוכים הבאים</h1>
        <p className="mt-1 text-sm text-slate-500">בחרו חבילת שירות כדי להתחיל לעבוד איתנו.</p>
      </div>
      <BuyPackages packages={packages} billing={billing} />
    </div>
  );
}
