"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Paperclip, Loader2, FileText, Trash2, Pencil, X } from "@/components/icons";
import { formatDate } from "@/lib/format";
import {
  getProjectNotes,
  createProjectNote,
  updateProjectNote,
  deleteProjectNote,
  addNoteFile,
  deleteNoteFile,
  type ProjectNote,
} from "@/app/actions/project-notes";

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

export function ProjectNotes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => getProjectNotes(projectId).then(setNotes);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? notes.filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          n.files.some((f) => f.name.toLowerCase().includes(q))
      )
    : notes;

  return (
    <div className="space-y-4">
      <Composer projectId={projectId} onAdded={reload} onError={setError} />

      {notes.length > 0 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש בהערות ובקבצים…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {notes.length === 0 && (
        <p className="text-sm text-slate-400">אין הערות עדיין. הוסף/י את הראשונה למעלה.</p>
      )}
      {notes.length > 0 && filtered.length === 0 && (
        <p className="text-sm text-slate-400">לא נמצאו הערות תואמות.</p>
      )}

      <div className="space-y-3">
        {filtered.map((n) => (
          <NoteCard key={n.id} note={n} onChanged={reload} onError={setError} />
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
  projectId,
  onAdded,
  onError,
}: {
  projectId: string;
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
    const r = await createProjectNote(projectId, body, files);
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
        placeholder="הערה חדשה… (אפשר גם לצרף קובץ)"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      <FileChips pending={pending} />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={add} disabled={busy || uploading || (!body.trim() && !pending.some((u) => u.status === "done"))}>
          {busy ? "מוסיף…" : uploading ? "ממתין להעלאה…" : "הוספת הערה"}
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
  onChanged,
  onError,
}: {
  note: ProjectNote;
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(0);
  const fileInputId = useId();

  const saveEdit = async () => {
    setBusy(true);
    onError(null);
    const r = await updateProjectNote(note.id, body);
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
    const r = await deleteProjectNote(note.id);
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
        const r = await addNoteFile({ noteId: note.id, path, fileName: file.name });
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
    const r = await deleteNoteFile(fileId);
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
              <a href={f.url} download={f.name} className="flex min-w-0 items-center gap-2 text-slate-700 hover:text-primary">
                <FileText className="h-4 w-4 shrink-0 text-black" />
                <span className="truncate">{f.name}</span>
              </a>
              <button onClick={() => removeFile(f.id)} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="מחק קובץ">
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
    </div>
  );
}
