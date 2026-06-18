"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Link2, Unlink, RemoveFormatting } from "lucide-react";

const SWATCHES = ["#111111", "#ffffff", "#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

// Seamless inline rich-text editing on the canvas. Uncontrolled
// contentEditable: initial HTML set once on mount, innerHTML read on input.
export function InlineText({
  html,
  onChange,
  onFocusBlock,
  style,
  className,
}: {
  html: string;
  onChange: (html: string) => void;
  onFocusBlock?: () => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };
  const exec = (cmd: string, val?: string) => {
    try {
      document.execCommand("styleWithCSS", false, "true");
    } catch {
      /* noop */
    }
    document.execCommand(cmd, false, val);
    emit();
  };
  const btn = (cmd: string, child: React.ReactNode, title: string, val?: string) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        exec(cmd, val);
      }}
      className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {child}
    </button>
  );

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {focused && (
        <div
          dir="ltr"
          className="absolute -top-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1 py-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
        >
          {btn("bold", <Bold className="h-3.5 w-3.5" />, "מודגש")}
          {btn("italic", <Italic className="h-3.5 w-3.5" />, "נטוי")}
          {btn("underline", <Underline className="h-3.5 w-3.5" />, "קו תחתון")}
          <button
            type="button"
            title="קישור"
            onMouseDown={(e) => {
              e.preventDefault();
              const url = window.prompt("כתובת הקישור:", "https://");
              if (url) exec("createLink", url);
            }}
            className="rounded p-1 text-slate-600 hover:bg-slate-100"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
          {btn("unlink", <Unlink className="h-3.5 w-3.5" />, "הסר קישור")}
          {btn("removeFormat", <RemoveFormatting className="h-3.5 w-3.5" />, "נקה עיצוב")}
          <span className="mx-0.5 h-4 w-px bg-slate-200" />
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              title={"צבע " + c}
              onMouseDown={(e) => {
                e.preventDefault();
                exec("foreColor", c);
              }}
              className="h-4 w-4 rounded-full border border-black/10"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        className={className}
        style={{ outline: "none", cursor: "text", ...style }}
        onInput={emit}
        onFocus={() => {
          setFocused(true);
          onFocusBlock?.();
        }}
        onBlur={() => {
          setFocused(false);
          emit();
        }}
      />
    </div>
  );
}
