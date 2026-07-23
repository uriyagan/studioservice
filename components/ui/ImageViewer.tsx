"use client";

import { useEffect } from "react";
import { X, Download } from "@/components/icons";

// Browser-renderable image formats only — anything else keeps the plain
// download-on-click behaviour.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
export const isImageFile = (name: string) => IMAGE_EXT.test((name || "").trim());

// Signed URLs carry ?download=<name>, which forces attachment disposition —
// strip it so the browser renders the image inline inside the viewer.
export function inlineUrl(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("download");
    return u.toString();
  } catch {
    return url;
  }
}

// Full-screen image lightbox. Stacks above the regular Modal (z-50) since it
// can be opened from inside one (the client task modal).
export function ImageViewerModal({
  name,
  url,
  onClose,
}: {
  name: string;
  // The download-flavoured URL — used for the הורדה button; the inline
  // variant is derived for the <img> itself.
  url: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/85" onClick={onClose} dir="rtl">
      <div
        className="flex shrink-0 items-center justify-between gap-3 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm text-white">{name}</span>
        <span className="flex shrink-0 items-center gap-2">
          <a
            href={url}
            download={name}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/25"
          >
            <Download className="h-4 w-4 text-white" /> הורדה
          </a>
          <button
            onClick={onClose}
            aria-label="סגירה"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inlineUrl(url)}
          alt={name}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-md object-contain"
        />
      </div>
    </div>
  );
}
