"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, X, ArrowRight } from "@/components/icons";
import { ConversationThreadBody } from "@/components/portal/ConversationThread";
import {
  getConversations,
  getTicketMessages,
  sendTicketReply,
  type Conversation,
} from "@/app/actions/messages";
import { formatDate } from "@/lib/format";

// Per-browser "read at" per thread — shared with the tasks table so the unread
// state stays consistent between the inbox and the row/tab dots.
const READS_KEY = "studio.threadReads";

export function InboxWidget() {
  const [open, setOpen] = useState(false);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reads, setReads] = useState<Record<string, number>>({});

  const load = useCallback(() => {
    getConversations().then(setConvos);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(READS_KEY);
      if (raw) setReads(JSON.parse(raw));
    } catch {
      /* noop */
    }
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const isUnread = (c: Conversation) =>
    c.lastDirection === "in" &&
    !!c.lastInboundAt &&
    new Date(c.lastInboundAt).getTime() > (reads[c.ticketId] ?? 0);

  const unreadCount = convos.filter(isUnread).length;

  const select = (c: Conversation) => {
    setSelectedId(c.ticketId);
    setReads((prev) => {
      const nv = { ...prev, [c.ticketId]: Date.now() };
      try {
        localStorage.setItem(READS_KEY, JSON.stringify(nv));
      } catch {
        /* noop */
      }
      return nv;
    });
  };

  const selected = convos.find((c) => c.ticketId === selectedId) ?? null;

  return (
    <>
      {/* Bubble */}
      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            load();
          }}
          aria-label="הודעות"
          className="fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition hover:brightness-110"
        >
          <MessageSquare className="h-6 w-6 text-white" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white ring-2 ring-white">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:left-5 sm:h-[560px] sm:max-h-[calc(100vh-2.5rem)] sm:w-[760px] sm:max-w-[calc(100vw-2.5rem)]" dir="rtl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="font-semibold text-slate-900">הודעות</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{unreadCount}</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="סגור">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Conversations list */}
            <div className={`${selectedId ? "hidden" : "flex"} w-full flex-col overflow-y-auto sm:flex sm:w-72 sm:border-e sm:border-slate-100`}>
              {convos.length === 0 && (
                <p className="p-4 text-sm text-slate-400">אין שיחות עדיין.</p>
              )}
              {convos.map((c) => {
                const unread = isUnread(c);
                return (
                  <button
                    key={c.ticketId}
                    onClick={() => select(c)}
                    className={`flex flex-col gap-0.5 border-b border-slate-50 px-4 py-3 text-start hover:bg-slate-50 ${
                      selectedId === c.ticketId ? "bg-slate-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-semibold text-slate-900">{c.clientName}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {unread && <span className="h-2.5 w-2.5 rounded-full bg-red-500" />}
                        <span className="text-[11px] text-slate-400">{formatDate(c.lastMessageAt)}</span>
                      </span>
                    </div>
                    {c.taskTitle && (
                      <span className="truncate text-xs text-slate-500">{c.taskTitle}</span>
                    )}
                    <span className={`truncate text-xs ${unread ? "font-medium text-slate-700" : "text-slate-400"}`}>
                      {c.lastDirection === "out" ? "את/ה: " : ""}
                      {c.preview}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Thread */}
            <div className={`${selectedId ? "flex" : "hidden"} min-w-0 flex-1 flex-col sm:flex`}>
              {selected ? (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                    <button onClick={() => setSelectedId(null)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 sm:hidden" aria-label="חזרה">
                      <ArrowRight className="h-5 w-5" />
                    </button>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{selected.clientName}</div>
                      <div className="truncate text-xs text-slate-500">
                        {selected.taskTitle}
                        {selected.projectName ? ` · ${selected.projectName}` : ""}
                      </div>
                    </div>
                  </div>
                  <ConversationThreadBody
                    key={selected.ticketId}
                    ticketId={selected.ticketId}
                    load={getTicketMessages}
                    send={sendTicketReply}
                    mineDirection="out"
                    mineLabel="סטודיו"
                    otherLabel={selected.clientName}
                    placeholder="כתוב תשובה ללקוח…"
                    fill
                    onAfterSend={load}
                  />
                </>
              ) : (
                <div className="hidden flex-1 items-center justify-center p-6 text-sm text-slate-400 sm:flex">
                  בחר שיחה מהרשימה כדי להשיב
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
