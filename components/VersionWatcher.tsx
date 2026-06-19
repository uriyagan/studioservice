"use client";

import { useEffect, useState } from "react";

// The build id this client loaded with (inlined at build time).
const MY_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

// Detects a new deploy (by polling /api/version) and shows a non-blocking
// "new version" banner so the user refreshes cleanly — preventing stale-chunk
// errors after a deploy, without interrupting their work.
export function VersionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (MY_VERSION === "dev") return; // only meaningful in deployed builds
    let stopped = false;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { v } = await r.json();
        if (v && v !== MY_VERSION && !stopped) setStale(true);
      } catch {
        /* offline / transient — ignore */
      }
    };

    const id = setInterval(check, 90000);
    window.addEventListener("focus", check);
    check();
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!stale) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg"
    >
      <span>גרסה חדשה של המערכת זמינה.</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-white px-3 py-1 text-xs font-medium text-slate-900 hover:opacity-90"
      >
        רענון
      </button>
    </div>
  );
}
