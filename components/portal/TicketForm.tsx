"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
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
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [links, setLinks] = useState<string[]>([""]);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
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
      return;
    }

    // Upload attachments one by one.
    const supabase = createClient();
    for (const file of files) {
      try {
        const r = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId: res.ticketId, fileName: file.name }),
        });
        if (!r.ok) throw new Error("signed url failed");
        const { path, token } = await r.json();

        const { error: upErr } = await supabase.storage
          .from("attachments")
          .uploadToSignedUrl(path, token, file);
        if (upErr) throw upErr;

        await attachFile(res.ticketId, path, file.name);
      } catch {
        // Non-fatal: the ticket is already created. Surface a note.
        setError("המשימה נוצרה, אך העלאת חלק מהקבצים נכשלה.");
      }
    }

    setStatus("done");
    setFiles([]);
    setLinks([""]);
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
        <label
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
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <UploadCloud className="h-7 w-7 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">גרור קבצים לכאן או לחץ להעלאה</p>
          <p className="text-xs text-slate-400">כל סוג קובץ, כל גודל, כמה קבצים שתרצה</p>
        </label>

        {files.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-700">{f.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-slate-400">{fmtSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    title="הסר"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "done" && !error && (
        <p className="text-sm text-emerald-600">המשימה נוצרה בהצלחה ✓</p>
      )}

      <Button type="submit" disabled={status === "saving"} className="w-full">
        {status === "saving" ? "יוצר..." : "יצירת משימה"}
      </Button>
    </form>
  );
}
