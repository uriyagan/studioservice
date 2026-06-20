"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, X, ArrowRight } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { ConversationThreadBody } from "@/components/portal/ConversationThread";
import {
  getConversations,
  getReadState,
  markTicketRead,
  getTicketMessages,
  sendTicketReply,
  type Conversation,
} from "@/app/actions/messages";
import { formatDate } from "@/lib/format";

// Per-browser "read at" per thread — shared with the tasks table so the unread
// state stays consistent between the inbox and the row/tab dots.
const READS_KEY = "studio.threadReads";
const SOUND_KEY = "studio.inboxSound";

// Merge two read maps, keeping the most-recent read_at per ticket.
const mergeReads = (a: Record<string, number>, b: Record<string, number>) => {
  const m = { ...a };
  for (const k in b) m[k] = Math.max(m[k] ?? 0, b[k]);
  return m;
};

export function InboxWidget() {
  const [open, setOpen] = useState(false);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reads, setReads] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const soundOnRef = useRef(true);
  const lastInboundSeen = useRef(0);
  const initialized = useRef(false);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const persistReads = (nv: Record<string, number>) => {
    try {
      localStorage.setItem(READS_KEY, JSON.stringify(nv));
    } catch {
      /* noop */
    }
    return nv;
  };

  const load = useCallback(() => {
    getConversations().then((list) => {
      setConvos(list);
      // Beep when a newer inbound (client) message appears than we've seen.
      const maxIn = list.reduce(
        (m, c) => (c.lastInboundAt ? Math.max(m, new Date(c.lastInboundAt).getTime()) : m),
        0
      );
      if (!initialized.current) {
        initialized.current = true;
        lastInboundSeen.current = maxIn;
        return;
      }
      if (maxIn > lastInboundSeen.current) {
        lastInboundSeen.current = maxIn;
        if (soundOnRef.current && audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      }
    });
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(READS_KEY);
      if (raw) setReads(JSON.parse(raw));
    } catch {
      /* noop */
    }
    try {
      if (localStorage.getItem(SOUND_KEY) === "off") setSoundOn(false);
    } catch {
      /* noop */
    }
    // Cross-device read state (server is the source of truth once migrated).
    getReadState().then((server) => setReads((prev) => mergeReads(prev, server)));
    load();
    // Poll even when the tab is hidden so the beep still fires from a background
    // tab/window (browsers throttle hidden-tab timers to ~once/min; Realtime
    // below makes it instant when enabled).
    const id = setInterval(() => load(), 20000);

    // Instant refresh on any new message via Supabase Realtime. If the table
    // isn't in the realtime publication this simply never fires — the 20s poll
    // above stays as the fallback, so nothing breaks either way.
    const supabase = createClient();
    const channel = supabase
      .channel("inbox-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => load()
      )
      .subscribe();

    return () => {
      clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Prepare the beep audio and unlock it on the first user interaction
  // (browsers block programmatic audio until the page has been interacted with).
  useEffect(() => {
    const a = new Audio("/notification.mp3");
    a.volume = 0.5;
    audioRef.current = a;
    const unlock = () => {
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
        })
        .catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* noop */
      }
      // Play a confirmation beep when turning it on.
      if (next && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return next;
    });
  };

  const isUnread = (c: Conversation) =>
    c.lastDirection === "in" &&
    !!c.lastInboundAt &&
    new Date(c.lastInboundAt).getTime() > (reads[c.ticketId] ?? 0);

  const unreadCount = convos.filter(isUnread).length;

  const select = (c: Conversation) => {
    setSelectedId(c.ticketId);
    setReads((prev) => persistReads({ ...prev, [c.ticketId]: Date.now() }));
    markTicketRead(c.ticketId);
  };

  const markAllRead = () => {
    setReads((prev) => {
      const nv = { ...prev };
      const now = Date.now();
      convos.forEach((c) => {
        if (isUnread(c)) {
          nv[c.ticketId] = now;
          markTicketRead(c.ticketId);
        }
      });
      return persistReads(nv);
    });
  };

  const q = query.trim().toLowerCase();
  const filtered = convos.filter((c) => {
    if (unreadOnly && !isUnread(c)) return false;
    if (!q) return true;
    return (
      c.clientName.toLowerCase().includes(q) ||
      c.taskTitle.toLowerCase().includes(q) ||
      c.projectName.toLowerCase().includes(q)
    );
  });

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
            <div className="flex items-center gap-1">
              <button
                onClick={toggleSound}
                className="rounded p-2 text-lg leading-none hover:bg-slate-100"
                title={soundOn ? "התראת צליל פעילה" : "התראת צליל כבויה"}
                aria-label="התראת צליל"
              >
                {soundOn ? "🔔" : "🔕"}
              </button>
              <button onClick={() => setOpen(false)} className="rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="סגור">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Conversations list */}
            <div className={`${selectedId ? "hidden" : "flex"} w-full flex-col sm:flex sm:w-72 sm:border-e sm:border-slate-100`}>
              {/* Search / filter toolbar */}
              <div className="shrink-0 space-y-2 border-b border-slate-100 p-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="חיפוש לפי לקוח או משימה…"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={unreadOnly}
                      onChange={(e) => setUnreadOnly(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-primary"
                    />
                    הצג רק הודעות שטרם נקראו
                  </label>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                      סמן הכל כנקרא
                    </button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
              {convos.length === 0 && (
                <p className="p-4 text-sm text-slate-400">אין שיחות עדיין.</p>
              )}
              {convos.length > 0 && filtered.length === 0 && (
                <p className="p-4 text-sm text-slate-400">לא נמצאו שיחות תואמות.</p>
              )}
              {filtered.map((c) => {
                const unread = isUnread(c);
                return (
                  <button
                    key={c.ticketId}
                    onClick={() => select(c)}
                    className={`flex w-full flex-col gap-0.5 border-b border-slate-50 px-4 py-3 text-start hover:bg-slate-50 ${
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
