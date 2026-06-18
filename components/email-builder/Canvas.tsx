"use client";

import { Fragment } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, Copy, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import type { EmailBlock, EmailDesign } from "@/lib/email/types";
import { blockLabel, eqLoc, zoneId, dragId, type Loc } from "./blocks";
import { SOCIAL_PATHS, socialHref } from "./social-icons";
import { InlineText } from "./InlineText";

/** Per-block spacing: outer = vertical margin, inner = padding. */
export function blockSpacing(b: EmailBlock): React.CSSProperties {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = b as any;
  const outer = s.outer === undefined ? 8 : Number(s.outer) || 0;
  const inner = s.inner === undefined ? 0 : Number(s.inner) || 0;
  return { margin: `${outer}px 0`, padding: inner ? `${inner}px` : undefined };
}

type AreaHandlers = {
  design: EmailDesign;
  selected: Loc | null;
  onSelect: (loc: Loc | null) => void;
  onChange: (loc: Loc, patch: Partial<EmailBlock>) => void;
  onDuplicate: (loc: Loc) => void;
  onRemove: (loc: Loc) => void;
  onUp: (loc: Loc) => void;
  onDown: (loc: Loc) => void;
};

export function CanvasArea({ blocks, ...h }: { blocks: EmailBlock[] } & AreaHandlers) {
  if (blocks.length === 0) {
    return (
      <>
        <DropZone id={zoneId({ t: "top", i: 0 })} />
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          גרור בלוקים מהצד כדי לבנות את המייל.
        </div>
      </>
    );
  }
  return (
    <>
      <DropZone id={zoneId({ t: "top", i: 0 })} />
      {blocks.map((b, i) => {
        const loc: Loc = { t: "top", i };
        return (
          <Fragment key={b.id}>
            <BlockShell
              dragId={dragId(loc)}
              label={blockLabel(b.type)}
              selected={eqLoc(h.selected, loc)}
              canUp={i > 0}
              canDown={i < blocks.length - 1}
              onSelect={() => h.onSelect(loc)}
              onDuplicate={() => h.onDuplicate(loc)}
              onRemove={() => h.onRemove(loc)}
              onUp={() => h.onUp(loc)}
              onDown={() => h.onDown(loc)}
            >
              <div style={blockSpacing(b)}>
                {b.type === "columns" ? (
                  <ColumnsBlock block={b} bIndex={i} {...h} />
                ) : (
                  <CanvasBlock
                    block={b}
                    design={h.design}
                    onChange={(patch) => h.onChange(loc, patch)}
                    onSelect={() => h.onSelect(loc)}
                  />
                )}
              </div>
            </BlockShell>
            <DropZone id={zoneId({ t: "top", i: i + 1 })} />
          </Fragment>
        );
      })}
    </>
  );
}

function ColumnsBlock({ block, bIndex, ...h }: { block: EmailBlock; bIndex: number } & AreaHandlers) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = block as any;
  const cols = (s.columns ?? []) as Array<{ blocks?: EmailBlock[] }>;
  const count = s.count ?? cols.length;
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {cols.slice(0, count).map((col, c) => {
        const children = col?.blocks ?? [];
        return (
          <div key={c} style={{ flex: 1, minHeight: 48, border: "1px dashed rgba(0,0,0,0.12)", borderRadius: 6, padding: 4 }}>
            <DropZone id={zoneId({ t: "col", b: bIndex, c, i: 0 })} thin />
            {children.map((cb, i) => {
              const loc: Loc = { t: "col", b: bIndex, c, i };
              return (
                <Fragment key={cb.id}>
                  <BlockShell
                    dragId={dragId(loc)}
                    label={blockLabel(cb.type)}
                    selected={eqLoc(h.selected, loc)}
                    canUp={i > 0}
                    canDown={i < children.length - 1}
                    onSelect={() => h.onSelect(loc)}
                    onDuplicate={() => h.onDuplicate(loc)}
                    onRemove={() => h.onRemove(loc)}
                    onUp={() => h.onUp(loc)}
                    onDown={() => h.onDown(loc)}
                  >
                    <div style={blockSpacing(cb)}>
                      <CanvasBlock block={cb} design={h.design} onChange={(patch) => h.onChange(loc, patch)} onSelect={() => h.onSelect(loc)} />
                    </div>
                  </BlockShell>
                  <DropZone id={zoneId({ t: "col", b: bIndex, c, i: i + 1 })} thin />
                </Fragment>
              );
            })}
            {children.length === 0 && (
              <div style={{ textAlign: "center", color: "#bbb", fontSize: 11, padding: "8px 0" }}>גרור לכאן</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CanvasBlock({
  block,
  design,
  onChange,
  onSelect,
}: {
  block: EmailBlock;
  design: EmailDesign;
  onChange?: (patch: Partial<EmailBlock>) => void;
  onSelect?: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = block as any;
  const align = (s.align ?? design.contentAlign ?? "right") as "right" | "center" | "left";
  const editable = !!onChange;
  switch (block.type) {
    case "heading": {
      const size = s.level === "h1" ? 28 : s.level === "h3" ? 18 : 22;
      const st = { textAlign: align, fontSize: size, fontWeight: 700, color: design.textColor } as React.CSSProperties;
      return editable ? (
        <InlineText html={richOrText(s.text)} onChange={(h) => onChange!({ text: h })} onFocusBlock={onSelect} style={st} />
      ) : (
        <div style={st} dangerouslySetInnerHTML={{ __html: richOrText(s.text) }} />
      );
    }
    case "text": {
      const st = { textAlign: align, fontSize: Number(s.size) || design.fontSize, lineHeight: 1.6, color: design.textColor } as React.CSSProperties;
      return editable ? (
        <InlineText html={richOrText(s.text)} onChange={(h) => onChange!({ text: h })} onFocusBlock={onSelect} style={st} />
      ) : (
        <div style={st} dangerouslySetInnerHTML={{ __html: richOrText(s.text) }} />
      );
    }
    case "image":
      return (
        <div style={{ textAlign: align }}>
          {s.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.src} alt={s.alt} style={{ width: `${s.width || 100}%`, maxWidth: "100%" }} />
          ) : (
            <div style={{ background: "#eee", color: "#999", padding: 24, fontSize: 12, borderRadius: 4 }}>
              [הזן כתובת תמונה בהגדרות הבלוק]
            </div>
          )}
        </div>
      );
    case "button": {
      const span = {
        display: "inline-block",
        background: s.bg,
        color: s.color,
        padding: "10px 22px",
        borderRadius: Number(s.radius) || 6,
        fontWeight: 600,
        fontSize: Number(s.fontSize) || 16,
      } as React.CSSProperties;
      return (
        <div style={{ textAlign: align }}>
          <span style={span}>
            {editable ? (
              <InlineText html={richOrText(s.text)} onChange={(h) => onChange!({ text: h })} onFocusBlock={onSelect} style={{ display: "inline-block", color: s.color }} />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: richOrText(s.text) }} />
            )}
          </span>
        </div>
      );
    }
    case "divider":
      return <div style={{ borderTop: `1px solid ${s.color}` }} />;
    case "spacer":
      return <div style={{ height: Number(s.height) || 24 }} />;
    case "footer": {
      const st = { textAlign: align, color: s.color, fontSize: 12 } as React.CSSProperties;
      return editable ? (
        <InlineText html={richOrText(s.text)} onChange={(h) => onChange!({ text: h })} onFocusBlock={onSelect} style={st} />
      ) : (
        <div style={st} dangerouslySetInnerHTML={{ __html: richOrText(s.text) }} />
      );
    }
    case "html":
      return <div dangerouslySetInnerHTML={{ __html: String(s.html ?? "") }} />;
    case "video":
      return <VideoPreview block={block} />;
    case "social": {
      const color = s.color || design.textColor || "#111111";
      const sz = Number(s.iconSize) || 28;
      const gap = s.gap === undefined ? 10 : Number(s.gap) || 0;
      const nets = ((s.networks ?? []) as Array<{ type: string; url: string }>).filter((n) => n.url);
      return (
        <div style={{ textAlign: align }}>
          {nets.map((n, i) => (
            <a key={i} href={socialHref(n.type, n.url)} onClick={(e) => e.preventDefault()} style={{ display: "inline-block", margin: `0 ${gap / 2}px`, verticalAlign: "middle" }}>
              <svg viewBox="0 0 24 24" width={sz} height={sz} fill={color} aria-label={n.type} style={{ display: "inline-block" }}>
                <path d={SOCIAL_PATHS[n.type] || SOCIAL_PATHS.website} />
              </svg>
            </a>
          ))}
          {nets.length === 0 && <span style={{ color: "#aaa", fontSize: 12 }}>[רשתות חברתיות — הוסף קישורים]</span>}
        </div>
      );
    }
    default:
      return null;
  }
}

export function youtubeId(url: string): string {
  const m = String(url || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : "";
}

function VideoPreview({ block }: { block: EmailBlock }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = block as any;
  const url = String(s.url || "");
  const align = (s.align ?? "center") as "right" | "center" | "left";
  const yt = youtubeId(url);
  const thumb = yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : "";
  if (!url) {
    return (
      <div style={{ textAlign: align }}>
        <div style={{ display: "inline-block", background: "#f1f1f4", color: "#888", borderRadius: 8, padding: "28px 24px", fontSize: 13 }}>
          🎬 הדבק קישור יוטיוב בהגדרות הבלוק
        </div>
      </div>
    );
  }
  return (
    <div style={{ textAlign: align }}>
      <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" style={{ width: 480, maxWidth: "100%", borderRadius: 8, display: "block" }} />
        ) : (
          <div style={{ width: 480, maxWidth: "100%", height: 270, background: "#1f2937", borderRadius: 8 }} />
        )}
        <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 56, height: 56, borderRadius: "50%", background: "rgba(0,0,0,0.65)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
          ▶
        </span>
      </div>
    </div>
  );
}

function richOrText(v: unknown): string {
  const str = String(v ?? "");
  if (/<[a-z][\s\S]*>/i.test(str)) return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

export function DropZone({ id, thin }: { id: string; thin?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} style={{ height: isOver ? 26 : thin ? 6 : 10, transition: "height 120ms" }} className="relative flex items-center justify-center">
      <div className={"h-0.5 w-full rounded " + (isOver ? "bg-primary" : "bg-transparent")} />
      {isOver && <div className="absolute rounded bg-primary px-2 py-0.5 text-[10px] font-medium text-white">שחרר כאן</div>}
    </div>
  );
}

export function BlockShell({
  dragId: id,
  label,
  selected,
  canUp,
  canDown,
  onSelect,
  onDuplicate,
  onRemove,
  onUp,
  onDown,
  children,
}: {
  dragId: string;
  label: string;
  selected: boolean;
  canUp: boolean;
  canDown: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={
        "group/blk relative cursor-pointer rounded transition " +
        (selected ? "outline outline-2 outline-primary" : "outline outline-1 outline-transparent hover:outline-slate-300") +
        (isDragging ? " opacity-40" : "")
      }
      style={{ outlineOffset: 2 }}
    >
      <div className={"absolute -top-9 left-2 z-10 items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 shadow-sm " + (selected ? "flex" : "hidden group-hover/blk:flex")}>
        <button {...attributes} {...listeners} title="גרור" className="cursor-grab p-0.5 text-slate-500 hover:text-slate-800 active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onUp(); }} disabled={!canUp} title="למעלה" className="p-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-30">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDown(); }} disabled={!canDown} title="למטה" className="p-0.5 text-slate-500 hover:text-slate-800 disabled:opacity-30">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(); }} title="שכפל" className="p-0.5 text-slate-500 hover:text-slate-800">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="מחק" className="p-0.5 text-slate-500 hover:text-red-600">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {selected && <div className="absolute -top-9 right-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">{label}</div>}
      {children}
    </div>
  );
}
