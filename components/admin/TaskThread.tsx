"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getTicketMessages, sendTicketReply, ThreadMessage } from "@/app/actions/messages";
import { formatDate } from "@/lib/format";

export function TaskThread({
  ticketId,
  title,
  onClose,
}: {
  ticketId: string;
  title: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();

  const load = () => getTicketMessages(ticketId).then(setMessages);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const send = () => {
    if (!reply.trim()) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("ticket_id", ticketId);
      fd.set("message", reply);
      const r = await sendTicketReply({ ok: false }, fd);
      if (r.ok) {
        setReply("");
        load();
      } else {
        setError(r.error || "שליחה נכשלה");
      }
    });
  };

  return (
    <Modal title={`שיחה — ${title || "ללא שם"}`} onClose={onClose}>
      <div className="mb-4 max-h-[45vh] space-y-3 overflow-y-auto">
        {messages === null && <p className="text-sm text-slate-400">טוען…</p>}
        {messages?.length === 0 && <p className="text-sm text-slate-400">אין עדיין הודעות בשיחה זו.</p>}
        {messages?.map((m) => {
          const out = m.direction === "out";
          return (
            <div key={m.id} className={`flex ${out ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-lg p-3 text-sm ${out ? "bg-slate-100 text-slate-800" : "bg-primary-light text-slate-900"}`}>
                <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-medium">{out ? "אנחנו" : m.from_email || "לקוח"}</span>
                  <span>·</span>
                  <span>{formatDate(m.created_at)}</span>
                </div>
                {m.subject && <div className="font-medium">{m.subject}</div>}
                <div className="whitespace-pre-wrap">{m.body_text || "(הודעה מעוצבת — נשלחה במייל)"}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          placeholder="כתוב/י תשובה ללקוח… (תישלח במייל ותתועד כאן)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={send} disabled={sending}>
          {sending ? "שולח…" : "שליחת תשובה"}
        </Button>
      </div>
    </Modal>
  );
}
