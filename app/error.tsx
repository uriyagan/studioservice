"use client";

import { useEffect } from "react";

// Route-level error boundary. A common cause here is a *stale chunk* after a
// deploy: a tab opened on the previous build requests a JS chunk that no
// longer exists → "client-side exception". We auto-reload once to fetch the
// new build; for other errors we show a friendly retry.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError = /ChunkLoadError|Loading chunk|dynamically imported module|importing a module script failed|Failed to fetch/i.test(
    error?.message || ""
  );

  useEffect(() => {
    if (!isChunkError) return;
    // Reload at most once per 15s to avoid a loop if it's not actually stale.
    const KEY = "studio_chunk_reload_at";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > 15000) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    }
  }, [isChunkError]);

  return (
    <div dir="rtl" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        {isChunkError ? "מעדכן לגרסה החדשה…" : "משהו השתבש"}
      </h2>
      <p className="max-w-md text-sm text-slate-500">
        {isChunkError
          ? "העמוד נטען מחדש כדי לטעון את הגרסה העדכנית."
          : "אירעה תקלה זמנית. אפשר לנסות שוב."}
      </p>
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
