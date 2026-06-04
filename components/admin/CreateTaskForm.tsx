"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createAdminTicket } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";

const initial = { ok: false, error: undefined as string | undefined };

interface ProjectOption {
  id: string;
  name: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "יוצר..." : "צור משימה"}
    </Button>
  );
}

export function CreateTaskForm({ projects }: { projects: ProjectOption[] }) {
  const [state, action] = useFormState(createAdminTicket, initial);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        + משימה חדשה
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-card sm:grid-cols-2"
    >
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

      <input name="title" required placeholder="כותרת המשימה" className={inputCls} />

      <textarea
        name="description"
        rows={2}
        placeholder="תיאור (אופציונלי)"
        className={`${inputCls} sm:col-span-2`}
      />

      {state.error && (
        <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>
      )}

      <div className="flex gap-2 sm:col-span-2">
        <Submit />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(false)}
        >
          ביטול
        </Button>
      </div>
    </form>
  );
}
