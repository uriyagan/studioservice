"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_DESIGN,
  EMAIL_DEFS,
  FONT_STACKS,
  MERGE_TAGS,
  fontStack,
  type EmailBlock,
  type EmailDesign,
  type EmailKey,
} from "@/lib/email/types";
import {
  blockLabel,
  getBlockAt,
  insertBlockAt,
  moveBlock,
  newBlock,
  nudgeBlock,
  parseDrag,
  parseZone,
  removeBlockAt,
  updateBlockAt,
  duplicateBlockAt,
  type Loc,
} from "./blocks";
import { CanvasArea } from "./Canvas";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { Stepper } from "./Stepper";
import { saveEmailTemplate, sendTestEmail, setEmailEnabled } from "@/app/actions/email";

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

type TemplateSource = {
  key: EmailKey;
  title: string;
  subject: string;
  blocks: EmailBlock[];
  design: EmailDesign;
};

export function EmailBuilder({
  emailKey,
  initialSubject,
  initialBlocks,
  initialDesign,
  initialEnabled,
  sources = [],
}: {
  emailKey: EmailKey;
  initialSubject: string;
  initialBlocks: EmailBlock[];
  initialDesign: EmailDesign;
  initialEnabled: boolean;
  sources?: TemplateSource[];
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialBlocks);
  const [design, setDesign] = useState<EmailDesign>(initialDesign);
  const [subject, setSubject] = useState(initialSubject);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selected, setSelected] = useState<Loc | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showTags, setShowTags] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isSending, startSend] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const selectedBlock = useMemo(() => getBlockAt(blocks, selected), [blocks, selected]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 2500);
  };

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over?.id ? parseZone(String(e.over.id)) : null;
    const drag = parseDrag(String(e.active.id));
    if (!over || !drag) return;
    if (drag.kind === "new") {
      const { blocks: nb, loc } = insertBlockAt(blocks, over, newBlock(drag.type));
      setBlocks(nb);
      setSelected(loc);
    } else {
      const { blocks: nb, loc } = moveBlock(blocks, drag.loc, over);
      setBlocks(nb);
      setSelected(loc);
    }
  }

  const patchSelected = (patch: Partial<EmailBlock>) => {
    if (!selected) return;
    setBlocks((b) => updateBlockAt(b, selected, patch));
  };

  const onSave = () =>
    startSave(async () => {
      const r = await saveEmailTemplate({ key: emailKey, subject, blocks, design, enabled });
      flash(r.ok ? "נשמר ✓" : r.error || "שגיאה בשמירה");
    });

  const onToggleEnabled = (v: boolean) => {
    setEnabled(v);
    startSave(async () => {
      await setEmailEnabled(emailKey, v);
    });
  };

  const onSendTest = () =>
    startSend(async () => {
      const r = await sendTestEmail({ subject, blocks, design });
      flash(r.ok ? "מייל בדיקה נשלח אליך ✓" : r.error || "שליחה נכשלה");
    });

  // Copy blocks + design + subject from another already-designed template
  // into the editor (not saved until the user clicks שמירה).
  const onCopyFrom = (srcKey: string) => {
    const src = sources.find((s) => s.key === srcKey);
    if (!src) return;
    if (!window.confirm(`להעתיק את כל העיצוב והתוכן מהתבנית "${src.title}"? הפעולה תחליף את התוכן הנוכחי (ניתן לבטל לפני שמירה).`))
      return;
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
    setBlocks(clone(src.blocks));
    setDesign(clone(src.design));
    setSubject(src.subject);
    setSelected(null);
    flash(`הועתק מ"${src.title}" — בדקו ולחצו שמירה`);
  };

  const dActive = activeId ? parseDrag(activeId) : null;
  const overlayLabel = dActive
    ? dActive.kind === "new"
      ? blockLabel(dActive.type)
      : blockLabel(getBlockAt(blocks, dActive.loc)?.type ?? "text")
    : "";

  const tagsForEmail = MERGE_TAGS.filter((g) => g.emails.includes(emailKey));

  const setD = (patch: Partial<EmailDesign>) => setDesign((d) => ({ ...d, ...patch }));

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={emailKey}
            onChange={(e) => router.push(`/admin/emails/builder?email=${e.target.value}`)}
            className={inputCls}
            dir="rtl"
          >
            {EMAIL_DEFS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.title}
              </option>
            ))}
          </select>
          {sources.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) onCopyFrom(e.target.value);
                e.target.value = "";
              }}
              className={inputCls}
              dir="rtl"
              title="העתקת עיצוב ותוכן מתבנית קיימת"
            >
              <option value="">העתק מתבנית…</option>
              {sources.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
            פעיל
          </label>
          <div className="flex overflow-hidden rounded-md border border-slate-300 text-xs">
            <button onClick={() => setDevice("desktop")} className={device === "desktop" ? "bg-primary px-2.5 py-1 text-white" : "px-2.5 py-1 text-slate-600"}>
              דסקטופ
            </button>
            <button onClick={() => setDevice("mobile")} className={device === "mobile" ? "bg-primary px-2.5 py-1 text-white" : "px-2.5 py-1 text-slate-600"}>
              מובייל
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {msg && <span className="text-sm text-emerald-600">{msg}</span>}
          <button onClick={() => setShowTags(true)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            תגיות דינמיות
          </button>
          <Button variant="secondary" disabled={isSending} onClick={onSendTest}>
            {isSending ? "שולח..." : "שלח בדיקה"}
          </Button>
          <Button disabled={isSaving} onClick={onSave}>
            {isSaving ? "שומר..." : "שמירה"}
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Sidebar */}
          <div className="w-80 shrink-0 space-y-3 overflow-y-auto pe-1">
            {selectedBlock && selected ? (
              <Inspector block={selectedBlock} onChange={patchSelected} onClose={() => setSelected(null)} />
            ) : null}
            <Palette />

            {/* Design panel */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-800">עיצוב כללי</div>
              <ColorRow label="רקע המייל" value={design.emailBackground} onChange={(v) => setD({ emailBackground: v })} />
              <ColorRow label="רקע התוכן" value={design.contentBackground} onChange={(v) => setD({ contentBackground: v })} />
              <ColorRow label="צבע טקסט" value={design.textColor} onChange={(v) => setD({ textColor: v })} />
              <ColorRow label="צבע קישורים" value={design.linkColor} onChange={(v) => setD({ linkColor: v })} />
              <div>
                <label className="mb-1 block text-xs text-slate-500">פונט</label>
                <select value={design.fontFamily} onChange={(e) => setD({ fontFamily: e.target.value })} className={inputCls} dir="rtl">
                  {FONT_STACKS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">יישור ברירת מחדל</label>
                <select value={design.contentAlign} onChange={(e) => setD({ contentAlign: e.target.value as EmailDesign["contentAlign"] })} className={inputCls} dir="rtl">
                  <option value="right">ימין</option>
                  <option value="center">מרכז</option>
                  <option value="left">שמאל</option>
                </select>
              </div>
              <NumRow label="גודל פונט" value={design.fontSize} min={10} max={28} onChange={(n) => setD({ fontSize: n })} />
              <NumRow label="רוחב תוכן" value={design.contentWidth} min={280} max={900} step={10} onChange={(n) => setD({ contentWidth: n })} />
              <NumRow label="עיגול פינות" value={design.borderRadius} min={0} max={40} onChange={(n) => setD({ borderRadius: n })} />
              <NumRow label="מרווח חיצוני" value={design.outerPadding} min={0} max={60} onChange={(n) => setD({ outerPadding: n })} />
              <NumRow label="מרווח פנימי" value={design.innerPadding} min={0} max={60} onChange={(n) => setD({ innerPadding: n })} />
            </div>

            {/* Subject */}
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-800">נושא המייל</div>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} placeholder="נושא ההודעה" />
            </div>
          </div>

          {/* Canvas */}
          <div className="min-w-0 flex-1 overflow-y-auto rounded-xl bg-slate-100 p-6" onClick={() => setSelected(null)}>
            <div
              className="mx-auto"
              style={{
                width: device === "mobile" ? 380 : design.contentWidth,
                maxWidth: "100%",
                background: design.contentBackground,
                borderRadius: design.borderRadius,
                padding: design.innerPadding,
                fontFamily: fontStack(design.fontFamily),
                fontSize: design.fontSize,
                color: design.textColor,
                textAlign: design.contentAlign,
              }}
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <CanvasArea
                blocks={blocks}
                design={design}
                selected={selected}
                onSelect={setSelected}
                onChange={(loc, patch) => setBlocks((b) => updateBlockAt(b, loc, patch))}
                onDuplicate={(loc) => {
                  const { blocks: nb, loc: nl } = duplicateBlockAt(blocks, loc);
                  setBlocks(nb);
                  setSelected(nl);
                }}
                onRemove={(loc) => {
                  const { blocks: nb } = removeBlockAt(blocks, loc);
                  setBlocks(nb);
                  setSelected(null);
                }}
                onUp={(loc) => {
                  const { blocks: nb, loc: nl } = nudgeBlock(blocks, loc, -1);
                  setBlocks(nb);
                  setSelected(nl);
                }}
                onDown={(loc) => {
                  const { blocks: nb, loc: nl } = nudgeBlock(blocks, loc, 1);
                  setBlocks(nb);
                  setSelected(nl);
                }}
              />
            </div>
          </div>
        </div>

        <DragOverlay>{activeId ? <div className="rounded bg-primary px-2 py-1 text-xs text-white shadow">{overlayLabel}</div> : null}</DragOverlay>
      </DndContext>

      {showTags && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowTags(false)}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">תגיות דינמיות</h3>
              <button onClick={() => setShowTags(false)} className="text-sm text-slate-500 hover:text-slate-800">
                סגור
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-500">לחץ כדי להעתיק. התגית תוחלף בערך האמיתי בעת השליחה.</p>
            <div className="space-y-4">
              {tagsForEmail.map((g) => (
                <div key={g.group}>
                  <div className="mb-1 text-xs font-semibold text-slate-700">{g.group}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {g.tags.map((t) => (
                      <button
                        key={t.token}
                        onClick={() => navigator.clipboard?.writeText(t.token)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                        title={t.label}
                        dir="ltr"
                      >
                        {t.token}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <div className="flex items-center gap-2" dir="ltr">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}

function NumRow({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <Stepper block value={value} min={min} max={max} step={step} onChange={onChange} />
    </div>
  );
}
