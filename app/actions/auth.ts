"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Client-initiated password reset: emails a branded message with a
// link to /set-password. Always returns ok (never reveals whether the
// email exists).
export async function requestPasswordReset(
  _prev: { ok: boolean; error?: string },
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "אימייל נדרש" };
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: "https://service.uriyaganor.com/set-password" },
    });
    const link = data?.properties?.action_link;
    if (link) {
      const { dispatchEmail } = await import("@/lib/email/dispatch");
      await dispatchEmail("password_reset", email, {
        reset_link: link,
        login_url: "https://service.uriyaganor.com/login",
        site_url: "https://service.uriyaganor.com",
      });
    }
  } catch {
    /* swallow — don't reveal whether the account exists */
  }
  return { ok: true };
}
