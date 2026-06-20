import { getMyProjects } from "@/lib/portal-data";
import { PurchaseView } from "@/components/portal/PurchaseView";
import { BuyWelcome } from "@/components/portal/BuyWelcome";
import { HourPackageRow, Purchase } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalPackagesPage() {
  const { supabase, user, projects } = await getMyProjects();
  if (!user) return null;

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("company, company_number, phone, address")
    .eq("id", user.id)
    .maybeSingle();
  const billing = {
    company: myProfile?.company ?? "",
    company_number: myProfile?.company_number ?? "",
    email: user.email ?? "",
    phone: myProfile?.phone ?? "",
    address: myProfile?.address ?? "",
  };

  const [{ data: pkgs }, { data: purchaseRows }] = await Promise.all([
    supabase.from("hour_packages").select("*").eq("active", true).order("sort"),
    supabase.from("purchases").select("*").eq("client_id", user.id).order("created_at", { ascending: false }),
  ]);
  const packages = (pkgs ?? []) as HourPackageRow[];
  const purchases = (purchaseRows ?? []) as Purchase[];

  if (projects.length === 0) {
    return <BuyWelcome packages={packages} billing={billing} />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">חבילות שירות</h1>
      <PurchaseView projects={projects} packages={packages} purchases={purchases} billing={billing} />
    </div>
  );
}
