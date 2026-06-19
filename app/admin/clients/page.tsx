import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateClientForm } from "@/components/admin/CreateClientForm";
import { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("name");

  const rows = (clients ?? []) as Profile[];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">לקוחות</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">לקוח חדש</h2>
            <CreateClientForm />
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">כל הלקוחות ({rows.length})</h2>
            <div className="divide-y divide-slate-100">
              {rows.length === 0 && <p className="py-4 text-sm text-slate-400">עדיין אין לקוחות.</p>}
              {rows.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/clients/${c.id}`}
                  className="group flex items-center justify-between gap-3 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900">{c.name || "—"}</p>
                    <p className="truncate text-sm text-slate-500">
                      {c.company ? `${c.company} · ` : ""}
                      {c.email}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition group-hover:border-slate-400">
                    פרטי לקוח
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
