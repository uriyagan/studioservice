"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "@/components/icons";

// Tiny event-bus toast: showToast() can be called from any client component;
// the single <Toaster /> mounted in the layout renders the stack. Green
// success style, auto-dismisses after 5s.
type Toast = { id: string; message: string };

let listener: ((t: Toast) => void) | null = null;

export function showToast(message: string) {
  listener?.({ id: crypto.randomUUID(), message });
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5000);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2 px-4" dir="rtl">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />
          <span>{t.message}</span>
          <button
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className="-me-1 shrink-0 rounded p-1 text-white/80 hover:bg-white/15 hover:text-white"
            aria-label="סגירה"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
