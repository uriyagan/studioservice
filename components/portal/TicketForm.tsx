"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Loader2, CheckCircle2, AlertCircle } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { createTicket, attachFile } from "@/app/actions/tickets";
import { createAdminTicket } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";

interface ProjectOption {
  id: string;
  name: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// New-task form. Creates the ticket, then uploads each file
// directly to Storage via a signed URL (no size/count limit on the
// server) and records its metadata.
// Used both in the client portal (mode "client") and the admin area
// (mode "admin", with a project picker). Same fields either way.
export function TicketForm({
  projectId,
  projects,
  mode = "client",
  onDone,
}: {
  projectId?: string;
  projects?: ProjectOption[];
  mode?: "client" | "admin";
  onDone?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [links, setLinks] = useState<string[]>([""]);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [phase, setPhase] = useState<string>("");
  const [fileStates, setFileStates] = useState<Record<number, "pending" | "up" | "done" | "err">>({});
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("saving");

    // Create the ticket once; on a retry (after a partial upload failure) we
    // reuse it instead of creating a duplicate.
    let ticketId = createdTicketId;
    if (!ticketId) {
      setPhase("יוצר משימה...");
      setFileStates(Object.fromEntries(files.map((_, i) => [i, "pending" as const])));
      const formData = new FormData(e.currentTarget);
      if (projectId) formData.set("project_id", projectId);
      const prev = { ok: false } as { ok: boolean; error?: string };
      const res =
        mode === "admin"
          ? await createAdminTicket(prev, formData)
          : await createTicket(prev, formData);
      if (!res.ok || !res.ticketId) {
        setError(res.error ?? "שגיאה ביצירת המשימה");
        setStatus("idle");
        setPhase("");
        return;
      }
      ticketId = res.ticketId;
      setCreatedTicketId(ticketId);
    }

    // Upload attachments one by one (skip ones already uploaded), with feedback.
    const supabase = createClient();
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      if (fileStates[i] === "done") continue;
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

        const rec = await attachFile(ticketId, path, file.name);
        if (!rec.ok) throw new Error(rec.error || "record failed");
        setFileStates((s) => ({ ...s, [i]: "done" }));
      } catch {
        failed++;
        setFileStates((s) => ({ ...s, [i]: "err" }));
      }
    }

    if (failed > 0) {
      // Task is created; keep the failed files visible so the user can retry
      // (a re-submit reuses the same ticket and re-uploads only the failed ones).
      setError(`המשימה נוצרה, אך העלאת ${failed} קבצים נכשלה. אפשר לנסות שוב.`);
      setStatus("idle");
      setPhase("");
      router.refresh();
      return;
    }

    setStatus("done");
    setPhase("");
    setFiles([]);
    setFileStates({});
    setLinks([""]);
    setCreatedTicketId(null);
    formRef.current?.reset();
    router.refresh();
    onDone?.();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {mode === "admin" && projects && !projectId && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">פרויקט</label>
          <select name="project_id" required className={inputCls} defaultValue="">
            <option value="" disabled>
              בחר פרויקט...
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          כותרת
        </label>
        <input name="title" required className={inputCls} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          טקסט חופשי
        </label>
        <textarea name="description" rows={4} className={inputCls} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          לינקים רלוונטיים
        </label>
        <div className="space-y-2">
          {links.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                name="link"
                type="url"
                value={val}
                onChange={(e) => setLinks((prev) => prev.map((l, idx) => (idx === i ? e.target.value : l)))}
                placeholder="https://"
                dir="ltr"
                className={inputCls}
              />
              {links.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  title="הסר"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLinks((prev) => [...prev, ""])}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          + הוספת לינק נוסף
        </button>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          קבצים מצורפים
        </label>
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
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver ? "border-primary bg-primary-light/40" : "border-slate-300 hover:border-primary hover:bg-slate-50"
          }`}
        >
          <UploadCloud className="h-7 w-7 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">גרור קבצים לכאן או לחץ להעלאה</p>
          <p className="text-xs text-slate-400">כל סוג קובץ, כל גודל, כמה קבצים שתרצה</p>
        </label>

        {files.length > 0 && (
          <>
            <p className="mt-3 text-xs font-medium text-slate-500">
              {files.length} קבצים נבחרו
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {files.map((f, i) => {
                const st = fileStates[i];
                return (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {st === "up" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                      {st === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                      {st === "err" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                      <span className="min-w-0 truncate text-slate-700">{f.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {st === "up" ? "מעלה..." : st === "done" ? "הועלה ✓" : st === "err" ? "נכשל" : fmtSize(f.size)}
                      </span>
                      {status !== "saving" && (
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "done" && !error && (
        <p className="text-sm text-emerald-600">המשימה נוצרה בהצלחה ✓</p>
      )}

      <Button type="submit" disabled={status === "saving"} className="w-full">
        {status === "saving" ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {phase || "שולח..."}
          </span>
        ) : (
          "יצירת משימה"
        )}
      </Button>
    </form>
  );
}
