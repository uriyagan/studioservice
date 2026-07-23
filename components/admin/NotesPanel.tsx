"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Paperclip, Loader2, FileText, Trash2, Pencil, X, Download, Eye } from "@/components/icons";
import { isImageFile, ImageViewerModal } from "@/components/ui/ImageViewer";
import { downloadAllAsZip } from "@/lib/download-files";
import { formatDate } from "@/lib/format";

// Generic admin-only "notes + files" panel, reused for both project-level and
// task-level internal notes. The caller supplies the data + mutation actions;
// the panel owns the UI (composer, search, edit/delete, per-card file attach).
export interface PanelNoteFile {
  id: string;
  name: string;
  url: string;
}
export interface PanelNote {
  id: string;
  body: string;
  createdAt: string;
  files: PanelNoteFile[];
}
type Ok = { ok: boolean; error?: string };
export interface NotesActions {
  list: () => Promise<PanelNote[]>;
  create: (body: string, files: { path: string; name: string }[]) => Promise<Ok>;
  update: (id: string, body: string) => Promise<Ok>;
  remove: (id: string) => Promise<Ok>;
  addFile: (id: string, path: string, name: string) => Promise<Ok>;
  removeFile: (fileId: string) => Promise<Ok>;
}

type Pending = { id: string; name: string; path?: string; status: "uploading" | "done" | "error" };

// Upload a file to Storage via a signed URL; returns its storage path.
async function uploadToStorage(file: File): Promise<string> {
  const r = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name }),
  });
  if (!r.ok) throw new Error("signed url failed");
  const { path, token } = await r.json();
  const supabase = createClient();
  const { error } = await supabase.storage.from("attachments").uploadToSignedUrl(path, token, file);
  if (error) throw error;
  return path;
}

export function NotesPanel({
  actions,
  composerPlaceholder = "הערה חדשה… (אפשר גם לצרף קובץ)",
  emptyText = "אין הערות עדיין. הוסף/י את הראשונה למעלה.",
  searchPlaceholder = "חיפוש בהערות ובקבצים…",
}: {
  actions: NotesActions;
  composerPlaceholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
}) {
  const [notes, setNotes] = useState<PanelNote[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const downloadAll = async (files: { name: string; url: string }[]) => {
    if (zipping) return;
    setZipping(true);
    setError(null);
    const { ok, failed } = await downloadAllAsZip(files);
    if (!ok)
      setError(
        failed.length ? `לא ניתן היה להוריד ${failed.length} קבצים` : "ההורדה נכשלה"
      );
    setZipping(false);
  };

  const reload = () => actions.list().then(setNotes);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? notes.filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          n.files.some((f) => f.name.toLowerCase().includes(q))
      )
    : notes;

  // All files across the currently-shown notes — for the "download all" button.
  const allFiles = filtered.flatMap((n) => n.files);

  return (
    <div className="space-y-4">
      <Composer actions={actions} placeholder={composerPlaceholder} onAdded={reload} onError={setError} />

      {notes.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      )}

      {allFiles.length > 1 && (
        <button
          onClick={() => downloadAll(allFiles)}
          disabled={zipping}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          <Download className="h-4 w-4 text-white" />{" "}
          {zipping ? "מכין הורדה…" : `הורדת כל הקבצים (${allFiles.length})`}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {notes.length === 0 && <p className="text-sm text-slate-400">{emptyText}</p>}
      {notes.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-slate-400">לא נמצאו הערות תואמות.</p>
      )}

      <div className="space-y-3">
        {filtered.map((n) => (
          <NoteCard key={n.id} note={n} actions={actions} onChanged={reload} onError={setError} />
        ))}
      </div>
    </div>
  );
}

function FileChips({ pending }: { pending: Pending[] }) {
  if (!pending.length) return null;
  return (
    <ul className="space-y-1.5">
      {pending.map((u) => (
        <li key={u.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
          {u.status === "uploading" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
          {u.status === "done" && <FileText className="h-4 w-4 shrink-0 text-black" />}
          {u.status === "error" && <X className="h-4 w-4 shrink-0 text-red-500" />}
          <span className="min-w-0 truncate text-slate-700">{u.name}</span>
        </li>
      ))}
    </ul>
  );
}

function Composer({
  actions,
  placeholder,
  onAdded,
  onError,
}: {
  actions: NotesActions;
  placeholder: string;
  onAdded: () => void;
  onError: (e: string | null) => void;
}) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputId = useId();

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    for (const file of Array.from(list)) {
      const id = crypto.randomUUID();
      setPending((p) => [...p, { id, name: file.name, status: "uploading" }]);
      uploadToStorage(file)
        .then((path) =>
          setPending((p) => p.map((u) => (u.id === id ? { ...u, path, status: "done" } : u)))
        )
        .catch(() => setPending((p) => p.map((u) => (u.id === id ? { ...u, status: "error" } : u))));
    }
  };

  const uploading = pending.some((u) => u.status === "uploading");

  const add = async () => {
    onError(null);
    setBusy(true);
    const files = pending.filter((u) => u.status === "done" && u.path).map((u) => ({ path: u.path!, name: u.name }));
    const r = await actions.create(body, files);
    setBusy(false);
    if (!r.ok) {
      onError(r.error ?? "שמירה נכשלה");
      return;
    }
    setBody("");
    setPending([]);
    onAdded();
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      <FileChips pending={pending} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={add} disabled={busy || uploading || (!body.trim() && !pending.some((u) => u.status === "done"))}>
          {busy ? "שומר…" : uploading ? "ממתין להעלאה…" : "שמירת הערה"}
        </Button>
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
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <Paperclip className="h-4 w-4" /> צירוף קובץ
        </label>
      </div>
    </div>
  );
}

function NoteCard({
  note,
  actions,
  onChanged,
  onError,
}: {
  note: PanelNote;
  actions: NotesActions;
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(0);
  const [viewing, setViewing] = useState<{ name: string; url: string } | null>(null);
  const fileInputId = useId();

  const saveEdit = async () => {
    setBusy(true);
    onError(null);
    const r = await actions.update(note.id, body);
    setBusy(false);
    if (!r.ok) {
      onError(r.error ?? "עדכון נכשל");
      return;
    }
    setEditing(false);
    onChanged();
  };

  const removeNote = async () => {
    if (!confirm("למחוק את ההערה?")) return;
    onError(null);
    const r = await actions.remove(note.id);
    if (!r.ok) onError(r.error ?? "מחיקה נכשלה");
    onChanged();
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    onError(null);
    for (const file of Array.from(list)) {
      setAdding((n) => n + 1);
      try {
        const path = await uploadToStorage(file);
        const r = await actions.addFile(note.id, path, file.name);
        if (!r.ok) throw new Error(r.error ?? "צירוף נכשל");
      } catch (e) {
        onError((e as Error).message);
      } finally {
        setAdding((n) => n - 1);
      }
    }
    onChanged();
  };

  const removeFile = async (fileId: string) => {
    onError(null);
    const r = await actions.removeFile(fileId);
    if (!r.ok) onError(r.error ?? "מחיקת קובץ נכשלה");
    onChanged();
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <div className="flex items-center gap-2">
            <Button onClick={saveEdit} disabled={busy}>
              {busy ? "שומר…" : "שמירה"}
            </Button>
            <Button variant="ghost" onClick={() => { setBody(note.body); setEditing(false); }}>
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        note.body && <p className="whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
      )}

      {note.files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {note.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm">
              {isImageFile(f.name) ? (
                // Image: name + צפייה open the viewer; הורדה downloads.
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <button
                    onClick={() => setViewing(f)}
                    className="flex min-w-0 items-center gap-2 text-start text-slate-700 hover:text-primary"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-black" />
                    <span className="truncate">{f.name}</span>
                  </button>
                  <button
                    onClick={() => setViewing(f)}
                    className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Eye className="h-3.5 w-3.5" /> צפייה
                  </button>
                  <a href={f.url} download={f.name} className="ms-[10px] shrink-0 text-xs text-primary hover:underline">
                    הורדה
                  </a>
                </span>
              ) : (
                <a href={f.url} download={f.name} className="flex min-w-0 items-center gap-2 text-slate-700 hover:text-primary">
                  <FileText className="h-4 w-4 shrink-0 text-black" />
                  <span className="truncate">{f.name}</span>
                </a>
              )}
              <button onClick={() => removeFile(f.id)} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="מחיקת קובץ">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-400">
        <span>{formatDate(note.createdAt)}</span>
        <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 hover:text-slate-700">
          <Pencil className="h-3.5 w-3.5" /> עריכה
        </button>
        <input id={fileInputId} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <label htmlFor={fileInputId} className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-700">
          {adding > 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} צירוף קובץ
        </label>
        <button onClick={removeNote} className="inline-flex items-center gap-1 text-red-500 hover:text-red-700">
          <Trash2 className="h-3.5 w-3.5" /> מחיקה
        </button>
      </div>

      {viewing && (
        <ImageViewerModal name={viewing.name} url={viewing.url} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
