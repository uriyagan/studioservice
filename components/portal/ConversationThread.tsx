"use client";

import { useEffect, useState, useId } from "react";
import { X, Paperclip, Link2, Loader2, FileText, CheckCircle2, AlertCircle } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { ThreadMessage, recordMessageAttachment } from "@/app/actions/messages";
import { formatDate } from "@/lib/format";

type SendResult = { ok: boolean; error?: string; messageId?: string };

type Upload = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  path?: string;
};

// Shared conversation view + composer (message, links, files). Files upload to
// Storage the moment they're chosen; on send they're linked to the new message.
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
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputId = useId();

  const reload = () => load(ticketId).then(setMessages);
  useEffect(() => {
    reload();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 12000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const setUp = (id: string, patch: Partial<Upload>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const uploadOne = async (u: Upload) => {
    try {
      const r = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, fileName: u.file.name }),
      });
      if (!r.ok) throw new Error("signed url failed");
      const { path, token } = await r.json();
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("attachments")
        .uploadToSignedUrl(path, token, u.file);
      if (upErr) throw upErr;
      setUp(u.id, { status: "done", path });
    } catch {
      setUp(u.id, { status: "error" });
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const fresh: Upload[] = Array.from(list).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "uploading",
    }));
    setUploads((prev) => [...prev, ...fresh]);
    fresh.forEach(uploadOne);
  };
  const removeFile = (id: string) => setUploads((prev) => prev.filter((u) => u.id !== id));
  const retry = (u: Upload) => {
    setUp(u.id, { status: "uploading" });
    uploadOne(u);
  };

  const uploading = uploads.some((u) => u.status === "uploading");

  async function handleSend() {
    const cleanLinks = links.map((l) => l.trim()).filter(Boolean);
    if (!text.trim() && !cleanLinks.length && !uploads.length) return;
    setError(null);
    setBusy(true);

    const fd = new FormData();
    fd.set("ticket_id", ticketId);
    fd.set("message", text);
    cleanLinks.forEach((l) => fd.append("link", l));
    fd.set("file_count", String(uploads.length));

    const res = await send({ ok: false }, fd);
    if (!res.ok) {
      setError(res.error ?? "שליחה נכשלה");
      setBusy(false);
      return;
    }
    if (uploads.length && !res.messageId) {
      setError("ההודעה נשלחה, אך לא ניתן לצרף כעת את הקבצים. נסה/י לשלוח אותם בהודעה נפרדת.");
      setBusy(false);
      return;
    }

    // Link the already-uploaded files to the new message (no re-upload).
    let failed = 0;
    for (const u of uploads) {
      if (u.status === "done" && u.path) {
        const rec = await recordMessageAttachment({ messageId: res.messageId!, ticketId, path: u.path, fileName: u.file.name });
        if (!rec.ok) failed++;
      } else if (u.status === "error") {
        failed++;
      }
    }
    if (failed > 0) {
      setError(`ההודעה נשלחה, אך ${failed} קבצים לא צורפו.`);
      setBusy(false);
      return;
    }

    setText("");
    setLinks([]);
    setUploads([]);
    setBusy(false);
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
                      <a key={i} href={l} target="_blank" rel="noopener noreferrer" dir="ltr" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <Link2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l}</span>
                      </a>
                    ))}
                  </div>
                )}
                {m.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.attachments.map((a, i) => (
                      <a key={i} href={a.url} download={a.name} className="flex items-center gap-1.5 rounded-md bg-white/70 px-2 py-1 text-xs text-slate-700 hover:bg-white">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-black" />
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
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={placeholder} className={inputCls} />

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
              className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              title="הסר"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Files (upload on select) */}
        {uploads.length > 0 && (
          <>
            <p className="text-xs font-medium text-slate-500">{uploads.length} קבצים</p>
            <ul className="space-y-1.5">
              {uploads.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {u.status === "uploading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                    {u.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                    {u.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    <span className="min-w-0 truncate text-slate-700">{u.file.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {u.status === "uploading" ? "מעלה…" : u.status === "done" ? "הועלה ✓" : "נכשל"}
                    </span>
                    {u.status === "error" && (
                      <button type="button" onClick={() => retry(u)} className="text-xs text-primary hover:underline">
                        נסה שוב
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(u.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      title="הסר"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSend} disabled={busy || uploading}>
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                שולח…
              </span>
            ) : uploading ? (
              "ממתין לסיום העלאה…"
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
