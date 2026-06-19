"use client";

import { useEffect } from "react";

// Catches errors the route-level boundary can't (e.g. in the root layout).
// Same self-heal: reload once to fetch the fresh build after a deploy.
const KEY = "studio_global_err_reload_at";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(KEY) || 0);
    } catch {
      /* noop */
    }
    if (Date.now() - last > 20000) {
      try {
        sessionStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* noop */
      }
      window.location.reload();
    }
  }, []);

  return (
    <html dir="rtl" lang="he">
      <body>
        <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>טוען מחדש…</h2>
          <p style={{ fontSize: 14, color: "#64748b" }}>רק רגע, טוענים את הגרסה העדכנית.</p>
          <button
            onClick={() => reset()}
            style={{ borderRadius: 8, background: "#111827", color: "#fff", padding: "8px 16px", fontSize: 14, border: "none", cursor: "pointer" }}
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
