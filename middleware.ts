import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets, the PWA entry points & the Stripe
    // webhook.
    //
    // sw.js and manifest.webmanifest are excluded because every pass through
    // here costs a supabase.auth.getUser() round-trip, and neither request
    // carries a session to check: the browser fetches a manifest without
    // credentials by default, and the service worker script is fetched off the
    // page's auth context. Excluding them also keeps a future auth guard from
    // silently 302'ing the manifest to /login, which kills the install prompt
    // with no error anywhere. (The icons are already covered by the image
    // extensions below.)
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
