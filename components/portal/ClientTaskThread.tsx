"use client";

import { useEffect, useState } from "react";
import { Link2, FileText, Eye } from "@/components/icons";
import { ConversationThread } from "@/components/portal/ConversationThread";
import { showToast } from "@/components/ui/Toast";
import { isImageFile, ImageViewerModal } from "@/components/ui/ImageViewer";
import { getMyTicketMessages, sendClientReply, getMyTaskAttachments } from "@/app/actions/messages";

// Client-side conversation. "in" = sent by the client (me).
export function ClientTaskThread({
  ticketId,
  title,
  description,
  link,
  onClose,
}: {
  ticketId: string;
  title: string;
  description?: string | null;
  link?: string | null;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [viewing, setViewing] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => {
    getMyTaskAttachments(ticketId).then(setFiles);
  }, [ticketId]);

  const links = (link ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hasDetails = !!(description && description.trim()) || links.length > 0 || files.length > 0;

  const header = (
    <>
      {/* The original task — deliberately NOT styled like a chat bubble, so
          it reads as the submitted task itself rather than a message. */}
      <div className="mb-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">המשימה המקורית</p>
        <p className="text-base font-semibold text-slate-900">{title || "ללא שם"}</p>
        {hasDetails && (
          <div className="mt-2 space-y-1.5">
            {description && description.trim() && (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{description}</p>
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

      {/* Visual break between the original task and the chat-styled thread. */}
      <div className="mb-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <p className="shrink-0 text-xs font-medium text-slate-500">תכתובת עם הסטודיו בנוגע למשימה זו</p>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      {viewing && (
        <ImageViewerModal name={viewing.name} url={viewing.url} onClose={() => setViewing(null)} />
      )}
    </>
  );

  return (
    <ConversationThread
      ticketId={ticketId}
      title={title}
      onClose={onClose}
      load={getMyTicketMessages}
      send={sendClientReply}
      mineDirection="in"
      mineLabel="אני"
      otherLabel="הסטודיו"
      placeholder="כתיבת הודעה… (תישלח לצוות ותתועד כאן)"
      closeOnSend
      onSent={() => showToast("ההודעה נשלחה בהצלחה")}
      header={header}
    />
  );
}
