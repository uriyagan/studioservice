"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Paperclip, Loader2, FileText, Trash2, CheckCircle2 } from "@/components/icons";
import {
  getProjectNotes,
  saveProjectNotes,
  getProjectFiles,
  addProjectFile,
  deleteProjectFile,
  type ProjectFile,
} from "@/app/actions/project-notes";

export function ProjectNotes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputId = useId();

  useEffect(() => {
    getProjectNotes(projectId).then((n) => {
      setNotes(n);
      setSavedNotes(n);
    });
    getProjectFiles(projectId).then(setFiles);
  }, [projectId]);

  const dirty = notes !== savedNotes;

  const save = async () => {
    setSaving(true);
    setError(null);
    const r = await saveProjectNotes(projectId, notes);
    setSaving(false);
    if (!r.ok) {
      setError(r.error ?? "שמירה נכשלה");
      return;
    }
    setSavedNotes(notes);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const upload = async (list: FileList | null) => {
    if (!list || !list.length) return;
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const r = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name }),
        });
        if (!r.ok) throw new Error("signed url failed");
        const { path, token } = await r.json();
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .uploadToSignedUrl(path, token, file);
        if (upErr) throw upErr;
        const rec = await addProjectFile({ projectId, path, fileName: file.name });
        if (!rec.ok) throw new Error(rec.error ?? "רישום הקובץ נכשל");
      } catch (e) {
        setError(`העלאת "${file.name}" נכשלה: ${(e as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    getProjectFiles(projectId).then(setFiles);
  };

  const remove = async (id: string) => {
    if (!confirm("למחוק את הקובץ?")) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
    const r = await deleteProjectFile(id);
    if (!r.ok) {
      setError(r.error ?? "מחיקה נכשלה");
      getProjectFiles(projectId).then(setFiles);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="הערות פנימיות על הפרויקט — מה חשוב לזכור, החלטות, גישות, סיסמאות לא רגישות וכו'…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? "שומר…" : "שמירת הערות"}
          </Button>
          {justSaved && (
            <span className="inline-flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> נשמר
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-slate-700">קבצים ({files.length})</span>
          <input
            id={fileInputId}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
          />
          <label
            htmlFor={fileInputId}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            {uploading > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            {uploading > 0 ? `מעלה ${uploading}…` : "העלאת קובץ"}
          </label>
        </div>

        {files.length === 0 && uploading === 0 && (
          <p className="text-sm text-slate-400">אין קבצים עדיין.</p>
        )}
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <a href={f.url} download={f.name} className="flex min-w-0 items-center gap-2 text-slate-700 hover:text-primary">
                <FileText className="h-4 w-4 shrink-0 text-black" />
                <span className="truncate">{f.name}</span>
              </a>
              <button
                onClick={() => remove(f.id)}
                className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="מחק"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
