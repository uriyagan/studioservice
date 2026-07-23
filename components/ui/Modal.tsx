"use client";

import { useEffect, useRef } from "react";

export function Modal({
  title,
  onClose,
  children,
  // When false, clicking the backdrop never closes the modal — only the ✕.
  // Use for forms where an accidental close would lose typed data.
  closeOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (!closeOnBackdrop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, closeOnBackdrop]);

  // Only treat it as a backdrop click if the press *started* on the backdrop.
  // Selecting text inside and releasing the mouse outside the box would
  // otherwise fire a click on the backdrop and close the modal (lost data).
  const downOnBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 py-4 sm:p-4 sm:py-10"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (closeOnBackdrop && downOnBackdrop.current && e.target === e.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        dir="rtl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="סגירה">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
