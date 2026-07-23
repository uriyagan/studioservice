"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Link2, FileText, Download, Trash2 } from "@/components/icons";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { showToast } from "@/components/ui/Toast";
import { RowTimerControl } from "@/components/admin/RowTimerControl";
import { NotesPanel, type NotesActions } from "@/components/admin/NotesPanel";
import { ConversationThreadBody } from "@/components/portal/ConversationThread";
import { getTicketMessages, sendTicketReply, getTaskAttachments, markTicketRead } from "@/app/actions/messages";
import {
  getTicketNotes,
  createTicketNote,
  updateTicketNote,
  deleteTicketNote,
  addTicketNoteFile,
  deleteTicketNoteFile,
} from "@/app/actions/ticket-notes";
import { updateTicket, deleteTicket } from "@/app/actions/admin";
import { completeTask, adjustTaskTime } from "@/app/actions/timer";
import { downloadAllAsZip } from "@/lib/download-files";
import { formatDate, formatDuration } from "@/lib/format";
import { useLoggedSeconds } from "@/lib/use-logged-seconds";
import type { AdminOption, Ticket, TicketStatus, TimeLog } from "@/lib/types";

export interface TaskPageData {
  id: string;
  title: string | null;
  description: string | null;
  link: string | null;
  status: TicketStatus;
  created_at: string;
  project_id: string | null;
  projectName: string;
  clientName: string;
  openedByName: string;
  assignee_id: string | null;
  time_logs: TimeLog[];
}

const READS_KEY = "studio.threadReads";

// The one task workspace. Two fixed rows up top — a read-only info row and an
// interactive work row — then the task content (right) beside the client
// conversation (left). Replaces the old details/thread/edit modal trio.
export function TaskPageView({
  task,
  admins,
  currentUserId,
}: {
  task: TaskPageData;
  admins: AdminOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const completed = task.status === "completed";
  const totalSeconds = useLoggedSeconds(task.time_logs);
  const running = task.time_logs.some((l) => l.end_time === null);

  // Entering the page = reading the conversation. Server state (cross-device)
  // + the local cache the tasks table and inbox read for their dots.
  useEffect(() => {
    markTicketRead(task.id);
    try {
      const raw = localStorage.getItem(READS_KEY);
      const reads = raw ? JSON.parse(raw) : {};
      reads[task.id] = Date.now();
      localStorage.setItem(READS_KEY, JSON.stringify(reads));
    } catch {
      /* noop */
    }
  }, [task.id]);

  // ── assignee (inline edit) ─────────────────────────────────
  const [savingAssignee, startAssignee] = useTransition();
  const [assigneeError, setAssigneeError] = useState<string | null>(null);
  const changeAssignee = (val: string) => {
    setAssigneeError(null);
    startAssignee(async () => {
      const fd = new FormData();
      fd.set("id", task.id);
      fd.set("title", task.title ?? "");
      fd.set("project_id", task.project_id ?? "");
      fd.set("description", task.description ?? "");
      fd.set("assignee_id", val);
      const r = await updateTicket({ ok: false }, fd);
      if (r.ok) showToast("האחראי עודכן");
      else setAssigneeError(r.error ?? "עדכון האחראי נכשל");
    });
  };

  // ── manual time adjustment (accordion) ─────────────────────
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"add" | "subtract">("add");
  const [addH, setAddH] = useState("");
  const [addM, setAddM] = useState("");
  const [adjusting, startAdjust] = useTransition();
  const [adjustError, setAdjustError] = useState<string | null>(null);
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
      const r = await adjustTaskTime(task.id, delta);
      if (!r.ok) {
        setAdjustError(r.error ?? "עדכון הזמן נכשל");
        return;
      }
      setAddH("");
      setAddM("");
      setAdjustOpen(false);
      showToast("זמן המשימה עודכן");
    });
  };

  // ── complete task ──────────────────────────────────────────
  const [confirming, setConfirming] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [completing, startComplete] = useTransition();
  const confirmComplete = () =>
    startComplete(async () => {
      await completeTask(task.id, completionNote);
      setConfirming(false);
      setCompletionNote("");
      showToast("המשימה הושלמה והלקוח עודכן במייל");
    });

  // ── delete (trash icon → in-app confirm modal) ─────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();
  const doDelete = () =>
    startDelete(async () => {
      setDeleteError(null);
      const fd = new FormData();
      fd.set("id", task.id);
      fd.set("project_id", task.project_id ?? "");
      const r = await deleteTicket({ ok: false }, fd);
      if (!r.ok) {
        setDeleteError(r.error ?? "מחיקת המשימה נכשלה");
        return;
      }
      showToast("המשימה נמחקה");
      router.push("/admin");
    });

  // ── client-submitted files ─────────────────────────────────
  const [files, setFiles] = useState<{ name: string; url: string }[] | null>(null);
  useEffect(() => {
    getTaskAttachments(task.id).then(setFiles);
  }, [task.id]);
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const downloadAll = async () => {
    if (zipping) return;
    setZipping(true);
    setZipError(null);
    const { ok, failed } = await downloadAllAsZip(files ?? []);
    if (!ok) setZipError(failed.length ? `לא ניתן היה להוריד ${failed.length} קבצים` : "ההורדה נכשלה");
    setZipping(false);
  };

  // ── internal log (admins only — never shown to the client) ─
  const noteActions: NotesActions = {
    list: () => getTicketNotes(task.id),
    create: (body, noteFiles) => createTicketNote(task.id, body, noteFiles),
    update: updateTicketNote,
    remove: deleteTicketNote,
    addFile: (id, path, name) => addTicketNoteFile({ noteId: id, path, fileName: name }),
    removeFile: deleteTicketNoteFile,
  };

  // ── mobile tabs ────────────────────────────────────────────
  const [tab, setTab] = useState<"task" | "chat">("task");

  const links = (task.link ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const timerTicket: Ticket = {
    id: task.id,
    project_id: task.project_id,
    title: task.title,
    description: task.description,
    link: task.link,
    status: task.status,
    created_at: task.created_at,
    completed_at: null,
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</h3>
  );

  return (
    <div className="space-y-4">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowRight className="h-4 w-4" /> חזרה למשימות
      </Link>

      {/* ── header card: info row + work row ─────────────────── */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* Row 1 — static info. Nothing here is editable: it's what the client
            submitted, plus where/when. */}
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="break-words text-xl font-bold text-slate-900">
                {task.title || <span className="italic text-slate-400">ללא שם</span>}
              </h1>
              <StatusBadge status={task.status} />
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {task.projectName && (
                <>
                  פרויקט:{" "}
                  {task.project_id ? (
                    <Link href={`/admin/projects/${task.project_id}`} className="font-medium text-slate-700 hover:text-primary hover:underline">
                      {task.projectName}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-700">{task.projectName}</span>
                  )}
                  <span className="mx-1.5 text-slate-300">·</span>
                </>
              )}
              {task.clientName && (
                <>
                  לקוח: <span className="font-medium text-slate-700">{task.clientName}</span>
                  {task.openedByName && <span className="text-slate-400"> (פתח/ה: {task.openedByName})</span>}
                  <span className="mx-1.5 text-slate-300">·</span>
                </>
              )}
              הוגשה: <span className="font-medium text-slate-700">{formatDate(task.created_at)}</span>
            </p>
          </div>

          {/* Delete — straight to the confirm modal (admins are trusted, and
              the modal is the safety net). */}
          <button
            onClick={() => setConfirmDelete(true)}
            title="מחיקת המשימה"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        {/* Row 2 — the work row: everything interactive, visually distinct. */}
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-slate-500">
              אחראי
              <select
                value={task.assignee_id ?? ""}
                onChange={(e) => changeAssignee(e.target.value)}
                disabled={savingAssignee}
                dir="rtl"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">ללא אחראי</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id === currentUserId ? `${a.name} (אני)` : a.name}
                  </option>
                ))}
              </select>
            </label>

            <span className="hidden h-6 w-px bg-slate-200 sm:block" />

            <div className="flex items-center gap-2.5">
              <span className="text-sm text-slate-500">טיימר</span>
              <span
                className={`text-base font-bold tabular-nums ${running ? "text-emerald-600" : "text-slate-800"}`}
              >
                {formatDuration(totalSeconds)}
              </span>
              {!completed && <RowTimerControl ticket={timerTicket} />}
              <button
                onClick={() => setAdjustOpen((v) => !v)}
                aria-expanded={adjustOpen}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                עריכת זמן ידנית {adjustOpen ? "▴" : "▾"}
              </button>
            </div>
          </div>

          {completed ? (
            <p className="text-sm font-medium text-emerald-600">המשימה הושלמה ✓</p>
          ) : (
            <Button variant="success" onClick={() => setConfirming(true)}>
              ✓ סיום ועדכון לקוח
            </Button>
          )}
        </div>

        {/* Manual time accordion — status untouched, no client email. */}
        {adjustOpen && (
          <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
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
                      adjustMode === m ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
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
                {adjusting ? "מעדכנים…" : "עדכון זמן"}
              </Button>
            </div>

            {magnitude > 0 &&
              (overdrawn ? (
                <p className="text-sm text-red-600">
                  לא ניתן להפחית יותר מהזמן שתועד ({formatDuration(totalSeconds)}).
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  סה״כ אחרי העדכון:{" "}
                  <b className="font-mono tabular-nums text-slate-900">{formatDuration(previewSeconds)}</b>
                </p>
              ))}
            <p className="text-xs text-slate-400">העדכון אינו מסיים את המשימה ואינו שולח מייל ללקוח.</p>
            {completed && (
              <p className="text-xs text-amber-700">
                המשימה כבר הושלמה — הלקוח קיבל מייל עם הזמן המקורי, ועדכון כאן ישנה את ניצול השעות
                בפרויקט מבלי ליידע אותו.
              </p>
            )}
            {adjustError && <p className="text-sm text-red-600">{adjustError}</p>}
          </div>
        )}
        {assigneeError && (
          <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">{assigneeError}</p>
        )}
      </div>

      {/* ── mobile tabs ──────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200 lg:hidden">
        {(
          [
            ["task", "המשימה"],
            ["chat", "שיחה עם הלקוח"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
              tab === key ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── content columns: task (right) · conversation (left) ── */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className={`space-y-4 ${tab === "task" ? "" : "hidden"} lg:block`}>
          {/* What the client submitted — read-only. */}
          <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="text-sm font-bold text-slate-900">המשימה</h2>
            <div>
              <SectionLabel>תיאור</SectionLabel>
              {task.description ? (
                <p className="whitespace-pre-wrap text-sm text-slate-800">{task.description}</p>
              ) : (
                <p className="text-sm text-slate-400">אין תיאור.</p>
              )}
            </div>
            <div>
              <SectionLabel>לינקים</SectionLabel>
              {links.length ? (
                <div className="space-y-1.5">
                  {links.map((l, i) => (
                    <a key={i} href={l} target="_blank" rel="noopener noreferrer" dir="ltr" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Link2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">{l}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">אין לינקים.</p>
              )}
            </div>
            <div>
              <SectionLabel>קבצים מצורפים</SectionLabel>
              {files === null ? (
                <p className="text-sm text-slate-400">בטעינה…</p>
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
                        {zipping ? "מכינים הורדה…" : `הורדת כל הקבצים (${files.length})`}
                      </button>
                      {zipError && <p className="mb-1 text-xs text-red-600">{zipError}</p>}
                    </>
                  )}
                  {files.map((f, i) => (
                    <a key={i} href={f.url} download={f.name} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
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
            </div>
          </div>

          {/* Internal log — admins only. */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">תיעוד פנימי 🔒</h2>
            <p className="mb-3 mt-1 text-xs text-slate-400">
              לאדמינים בלבד — הלקוח לא רואה ושום דבר לא נשלח. עדכונים ללקוח נשלחים דרך השיחה.
            </p>
            <NotesPanel
              actions={noteActions}
              composerPlaceholder="תיעוד התקדמות, החלטות, קבצי עבודה… (אפשר גם לצרף קובץ)"
              emptyText="אין עדיין תיעוד פנימי למשימה זו."
            />
          </div>
        </div>

        {/* Conversation — always beside the task on desktop. */}
        <div className={`rounded-xl border border-slate-200 bg-white ${tab === "chat" ? "" : "hidden"} lg:block`}>
          <h2 className="border-b border-slate-100 p-4 text-sm font-bold text-slate-900 sm:px-5">
            שיחה עם הלקוח
            <span className="ms-2 text-xs font-normal text-slate-400">הודעות נשלחות ללקוח במייל ומתועדות כאן</span>
          </h2>
          <div className="flex h-[65vh] min-h-[420px] flex-col lg:h-[560px]">
            <ConversationThreadBody
              ticketId={task.id}
              load={getTicketMessages}
              send={sendTicketReply}
              mineDirection="out"
              mineLabel="אנחנו"
              otherLabel="לקוח"
              placeholder="כתיבת תשובה ללקוח… (תישלח במייל ותתועד כאן)"
              onAfterSend={() => showToast("ההודעה נשלחה ללקוח")}
              fill
            />
          </div>
        </div>
      </div>

      {/* Delete confirmation — irreversible, so an explicit modal. */}
      {confirmDelete && (
        <Modal title="מחיקת המשימה" onClose={() => setConfirmDelete(false)} closeOnBackdrop={false}>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              למחוק את המשימה <b>&quot;{task.title || "ללא שם"}&quot;</b>? הזמן שתועד, השיחה
              והקבצים יימחקו לצמיתות.
            </p>
            {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-2">
              <Button variant="danger" disabled={deleting} onClick={doDelete}>
                {deleting ? "מוחקים…" : "מחיקה לצמיתות"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                ביטול
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Complete-task confirmation (irreversible → modal + optional note). */}
      {confirming && (
        <Modal title="סיום המשימה ועדכון הלקוח" onClose={() => setConfirming(false)} closeOnBackdrop={false}>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              המשימה תסומן כהושלמה והלקוח יקבל עדכון במייל. זמן המשימה הכולל:{" "}
              <b className="font-mono tabular-nums">{formatDuration(totalSeconds)}</b>
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">הערה למייל ללקוח (אופציונלי)</label>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                rows={3}
                placeholder="סיכום קצר שיצורף למייל העדכון ללקוח…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="success" disabled={completing} onClick={confirmComplete}>
                {completing ? "מסיימים…" : "סיום ועדכון לקוח"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={completing}>
                ביטול
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
