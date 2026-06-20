"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const withDownload = (url: string, name: string) =>
  url && url !== "#"
    ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`
    : url;

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("לא מחובר");
  const { data: p } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (p?.role !== "admin") throw new Error("אין הרשאה");
}

export interface NoteFile {
  id: string;
  name: string;
  url: string;
}
export interface ProjectNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  files: NoteFile[];
}

type Ok = { ok: boolean; error?: string };

// All note cards for a project (newest first), each with signed file URLs.
export async function getProjectNotes(projectId: string): Promise<ProjectNote[]> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: notes } = await adb
      .from("project_notes")
      .select("id, body, created_at, updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const noteRows = (notes ?? []) as {
      id: string;
      body: string;
      created_at: string;
      updated_at: string;
    }[];
    if (!noteRows.length) return [];

    const { data: files } = await adb
      .from("project_note_files")
      .select("id, note_id, file_url, file_name")
      .in("note_id", noteRows.map((n) => n.id));
    const fileRows = (files ?? []) as {
      id: string;
      note_id: string;
      file_url: string;
      file_name: string;
    }[];

    const urlByPath: Record<string, string> = {};
    if (fileRows.length) {
      const { data: signed } = await adb.storage
        .from("attachments")
        .createSignedUrls(fileRows.map((f) => f.file_url), 3600);
      for (const s of (signed ?? []) as { path: string | null; signedUrl: string }[]) {
        if (s.path) urlByPath[s.path] = s.signedUrl;
      }
    }
    const filesByNote: Record<string, NoteFile[]> = {};
    for (const f of fileRows) {
      (filesByNote[f.note_id] ??= []).push({
        id: f.id,
        name: f.file_name,
        url: withDownload(urlByPath[f.file_url] ?? "#", f.file_name),
      });
    }

    return noteRows.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
      files: filesByNote[n.id] ?? [],
    }));
  } catch {
    return [];
  }
}

export async function createProjectNote(
  projectId: string,
  body: string,
  files: { path: string; name: string }[]
): Promise<Ok> {
  try {
    await assertAdmin();
    if (!body.trim() && !files.length) return { ok: false, error: "יש להזין טקסט או לצרף קובץ" };
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: note, error } = await adb
      .from("project_notes")
      .insert({ project_id: projectId, body })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (files.length) {
      await adb
        .from("project_note_files")
        .insert(files.map((f) => ({ note_id: note.id, file_url: f.path, file_name: f.name })));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateProjectNote(noteId: string, body: string): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb
      .from("project_notes")
      .update({ body, updated_at: new Date().toISOString() })
      .eq("id", noteId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteProjectNote(noteId: string): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: files } = await adb
      .from("project_note_files")
      .select("file_url")
      .eq("note_id", noteId);
    const paths = ((files ?? []) as { file_url: string }[]).map((f) => f.file_url);
    if (paths.length) await adb.storage.from("attachments").remove(paths);
    const { error } = await adb.from("project_notes").delete().eq("id", noteId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addNoteFile(input: {
  noteId: string;
  path: string;
  fileName: string;
}): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb
      .from("project_note_files")
      .insert({ note_id: input.noteId, file_url: input.path, file_name: input.fileName });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteNoteFile(fileId: string): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: row } = await adb
      .from("project_note_files")
      .select("file_url")
      .eq("id", fileId)
      .maybeSingle();
    if (row?.file_url) await adb.storage.from("attachments").remove([row.file_url]);
    const { error } = await adb.from("project_note_files").delete().eq("id", fileId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
