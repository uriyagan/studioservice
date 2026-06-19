"use client";

import { useEffect, useState, useId } from "react";
import { X, Paperclip, Link2, Loader2, FileText, CheckCircle2, AlertCircle } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import {
  ThreadMessage,
  recordMessageAttachment,
} from "@/app/actions/messages";
import { formatDate } from "@/lib/format";

type SendResult = { ok: boolean; error?: string; messageId?: string };

// Shared conversation view + composer (message, links, files), used by
// both the client portal and the admin area. `mineDirection` decides
// which side of each bubble the current viewer's messages sit on.
export function ConversationThread({
  ticketId,
  title,
  onClose,
  load,
  send,
  mineDirection,
  mineLabel,
  otherLabel,
  placeholder,
  closeOnSend = false,
  header,
}: {
  ticketId: string;
  title: string;
  onClose: () => void;
  load: (ticketId: string) => Promise<ThreadMessage[]>;
  send: (prev: SendResult, formData: FormData) => Promise<SendResult>;
  mineDirection: "in" | "out";
  mineLabel: string;
  otherLabel: string;
  placeholder: string;
  closeOnSend?: boolean;
  header?: React.ReactNode;
}) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [text, setText] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fileStates, setFileStates] = useState<Record<number, "pending" | "up" | "done" | "err">>({});
  const fileInputId = useId();

  const reload = () => load(ticketId).then(setMessages);
  useEffect(() => {
    reload();
    // Keep the open conversation current (new replies from the other side).
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const addFiles = (list: FileList | null) => {
    if (list) setFiles((p) => [...p, ...Array.from(list)]);
  };

  async function handleSend() {
    const cleanLinks = links.map((l) => l.trim()).filter(Boolean);
    if (!text.trim() && !cleanLinks.length && !files.length) return;
    setError(null);
    setBusy(true);
    setPhase("שולח...");
    setFileStates(Object.fromEntries(files.map((_, i) => [i, "pending" as const])));

    const fd = new FormData();
    fd.set("ticket_id", ticketId);
    fd.set("message", text);
    cleanLinks.forEach((l) => fd.append("link", l));
    fd.set("file_count", String(files.length));

    const res = await send({ ok: false }, fd);
    // The message itself succeeded if ok is true — even if messageId is
    // missing (a logging hiccup), the email still went out, so don't report
    // a failure that tempts a duplicate resend.
    if (!res.ok) {
      setError(res.error ?? "שליחה נכשלה");
      setBusy(false);
      setPhase("");
      return;
    }
    if (files.length && !res.messageId) {
      setError("ההודעה נשלחה, אך לא ניתן לצרף כעת את הקבצים. נסה/י לשלוח אותם בהודעה נפרדת.");
      setBusy(false);
      setPhase("");
      return;
    }

    // Upload files against the new message.
    const supabase = createClient();
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setPhase(`מעלה קבצים (${i + 1}/${files.length})...`);
      setFileStates((s) => ({ ...s, [i]: "up" }));
      try {
        const r = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId, fileName: file.name }),
        });
        if (!r.ok) throw new Error("signed url failed");
        const { path, token } = await r.json();
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .uploadToSignedUrl(path, token, file);
        if (upErr) throw upErr;
        const rec = await recordMessageAttachment({ messageId: res.messageId!, ticketId, path, fileName: file.name });
        if (!rec.ok) throw new Error(rec.error || "record failed");
        setFileStates((s) => ({ ...s, [i]: "done" }));
      } catch {
        failed++;
        setFileStates((s) => ({ ...s, [i]: "err" }));
      }
    }
    if (failed > 0) {
      setError(`ההודעה נשלחה, אך העלאת ${failed} קבצים נכשלה.`);
      setBusy(false);
      setPhase("");
      return; // keep the window open so the failure is visible
    }

    setText("");
    setLinks([]);
    setFiles([]);
    setFileStates({});
    setBusy(false);
    setPhase("");
    if (closeOnSend) onClose();
    else reload();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <Modal title={`שיחה — ${title || "ללא שם"}`} onClose={onClose}>
      {header}
      <div className="mb-4 max-h-[42vh] space-y-3 overflow-y-auto">
        {messages === null && <p className="text-sm text-slate-400">טוען…</p>}
        {messages?.length === 0 && (
          <p className="text-sm text-slate-400">אין עדיין הודעות בשיחה זו.</p>
        )}
        {messages?.map((m) => {
          const mine = m.direction === mineDirection;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  mine ? "bg-primary-light text-slate-900" : "bg-slate-100 text-slate-800"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-medium">{mine ? mineLabel : otherLabel}</span>
                  <span>·</span>
                  <span>{formatDate(m.created_at)}</span>
                </div>
                {m.body_text && <div className="whitespace-pre-wrap">{m.body_text}</div>}
                {m.links.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.links.map((l, i) => (
                      <a
                        key={i}
                        href={l}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l}</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.attachments.map((a, i) => (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-md bg-white/70 px-2 py-1 text-xs text-slate-700 hover:bg-white"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{a.name}</span>
                      </a>
                    ))}
                  </div>
                )}
                {!m.body_text && !m.links.length && !m.attachments.length && (
                  <div className="text-slate-400">(הודעה מעוצבת — נשלחה במייל)</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className={inputCls}
        />

        {/* Links */}
        {links.map((val, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="url"
              value={val}
              onChange={(e) => setLinks((p) => p.map((l, idx) => (idx === i ? e.target.value : l)))}
              placeholder="https://"
              dir="ltr"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              title="הסר"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Selected files */}
        {files.length > 0 && (
          <>
          <p className="text-xs font-medium text-slate-500">{files.length} קבצים מצורפים</p>
          <ul className="space-y-1.5">
            {files.map((f, i) => {
              const st = fileStates[i];
              return (
                <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {st === "up" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                    {st === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                    {st === "err" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    <span className="min-w-0 truncate text-slate-700">{f.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {st && (
                      <span className="text-xs text-slate-400">
                        {st === "up" ? "מעלה…" : st === "done" ? "הועלה ✓" : st === "err" ? "נכשל" : "ממתין"}
                      </span>
                    )}
                    {!busy && (
                      <button
                        type="button"
                        onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        title="הסר"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center gap-2">
          <Button onClick={handleSend} disabled={busy}>
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase || "שולח…"}
              </span>
            ) : (
              "שליחת הודעה"
            )}
          </Button>
          <button
            type="button"
            onClick={() => setLinks((p) => [...p, ""])}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            title="הוספת לינק"
          >
            <Link2 className="h-4 w-4" /> לינק
          </button>
          <input
            id={fileInputId}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <label
            htmlFor={fileInputId}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            title="צירוף קובץ"
          >
            <Paperclip className="h-4 w-4" /> קובץ
          </label>
        </div>
      </div>
    </Modal>
  );
}
