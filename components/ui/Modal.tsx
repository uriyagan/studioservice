"use client";

import { useEffect, useRef } from "react";

export function Modal({
  title,
  titleAddon,
  subtitle,
  onClose,
  children,
  // When false, clicking the backdrop never closes the modal — only the ✕.
  // Use for forms where an accidental close would lose typed data.
  closeOnBackdrop = true,
  // fill = fixed-height column layout: the header stays put and the children
  // manage their own scrolling (e.g. a chat thread with a pinned composer).
  // Default (false) keeps the classic single-scroll padded box.
  fill = false,
}: {
  title: string;
  // Rendered beside the title — e.g. a status badge.
  titleAddon?: React.ReactNode;
  // Rendered under the title — e.g. a meta line.
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  fill?: boolean;
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
        className={`w-full rounded-xl bg-white shadow-xl ${
          fill
            ? "flex max-h-[88vh] min-h-0 max-w-[50rem] flex-col overflow-hidden"
            : "max-h-[92vh] max-w-xl overflow-y-auto p-5"
        }`}
        dir="rtl"
      >
        <div
          className={`flex items-start justify-between gap-2 ${
            fill ? "shrink-0 border-b border-slate-100 p-4 sm:px-5" : "mb-4"
          }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 break-words text-lg font-semibold text-slate-900">{title}</h3>
              {titleAddon}
            </div>
            {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="סגירה">
            ✕
          </button>
        </div>
        {fill ? <div className="flex min-h-0 flex-1 flex-col">{children}</div> : children}
      </div>
    </div>
  );
}
