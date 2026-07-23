"use client";

import { useEffect, useState } from "react";
import { Link2, FileText, Eye, ChevronDown } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { ClientStatusBadge } from "@/components/ui/Badge";
import { showToast } from "@/components/ui/Toast";
import { isImageFile, ImageViewerModal } from "@/components/ui/ImageViewer";
import { ConversationThreadBody } from "@/components/portal/ConversationThread";
import { getMyTicketMessages, sendClientReply, getMyTaskAttachments } from "@/app/actions/messages";
import { formatDate, formatDurationShort, formatRelativeDay } from "@/lib/format";
import { PortalTask } from "@/components/portal/types";

// The client's task modal: fixed header (title, status, meta), one scroll
// area holding the collapsible original task + the chat thread (opens at the
// latest message), and a composer pinned to the bottom.
// "in" = sent by the client (me).
export function ClientTaskThread({
  task,
  multiProject,
  onClose,
}: {
  task: PortalTask;
  multiProject: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [viewing, setViewing] = useState<{ name: string; url: string } | null>(null);
  // Original task: expanded when there's no conversation yet, collapsed to a
  // single row once there is one — the chat gets the room.
  const [showTask, setShowTask] = useState(task.msgCount === 0);
  useEffect(() => {
    getMyTaskAttachments(task.id).then(setFiles);
  }, [task.id]);

  const links = (task.link ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hasDetails = !!(task.description && task.description.trim()) || links.length > 0 || files.length > 0;

  const meta = (
    <>
      {multiProject && task.projectName && <>{task.projectName} · </>}
      הוגשה {formatDate(task.created_at)} · זמן ביצוע{" "}
      <span className="tabular-nums">{formatDurationShort(task.seconds)}</span>
      {task.lastActivityAt && <> · עדכון אחרון {formatRelativeDay(task.lastActivityAt)}</>}
    </>
  );

  const originalTask = (
    <div className="mb-1 rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => setShowTask((v) => !v)}
        aria-expanded={showTask}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          המשימה המקורית
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${showTask ? "rotate-180" : ""}`}
        />
      </button>
      {showTask && (
        <div className="space-y-1.5 border-t border-slate-100 px-3 py-2.5">
          {task.description && task.description.trim() ? (
            <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>
          ) : (
            !hasDetails && <p className="text-sm text-slate-400">ללא פירוט נוסף.</p>
          )}
          {links.length > 0 && (
            <div className="space-y-1">
              {links.map((l, i) => (
                <a key={i} href={l} target="_blank" rel="noopener noreferrer" dir="ltr" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{l}</span>
                </a>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) =>
                isImageFile(f.name) ? (
                  // Image: name + צפייה open the viewer; only הורדה downloads.
                  <div key={i} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <button
                      onClick={() => setViewing(f)}
                      className="flex min-w-0 items-center gap-1.5 text-start hover:text-primary"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-black" />
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      onClick={() => setViewing(f)}
                      className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5" /> צפייה
                    </button>
                    <a href={f.url} download={f.name} className="ms-[10px] shrink-0 text-primary hover:underline">
                      הורדה
                    </a>
                  </div>
                ) : (
                  <a key={i} href={f.url} download={f.name} className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-primary">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-black" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-primary">הורדה</span>
                  </a>
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const topContent = (
    <>
      {originalTask}
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-slate-200" />
        <p className="shrink-0 text-xs font-medium text-slate-500">תכתובת עם הסטודיו</p>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </>
  );

  return (
    <Modal
      title={task.title || "ללא שם"}
      titleAddon={<ClientStatusBadge status={task.clientStatus} />}
      subtitle={meta}
      onClose={onClose}
      fill
    >
      <div className="flex min-h-[55vh] flex-1 flex-col overflow-hidden">
        <ConversationThreadBody
          ticketId={task.id}
          load={getMyTicketMessages}
          send={sendClientReply}
          mineDirection="in"
          mineLabel="אני"
          otherLabel="הסטודיו"
          placeholder="כתיבת הודעה… (תישלח לצוות ותתועד כאן)"
          onAfterSend={() => showToast("ההודעה נשלחה בהצלחה")}
          topContent={topContent}
          fill
        />
      </div>

      {viewing && (
        <ImageViewerModal name={viewing.name} url={viewing.url} onClose={() => setViewing(null)} />
      )}
    </Modal>
  );
}
