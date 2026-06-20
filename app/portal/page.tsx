import { getMyProjects } from "@/lib/portal-data";
import { DashboardView } from "@/components/portal/DashboardView";
import { BuyWelcome } from "@/components/portal/BuyWelcome";
import { HourPackageRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PortalDashboard() {
  const { supabase, user, projects } = await getMyProjects();
  if (!user) return null;

  // No project yet → show packages so the client can buy their first one.
  if (projects.length === 0) {
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("company, company_number, phone, address")
      .eq("id", user.id)
      .maybeSingle();
    const { data: pkgs } = await supabase
      .from("hour_packages")
      .select("*")
      .eq("active", true)
      .order("sort");
    return (
      <BuyWelcome
        packages={(pkgs ?? []) as HourPackageRow[]}
        billing={{
          company: myProfile?.company ?? "",
          company_number: myProfile?.company_number ?? "",
          email: user.email ?? "",
          phone: myProfile?.phone ?? "",
          address: myProfile?.address ?? "",
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">לוח בקרה</h1>
      <DashboardView projects={projects} />
    </div>
  );
}
