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

export interface TicketNoteFile {
  id: string;
  name: string;
  url: string;
}
export interface TicketNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  files: TicketNoteFile[];
}

type Ok = { ok: boolean; error?: string };

// All studio note cards for a task (newest first), each with signed file URLs.
// Service-role read — callers must authorize access first.
async function readNotes(ticketId: string): Promise<TicketNote[]> {
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: notes } = await adb
      .from("ticket_notes")
      .select("id, body, created_at, updated_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });
    const noteRows = (notes ?? []) as {
      id: string;
      body: string;
      created_at: string;
      updated_at: string;
    }[];
    if (!noteRows.length) return [];

    const { data: files } = await adb
      .from("ticket_note_files")
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
    const filesByNote: Record<string, TicketNoteFile[]> = {};
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
}

// Admin: all studio note cards for a task (used by the task details panel).
export async function getTicketNotes(ticketId: string): Promise<TicketNote[]> {
  try {
    await assertAdmin();
    return await readNotes(ticketId);
  } catch {
    return [];
  }
}

// Portal-side: the studio's notes for a task, shown read-only to the client
// who can see the task (owner or project member). Access is gated by reading
// the ticket through the RLS client first; the notes themselves are then read
// + signed via service role. Never includes anything the admin marked private
// (there is no private flag — every studio note here is client-visible).
export async function getMyTicketNotes(ticketId: string): Promise<TicketNote[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    // RLS lets the caller see the ticket only if they own it / are a member.
    const db = supabase as unknown as { from: (t: string) => any };
    const { data: t } = await db.from("tickets").select("id").eq("id", ticketId).maybeSingle();
    if (!t) return [];
    return readNotes(ticketId);
  } catch {
    return [];
  }
}

export async function createTicketNote(
  ticketId: string,
  body: string,
  files: { path: string; name: string }[]
): Promise<Ok> {
  try {
    await assertAdmin();
    if (!body.trim() && !files.length) return { ok: false, error: "יש להזין טקסט או לצרף קובץ" };
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { data: note, error } = await adb
      .from("ticket_notes")
      .insert({ ticket_id: ticketId, body })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    if (files.length) {
      await adb
        .from("ticket_note_files")
        .insert(files.map((f) => ({ note_id: note.id, file_url: f.path, file_name: f.name })));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateTicketNote(noteId: string, body: string): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb
      .from("ticket_notes")
      .update({ body, updated_at: new Date().toISOString() })
      .eq("id", noteId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteTicketNote(noteId: string): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: files } = await adb
      .from("ticket_note_files")
      .select("file_url")
      .eq("note_id", noteId);
    const paths = ((files ?? []) as { file_url: string }[]).map((f) => f.file_url);
    if (paths.length) await adb.storage.from("attachments").remove(paths);
    const { error } = await adb.from("ticket_notes").delete().eq("id", noteId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function addTicketNoteFile(input: {
  noteId: string;
  path: string;
  fileName: string;
}): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb
      .from("ticket_note_files")
      .insert({ note_id: input.noteId, file_url: input.path, file_name: input.fileName });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteTicketNoteFile(fileId: string): Promise<Ok> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: row } = await adb
      .from("ticket_note_files")
      .select("file_url")
      .eq("id", fileId)
      .maybeSingle();
    if (row?.file_url) await adb.storage.from("attachments").remove([row.file_url]);
    const { error } = await adb.from("ticket_note_files").delete().eq("id", fileId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
