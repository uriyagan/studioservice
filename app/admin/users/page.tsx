import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserRow } from "@/components/admin/UserRow";
import { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const supabase = await createClient();
  // Team only — clients are managed in /admin/clients.
  const [{ data: users }, { data: auth }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("role", "admin")
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const rows = (users ?? []) as Profile[];
  const myId = auth.user?.id;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-slate-900">צוות הסטודיו</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="md:col-span-1">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">חבר צוות חדש</h2>
            <CreateUserForm />
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <h2 className="mb-4 font-semibold text-slate-900">
              חברי צוות ({rows.length})
            </h2>
            <div className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <p className="py-4 text-sm text-slate-400">
                  עדיין אין חברי צוות.
                </p>
              )}
              {rows.map((u) => (
                <UserRow key={u.id} client={u} isSelf={u.id === myId} />
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
