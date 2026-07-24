"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, X } from "@/components/icons";

// Tiny event-bus toast: showToast() can be called from any client component;
// the single <Toaster /> mounted in the layout renders the stack. Success
// (green) or error (red) style, auto-dismisses after 5s.
type ToastVariant = "success" | "error";
type Toast = { id: string; message: string; variant: ToastVariant };

let listener: ((t: Toast) => void) | null = null;

export function showToast(message: string, variant: ToastVariant = "success") {
  listener?.({ id: crypto.randomUUID(), message, variant });
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
          className={`pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.variant === "error" ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          {t.variant === "error" ? (
            <AlertCircle className="h-5 w-5 shrink-0 text-white" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />
          )}
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
