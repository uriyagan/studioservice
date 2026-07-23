"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type TicketResult = { ok: boolean; error?: string; ticketId?: string };

// Client submits a new task/ticket on their own project. RLS
// guarantees they can only insert against a project they own.
export async function createTicket(
  _prev: TicketResult,
  formData: FormData
): Promise<TicketResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "נדרשת התחברות" };

    const projectId = String(formData.get("project_id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    // Multiple relevant links — stored newline-separated in `link`.
    const link =
      formData
        .getAll("link")
        .map((l) => String(l).trim())
        .filter(Boolean)
        .join("\n") || "";

    if (!projectId || !title) {
      return { ok: false, error: "כותרת נדרשת" };
    }

    // Record the opener so task correspondence goes back to whoever submitted
    // it (a project member), not always the project's primary client. Retry
    // without the column if the migration hasn't been applied yet.
    const base = {
      project_id: projectId,
      title,
      description: description || null,
      link: link || null,
    };
    let { data, error } = await supabase
      .from("tickets")
      .insert({ ...base, created_by: user.id })
      .select("id")
      .single();
    if (error) {
      ({ data, error } = await supabase.from("tickets").insert(base).select("id").single());
    }
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "יצירת המשימה נכשלה" };

    const { runAfter } = await import("@/lib/after");
    await runAfter(async () => {
      const { notifyAdminsNewTask } = await import("@/lib/email/notifications");
      await notifyAdminsNewTask(data.id);
    });

    revalidatePath("/portal");
    revalidatePath("/admin");
    return { ok: true, ticketId: data.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Persist an uploaded file's metadata against a ticket. The actual
// bytes are uploaded directly to Storage from the browser; this
// records the row so the admin can see/download it.
export async function attachFile(
  ticketId: string,
  filePath: string,
  fileName: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("attachments").insert({
    ticket_id: ticketId,
    file_url: filePath,
    file_name: fileName,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
