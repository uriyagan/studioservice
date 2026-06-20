"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Append the download flag so the signed URL serves the file as an attachment.
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

export interface ProjectFile {
  id: string;
  name: string;
  url: string;
}

export async function getProjectNotes(projectId: string): Promise<string> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { data } = await adb
      .from("project_notes")
      .select("notes")
      .eq("project_id", projectId)
      .maybeSingle();
    return data?.notes ?? "";
  } catch {
    return "";
  }
}

export async function saveProjectNotes(
  projectId: string,
  notes: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb
      .from("project_notes")
      .upsert(
        { project_id: projectId, notes, updated_at: new Date().toISOString() },
        { onConflict: "project_id" }
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data } = await adb
      .from("project_files")
      .select("id, file_url, file_name")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as { id: string; file_url: string; file_name: string }[];
    if (!rows.length) return [];
    const { data: signed } = await adb.storage
      .from("attachments")
      .createSignedUrls(rows.map((r) => r.file_url), 3600);
    const urlByPath: Record<string, string> = {};
    for (const s of (signed ?? []) as { path: string | null; signedUrl: string }[]) {
      if (s.path) urlByPath[s.path] = s.signedUrl;
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.file_name,
      url: withDownload(urlByPath[r.file_url] ?? "#", r.file_name),
    }));
  } catch {
    return [];
  }
}

export async function addProjectFile(input: {
  projectId: string;
  path: string;
  fileName: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as { from: (t: string) => any };
    const { error } = await adb.from("project_files").insert({
      project_id: input.projectId,
      file_url: input.path,
      file_name: input.fileName,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteProjectFile(
  fileId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
    const adb = createAdminClient() as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
    };
    const { data: row } = await adb
      .from("project_files")
      .select("file_url")
      .eq("id", fileId)
      .maybeSingle();
    if (row?.file_url) await adb.storage.from("attachments").remove([row.file_url]);
    const { error } = await adb.from("project_files").delete().eq("id", fileId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
