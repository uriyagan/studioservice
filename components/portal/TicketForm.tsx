"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createTicket, attachFile } from "@/app/actions/tickets";
import { Button } from "@/components/ui/Button";

// New-task form. Creates the ticket, then uploads each file
// directly to Storage via a signed URL (no size/count limit on the
// server) and records its metadata.
export function TicketForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("saving");

    const formData = new FormData(e.currentTarget);
    formData.set("project_id", projectId);

    const res = await createTicket(
      { ok: false } as { ok: boolean; error?: string },
      formData
    );
    if (!res.ok || !res.ticketId) {
      setError(res.error ?? "שגיאה בשליחת הפנייה");
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
        setError("הפנייה נשלחה, אך העלאת חלק מהקבצים נכשלה.");
      }
    }

    setStatus("done");
    setFiles([]);
    formRef.current?.reset();
    router.refresh();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
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
          לינק רלוונטי
        </label>
        <input name="link" type="url" placeholder="https://" className={inputCls} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          קבצים מצורפים
        </label>
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-slate-500 file:me-3 file:rounded-lg file:border-0 file:bg-primary-light file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/10"
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">
            {files.length} קבצים נבחרו
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {status === "done" && !error && (
        <p className="text-sm text-emerald-600">הפנייה נשלחה בהצלחה ✓</p>
      )}

      <Button type="submit" disabled={status === "saving"} className="w-full">
        {status === "saving" ? "שולח..." : "שליחת פנייה"}
      </Button>
    </form>
  );
}
