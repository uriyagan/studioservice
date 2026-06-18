import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserRow } from "@/components/admin/UserRow";
import { Profile } from "@/lib/types";

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
                <UserRow key={c.id} client={c} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
