import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ClientDetailsForm } from "@/components/admin/ClientDetailsForm";
import { ClientProjects, ProjectOpt } from "@/components/admin/ClientProjects";
import { DeleteClientButton } from "@/components/admin/DeleteClientButton";
import { ArrowRight } from "@/components/icons";
import { Profile, ProjectStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: projects }, { data: profiles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).eq("role", "client").maybeSingle(),
    supabase.from("project_stats").select("*").order("name"),
    supabase.from("profiles").select("id, name"),
  ]);

  if (!client) notFound();
  const c = client as Profile;

  const nameById = new Map<string, string>(
    ((profiles ?? []) as { id: string; name: string | null }[]).map((p) => [p.id, p.name ?? ""])
  );
  const projectOpts: ProjectOpt[] = ((projects ?? []) as ProjectStats[]).map((p) => ({
    id: p.id,
    name: p.name,
    is_retainer: p.is_retainer,
    hours_remaining: p.hours_remaining,
    total_hours_allocated: p.total_hours_allocated,
    client_id: p.client_id,
    ownerName: p.client_id ? nameById.get(p.client_id) ?? "" : "",
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowRight className="h-4 w-4" /> חזרה ללקוחות
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{c.name || c.email}</h1>
        <p className="text-sm text-slate-500">{c.email}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">פרטי הלקוח</h2>
          <ClientDetailsForm profile={c} mode="admin" />
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">פרויקטים משויכים</h2>
          <ClientProjects clientId={c.id} projects={projectOpts} />
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">מחיקת לקוח</h2>
            <p className="mt-1 text-sm text-slate-500">
              מסיר את הלקוח לצמיתות. הפרויקטים יישמרו אך ינותקו ממנו.
            </p>
          </div>
          <DeleteClientButton clientId={c.id} name={c.name || c.email || ""} />
        </div>
      </Card>
    </div>
  );
}
