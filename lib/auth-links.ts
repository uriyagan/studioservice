import { createAdminClient } from "@/lib/supabase/admin";

const SITE = "https://service.uriyaganor.com";

// Build a set-password link that points straight to OUR /set-password page,
// carrying the recovery token_hash. The token is verified only when the user
// submits the form — so email security scanners that merely pre-fetch the URL
// don't consume the one-time token, and it doesn't depend on the Supabase
// redirect allowlist (the link stays on our own domain).
export async function setPasswordLink(email: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE}/set-password` },
  });
  const tokenHash = (data?.properties as { hashed_token?: string } | undefined)?.hashed_token;
  if (!tokenHash) return null;
  return `${SITE}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
}
