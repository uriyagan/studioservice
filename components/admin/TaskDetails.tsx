"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, FileText, Download } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { NotesPanel, type NotesActions } from "@/components/admin/NotesPanel";
import { getTaskAttachments } from "@/app/actions/messages";
import {
  getTicketNotes,
  createTicketNote,
  updateTicketNote,
  deleteTicketNote,
  addTicketNoteFile,
  deleteTicketNoteFile,
} from "@/app/actions/ticket-notes";
import { completeTask, adjustTaskTime } from "@/app/actions/timer";
import { downloadAllAsZip } from "@/lib/download-files";
import { formatDuration } from "@/lib/format";
import { useLoggedSeconds } from "@/lib/use-logged-seconds";
import type { TimeLog } from "@/lib/types";

// Read view of what a client submitted + the (irreversible) "complete task"
// action, gated behind a confirmation that shows the total logged time.
export function TaskDetails({
  ticketId,
  title,
  description,
  link,
  status,
  logs,
  onClose,
}: {
  ticketId: string;
  title: string;
  description: string | null;
  link: string | null;
  status: string;
  logs: TimeLog[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<{ name: string; url: string }[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completing, startComplete] = useTransition();
  // Time corrections made in this modal — tracked locally so the total updates
  // immediately, on top of the time that was already logged when it opened.
  const [adjustedSeconds, setAdjustedSeconds] = useState(0);
  const [adjustMode, setAdjustMode] = useState<"add" | "subtract">("add");
  const [addH, setAddH] = useState("");
  const [addM, setAddM] = useState("");
  const [adjusting, startAdjust] = useTransition();
  const [adjustError, setAdjustError] = useState<string | null>(null);
  // Ticks while a timer is running, so the preview and the guard below track
  // the same total the server will see. `logs` is the snapshot taken when the
  // modal opened and isn't refetched, so corrections made here are layered on
  // top locally rather than read back.
  const totalSeconds = useLoggedSeconds(logs) + adjustedSeconds;
  const links = (link ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Signed delta the form currently describes, and the total it would produce.
  // Previewing the result is what makes the direction unambiguous — the admin
  // reads the number they're aiming for instead of doing the arithmetic.
  const magnitude = Math.round(((Number(addH) || 0) * 60 + (Number(addM) || 0)) * 60);
  const delta = adjustMode === "add" ? magnitude : -magnitude;
  const previewSeconds = totalSeconds + delta;
  const overdrawn = previewSeconds < 0;

  const applyAdjustment = () => {
    setAdjustError(null);
    if (magnitude <= 0) {
      setAdjustError("יש להזין זמן גדול מאפס");
      return;
    }
    if (overdrawn) {
      setAdjustError(`לא ניתן להפחית יותר מהזמן שתועד (${formatDuration(totalSeconds)})`);
      return;
    }
    startAdjust(async () => {
      const r = await adjustTaskTime(ticketId, delta);
      if (!r.ok) {
        setAdjustError(r.error ?? "עדכון הזמן נכשל");
        return;
      }
      setAdjustedSeconds((s) => s + delta);
      setAddH("");
      setAddM("");
      router.refresh();
    });
  };

  useEffect(() => {
    getTaskAttachments(ticketId).then(setFiles);
  }, [ticketId]);

  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const downloadAll = async () => {
    if (zipping) return;
    setZipping(true);
    setZipError(null);
    const { ok, failed } = await downloadAllAsZip(files ?? []);
    if (!ok)
      setZipError(
        failed.length
          ? `לא ניתן היה להוריד ${failed.length} קבצים`
          : "ההורדה נכשלה"
      );
    setZipping(false);
  };

  // Studio notes/files for the task: shown read-only to the client in their
  // portal, but never emailed.
  const noteActions: NotesActions = {
    list: () => getTicketNotes(ticketId),
    create: (body, files) => createTicketNote(ticketId, body, files),
    update: updateTicketNote,
    remove: deleteTicketNote,
    addFile: (id, path, name) => addTicketNoteFile({ noteId: id, path, fileName: name }),
    removeFile: deleteTicketNoteFile,
  };

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h4>
      {children}
    </div>
  );

  return (
    <Modal title={title || "פרטי משימה"} onClose={onClose}>
      <div className="space-y-5">
        <Section label="תיאור">
          {description ? (
            <p className="whitespace-pre-wrap text-sm text-slate-800">{description}</p>
          ) : (
            <p className="text-sm text-slate-400">אין תיאור.</p>
          )}
        </Section>

        <Section label="לינקים">
          {links.length ? (
            <div className="space-y-1.5">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Link2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{l}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">אין לינקים.</p>
          )}
        </Section>

        <Section label="קבצים מצורפים">
          {files === null ? (
            <p className="text-sm text-slate-400">טוען…</p>
          ) : files.length ? (
            <div className="space-y-1.5">
              {files.length > 1 && (
                <>
                  <button
                    onClick={downloadAll}
                    disabled={zipping}
                    className="mb-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    <Download className="h-4 w-4 text-white" />{" "}
                    {zipping ? "מכין הורדה…" : `הורדת כל הקבצים (${files.length})`}
                  </button>
                  {zipError && <p className="mb-1 text-xs text-red-600">{zipError}</p>}
                </>
              )}
              {files.map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  download={f.name}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-black" />
                  <span className="truncate">{f.name}</span>
                  <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-xs text-primary">
                    <Download className="h-3.5 w-3.5" /> הורדה
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">אין קבצים.</p>
          )}
        </Section>

        {/* Work time: the logged total, plus a correction control that goes both
            ways — add time the timer never caught, or take back time it counted
            while nobody was working. Either way the task's status is untouched,
            so it doesn't complete and the client gets no email. */}
        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">זמן עבודה</h4>
          <p className="mt-1 text-sm text-slate-700">
            סה״כ תועד:{" "}
            <b className="font-mono tabular-nums">{formatDuration(totalSeconds)}</b>
          </p>

          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-400">
              עדכון הזמן של המשימה — ללא סיום המשימה וללא מייל ללקוח.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {/* Direction first: it decides what the numbers mean, so it reads
                  before them in RTL. */}
              <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                {(
                  [
                    ["add", "הוספה"],
                    ["subtract", "הפחתה"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setAdjustMode(m);
                      setAdjustError(null);
                    }}
                    aria-pressed={adjustMode === m}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition ${
                      adjustMode === m
                        ? "bg-primary text-white"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-1.5 text-sm text-slate-500">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={addH}
                  onChange={(e) => setAddH(e.target.value)}
                  placeholder="0"
                  aria-label="שעות"
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                שעות
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-500">
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  value={addM}
                  onChange={(e) => setAddM(e.target.value)}
                  placeholder="0"
                  aria-label="דקות"
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                דקות
              </label>
              <Button onClick={applyAdjustment} disabled={adjusting || magnitude <= 0 || overdrawn}>
                {adjusting ? "מעדכן…" : "עדכון זמן"}
              </Button>
            </div>

            {/* Result preview — turns "subtract 45m from 5:30" into the number
                the admin actually cares about, and makes an over-reduction
                obvious before the click rather than as an error after it.
                `min="0"` on the inputs only blocks submission, not typing, so a
                negative entry gets its own line: it disables the button, and
                without this the admin would face a dead control and no reason. */}
            {magnitude < 0 ? (
              <p className="text-sm text-red-600">יש להזין מספרים חיוביים ולבחור הוספה או הפחתה.</p>
            ) : (
              magnitude > 0 &&
              (overdrawn ? (
                <p className="text-sm text-red-600">
                  לא ניתן להפחית יותר מהזמן שתועד ({formatDuration(totalSeconds)}).
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  סה״כ אחרי העדכון:{" "}
                  <b className="font-mono tabular-nums text-slate-900">
                    {formatDuration(previewSeconds)}
                  </b>
                </p>
              ))
            )}

            {status === "completed" && (
              <p className="text-xs text-amber-700">
                המשימה כבר הושלמה — הלקוח קיבל מייל עם הזמן המקורי, ועדכון כאן ישנה את
                ניצול השעות בפרויקט מבלי ליידע אותו.
              </p>
            )}

            {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
          </div>
        </div>

        {/* Studio notes + files: shown to the client in their portal (read-only),
            but never emailed. For emailed updates use the conversation thread. */}
        <div className="border-t border-slate-100 pt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            הערות מהסטודיו
          </h4>
          <p className="mb-3 mt-1 text-xs text-slate-400">
            יופיעו ללקוח בלוח הבקרה כשיפתח/תפתח את המשימה — ללא שליחת מייל.
          </p>
          <NotesPanel
            actions={noteActions}
            composerPlaceholder="הערה ללקוח לגבי המשימה… (אפשר גם לצרף קובץ)"
            emptyText="אין עדיין הערות מהסטודיו למשימה זו."
          />
        </div>

        {/* Complete the task (irreversible) — with confirmation + total time. */}
        {status === "completed" ? (
          <p className="border-t border-slate-100 pt-4 text-sm font-medium text-emerald-600">
            המשימה הושלמה ✓ · זמן כולל {formatDuration(totalSeconds)}
          </p>
        ) : (
          <div className="border-t border-slate-100 pt-4">
            {!confirming ? (
              <Button variant="success" onClick={() => setConfirming(true)}>
                ✓ סיום המשימה ועדכון הלקוח
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg bg-emerald-50 p-3">
                <p className="text-sm text-slate-800">
                  לסיים את המשימה ולעדכן את הלקוח במייל? זמן המשימה הכולל:{" "}
                  <b className="font-mono tabular-nums">{formatDuration(totalSeconds)}</b>
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    הערה למייל ללקוח (אופציונלי)
                  </label>
                  <textarea
                    value={completionNote}
                    onChange={(e) => setCompletionNote(e.target.value)}
                    rows={3}
                    placeholder="סיכום קצר שיצורף למייל העדכון ללקוח…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    disabled={completing}
                    onClick={() =>
                      startComplete(async () => {
                        await completeTask(ticketId, completionNote);
                        router.refresh();
                        onClose();
                      })
                    }
                  >
                    {completing ? "מסיים…" : "סיים ועדכן לקוח"}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
