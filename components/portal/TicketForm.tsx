"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, X, Loader2, CheckCircle2, AlertCircle } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { createTicket, attachFile } from "@/app/actions/tickets";
import { createAdminTicket } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import type { AdminOption } from "@/lib/types";

interface ProjectOption {
  id: string;
  name: string;
}

type Upload = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  path?: string;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Locally-persisted draft of the text fields (not files), so an accidental
// modal/page close doesn't lose what the user typed. Keyed per mode.
type TaskDraft = { title: string; description: string; links: string[] };
const draftKey = (mode: string) => `studioservice:taskdraft:${mode}`;

function loadDraft(mode: string): TaskDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(mode));
    if (!raw) return null;
    const d = JSON.parse(raw) as TaskDraft;
    const hasText =
      (d.title && d.title.trim()) ||
      (d.description && d.description.trim()) ||
      (d.links ?? []).some((l) => l.trim());
    return hasText ? d : null;
  } catch {
    return null;
  }
}

// New-task form. Files upload to Storage the moment they're chosen (so submit
// is instant); on submit the ticket is created and the already-uploaded files
// are linked to it. Used in the client portal (mode "client") and the admin
// area (mode "admin", with a project picker).
export function TicketForm({
  projectId,
  projects,
  admins,
  mode = "client",
  onDone,
}: {
  projectId?: string;
  projects?: ProjectOption[];
  admins?: AdminOption[];
  mode?: "client" | "admin";
  onDone?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputId = useId();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [createdTicketId, setCreatedTicketId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Restore any saved draft once, on mount.
  useEffect(() => {
    const d = loadDraft(mode);
    if (d) {
      setTitle(d.title ?? "");
      setDescription(d.description ?? "");
      setLinks(d.links?.length ? d.links : [""]);
      setRestored(true);
    }
  }, [mode]);

  const writeDraft = () => {
    try {
      const draft: TaskDraft = { title, description, links };
      const hasText =
        title.trim() || description.trim() || links.some((l) => l.trim());
      if (hasText) localStorage.setItem(draftKey(mode), JSON.stringify(draft));
      else localStorage.removeItem(draftKey(mode));
    } catch {
      /* localStorage unavailable — ignore */
    }
  };
  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey(mode));
    } catch {
      /* ignore */
    }
  };

  // Auto-save the draft ~1s after the user stops typing.
  useEffect(() => {
    if (status === "done") return;
    const t = setTimeout(writeDraft, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, links, status]);

  // Flush the draft when the form unmounts (e.g. modal closed mid-typing,
  // before the 1s debounce fired) so nothing typed is lost — UNLESS the form
  // was just submitted. After submit the modal unmounts in the same batch that
  // cleared the fields, so `latest.current` still closes over the old (pre-clear)
  // text; flushing it would re-write the just-created task as a "draft".
  const skipFlush = useRef(false);
  const latest = useRef(writeDraft);
  latest.current = writeDraft;
  useEffect(() => {
    return () => {
      if (!skipFlush.current) latest.current();
    };
  }, []);

  const saveDraftNow = () => {
    writeDraft();
    setRestored(false);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 3000);
  };
  const discardDraft = () => {
    clearDraft();
    setTitle("");
    setDescription("");
    setLinks([""]);
    setRestored(false);
  };

  const setUp = (id: string, patch: Partial<Upload>) =>
    setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  // Upload one file's bytes immediately to Storage.
  const uploadOne = async (u: Upload) => {
    try {
      const r = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: u.file.name }),
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("saving");

    // Create the ticket once (reuse on retry to avoid a duplicate).
    let ticketId = createdTicketId;
    if (!ticketId) {
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
      ticketId = res.ticketId;
      setCreatedTicketId(ticketId);
    }

    // Link the already-uploaded files to the ticket (no re-upload).
    let failed = 0;
    for (const u of uploads) {
      if (u.status === "done" && u.path) {
        const rec = await attachFile(ticketId, u.path, u.file.name);
        if (!rec.ok) failed++;
      } else if (u.status === "error") {
        failed++;
      }
    }
    if (failed > 0) {
      setError(`המשימה נוצרה, אך ${failed} קבצים לא צורפו. אפשר לנסות שוב או להסיר אותם.`);
      setStatus("idle");
      router.refresh();
      return;
    }

    setStatus("done");
    skipFlush.current = true;
    setUploads([]);
    setTitle("");
    setDescription("");
    setLinks([""]);
    setCreatedTicketId(null);
    setRestored(false);
    clearDraft();
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
              בחירת פרויקט...
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Assignee at creation time — admin only, and optional: leaving it empty
          keeps the old behaviour of an unassigned task. Picking someone here
          emails them exactly as assigning from the tasks table does. */}
      {mode === "admin" && admins && admins.length > 0 && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">אחראי</label>
          <select name="assignee_id" className={inputCls} defaultValue="">
            <option value="">ללא אחראי</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {restored && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>שוחזרה טיוטה שלא נשלחה.</span>
          <button type="button" onClick={discardDraft} className="shrink-0 font-medium text-amber-900 hover:underline">
            ניקוי טיוטה
          </button>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">כותרת</label>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">טקסט חופשי</label>
        <textarea
          name="description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">לינקים רלוונטיים</label>
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
                  className="shrink-0 rounded p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  title="הסרה"
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
        <label className="mb-1.5 block text-sm font-medium text-slate-700">קבצים מצורפים</label>
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
          <UploadCloud className="h-7 w-7 text-black" />
          <p className="text-sm font-medium text-slate-700">אפשר לגרור קבצים לכאן או ללחוץ להעלאה</p>
          <p className="text-xs text-slate-400">הקבצים מתחילים לעלות מיד עם הבחירה</p>
        </label>

        {uploads.length > 0 && (
          <>
            <p className="mt-3 text-xs font-medium text-slate-500">{uploads.length} קבצים</p>
            <ul className="mt-1.5 space-y-1.5">
              {uploads.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {u.status === "uploading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
                    {u.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                    {u.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    <span className="min-w-0 truncate text-slate-700">{u.file.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {u.status === "uploading" ? "בהעלאה…" : u.status === "done" ? "הועלה ✓" : "נכשל"}
                    </span>
                    {u.status === "error" && (
                      <button type="button" onClick={() => retry(u)} className="text-xs text-primary hover:underline">
                        ניסיון חוזר
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeFile(u.id)}
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      title="הסרה"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "done" && !error && <p className="text-sm text-emerald-600">המשימה נוצרה בהצלחה ✓</p>}
      {draftSaved && <p className="text-sm text-emerald-600">נשמר כטיוטה ✓ — אפשר להמשיך מאוחר יותר (קבצים לא נשמרים בטיוטה)</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={status === "saving" || uploading} className="w-full">
          {status === "saving" ? "יוצרים משימה…" : uploading ? "ממתינים לסיום העלאת קבצים…" : "יצירת משימה"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={saveDraftNow}
          disabled={status === "saving"}
          className="w-full sm:w-auto sm:whitespace-nowrap"
        >
          שמירה כטיוטה
        </Button>
      </div>
    </form>
  );
}
