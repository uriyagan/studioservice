import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ClientDetailsForm } from "@/components/admin/ClientDetailsForm";

export const dynamic = "force-dynamic";

export default async function PortalProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: p } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, phone, company, company_number, address, notes")
    .eq("id", user.id)
    .maybeSingle();

  const profile = {
    id: user.id,
    email: user.email ?? null,
    first_name: p?.first_name ?? null,
    last_name: p?.last_name ?? null,
    phone: p?.phone ?? null,
    company: p?.company ?? null,
    company_number: p?.company_number ?? null,
    address: p?.address ?? null,
    notes: null,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">הפרטים שלי</h1>
      <Card>
        <ClientDetailsForm profile={profile} mode="self" />
      </Card>
    </div>
  );
}
