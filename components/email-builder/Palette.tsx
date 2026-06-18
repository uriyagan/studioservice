"use client";

import { useDraggable } from "@dnd-kit/core";
import {
  Heading,
  Type,
  Image as ImageIcon,
  MousePointerClick,
  Film,
  Columns3,
  Share2,
  Minus,
  StretchVertical,
  Code,
  PanelBottom,
} from "lucide-react";
import type { EmailBlock } from "@/lib/email/types";
import { BLOCK_PALETTE } from "./blocks";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  heading: Heading,
  text: Type,
  image: ImageIcon,
  button: MousePointerClick,
  video: Film,
  columns: Columns3,
  social: Share2,
  divider: Minus,
  spacer: StretchVertical,
  html: Code,
  footer: PanelBottom,
};

function PaletteItem({ type, label }: { type: EmailBlock["type"]; label: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `n:${type}` });
  const Icon = ICONS[type] ?? Type;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={
        "flex cursor-grab select-none flex-col items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-2.5 text-center text-[11px] hover:border-primary hover:bg-slate-50 active:cursor-grabbing " +
        (isDragging ? "opacity-40" : "")
      }
    >
      <Icon className="h-5 w-5 text-slate-700" />
      <span>{label}</span>
    </div>
  );
}

export function Palette() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-medium text-slate-500">גרור בלוק אל המייל</div>
      <div className="grid grid-cols-3 gap-1.5">
        {BLOCK_PALETTE.map((p) => (
          <PaletteItem key={p.type} type={p.type} label={p.label} />
        ))}
      </div>
    </div>
  );
}
