import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavBar } from "@/components/NavBar";
import { VersionWatcher } from "@/components/VersionWatcher";
import { Toaster } from "@/components/ui/Toast";

const LINKS = [
  { href: "/portal", label: "לוח בקרה" },
  { href: "/portal/tasks", label: "משימות" },
  { href: "/portal/packages", label: "חבילות שירות" },
  { href: "/portal/profile", label: "הפרטים שלי" },
];

export default async function PortalLayout({
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
    .select("name")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f5f5]">
      <NavBar
        title="סטודיו אוריה גנור"
        logoSrc="/studio-logo.svg"
        links={LINKS}
        userName={profile?.name || user.email || ""}
        rootHref="/portal"
      />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      <Toaster />
      <VersionWatcher />
    </div>
  );
}
