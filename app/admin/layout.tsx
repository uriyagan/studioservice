import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { VersionWatcher } from "@/components/VersionWatcher";
import { InboxWidget } from "@/components/admin/InboxWidget";
import { Toaster } from "@/components/ui/Toast";

const LINKS = [
  { href: "/admin", label: "מעקב משימות" },
  { href: "/admin/projects", label: "פרויקטים" },
  { href: "/admin/clients", label: "לקוחות" },
  { href: "/admin/users", label: "מנהלי מערכת" },
  { href: "/admin/emails", label: "מיילים" },
  { href: "/admin/billing", label: "תשלומים" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") redirect("/portal");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f5f5]">
      <NavBar
        title="Uriya Ganor Studio"
        logoSrc="/studio-logo.svg"
        links={LINKS}
        userName={profile?.name || user.email || ""}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <InboxWidget />
      <Toaster />
      <VersionWatcher />
    </div>
  );
}
