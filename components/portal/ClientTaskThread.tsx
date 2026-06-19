"use client";

import { useEffect, useState } from "react";
import { Link2, FileText } from "@/components/icons";
import { ConversationThread } from "@/components/portal/ConversationThread";
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
  useEffect(() => {
    getMyTaskAttachments(ticketId).then(setFiles);
  }, [ticketId]);

  const links = (link ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hasDetails = !!(description && description.trim()) || links.length > 0 || files.length > 0;

  const header = hasDetails ? (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">מה שהגשת</p>
      {description && description.trim() && (
        <p className="whitespace-pre-wrap text-sm text-slate-700">{description}</p>
      )}
      {links.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {links.map((l, i) => (
            <a key={i} href={l} target="_blank" rel="noopener noreferrer" dir="ltr" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Link2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{l}</span>
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {files.map((f, i) => (
            <a key={i} href={f.url} download={f.name} className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-primary">
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{f.name}</span>
              <span className="text-primary">הורדה</span>
            </a>
          ))}
        </div>
      )}
    </div>
  ) : null;

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
      placeholder="כתוב/י הודעה… (תישלח לצוות ותתועד כאן)"
      closeOnSend
      header={header}
    />
  );
}
