import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { Profile } from "@/lib/types";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "client")
    .order("created_at", { ascending: false });

  const rows = (clients ?? []) as Profile[];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">ניהול משתמשים</h1>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">לקוח חדש</h2>
            <CreateUserForm />
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">
              לקוחות ({rows.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <p className="py-4 text-sm text-slate-400">
                  עדיין אין לקוחות.
                </p>
              )}
              {rows.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      {c.name || "—"}
                    </p>
                    <p className="text-sm text-slate-500">{c.email}</p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {formatDate(c.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
