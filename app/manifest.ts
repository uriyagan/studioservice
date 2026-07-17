import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest; Next adds the <link rel="manifest"> itself.
// Typed rather than a static file in public/ so a mistyped field fails tsc
// instead of silently costing the install prompt.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "אפליקציית שירות - סטודיו אוריה גנור",
    // Shown under the home-screen icon. Launchers truncate somewhere around 12
    // characters, so this one may show as "סטודיו אורי…" — the full brand was
    // chosen over a name that fits. Keep in step with `appleWebApp.title` in
    // app/layout.tsx, which is the same label on iOS.
    short_name: "סטודיו אוריה גנור",
    description: "מערכת ניהול שעות ופניות לקוחות",
    lang: "he",
    dir: "rtl",

    // "/" is already a role-aware dispatcher (app/page.tsx): it sends an admin
    // to /admin, a client to /portal, and a logged-out visitor to /login. So a
    // single install serves both audiences and lands each on their own home —
    // no separate admin/client app, no role baked into the installed shortcut.
    start_url: "/",
    scope: "/",

    display: "standalone",

    // theme_color tints the phone's status bar, which sits directly above the
    // NavBar — white to match it (`bg-white/90`), not the brand black, which
    // would read as a detached band. background_color is the splash screen and
    // matches the app background.
    theme_color: "#ffffff",
    background_color: "#f5f5f5",

    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate art: Android crops adaptive icons to a shape of its choosing,
      // and the "any" icons above clear the safe zone by only ~7px — a circle
      // mask would bite into the glyph. See scripts/gen-icons.js.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
