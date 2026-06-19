"use client";

import { useEffect, useState } from "react";

// Route-level error boundary. The dominant cause in this app is a *stale
// chunk* after a deploy: a tab opened on a previous build requests JS that no
// longer exists, and the error wording varies by browser. So we auto-recover
// from ANY error by reloading once (fetches the fresh build). A time-guard
// prevents loops — if the same error recurs immediately, it's a genuine bug
// and we show the manual recovery UI instead.
const KEY = "studio_err_reload_at";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [recovering, setRecovering] = useState(true);

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
    } else {
      // Recently reloaded and it errored again → real problem, show the UI.
      setRecovering(false);
    }
  }, []);

  if (recovering) {
    return (
      <div dir="rtl" className="flex min-h-[60vh] flex-col items-center justify-center gap-2 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">טוען מחדש…</h2>
        <p className="text-sm text-slate-500">רק רגע, טוענים את הגרסה העדכנית.</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">משהו השתבש</h2>
      <p className="max-w-md text-sm text-slate-500">אירעה תקלה זמנית. אפשר לנסות שוב.</p>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          נסה שוב
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          רענון העמוד
        </button>
      </div>
    </div>
  );
}
