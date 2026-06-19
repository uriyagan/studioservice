"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { addManualTime } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { History } from "@/components/icons";

const initial = { ok: false, error: undefined as string | undefined };

interface ProjectOption {
  id: string;
  name: string;
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "שומר..." : "שמור זמן"}
    </Button>
  );
}

// Manually log used time as a completed, described task — deducts
// from the project's package.
export function ManualTimeForm({
  projects = [],
  fixedProjectId,
}: {
  projects?: ProjectOption[];
  fixedProjectId?: string;
}) {
  const [state, action] = useActionState(addManualTime, initial);
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

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <History className="h-4 w-4" /> הזנת זמן ידנית
      </Button>
      {open && (
        <Modal title="הזנת זמן ידנית" onClose={() => setOpen(false)}>
          <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
            {fixedProjectId ? (
        <input type="hidden" name="project_id" value={fixedProjectId} />
      ) : (
        <select
          name="project_id"
          required
          className={`${inputCls} sm:col-span-2`}
          defaultValue=""
        >
          <option value="" disabled>
            בחר פרויקט...
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <input
        name="title"
        required
        placeholder="כותרת המשימה"
        className={`${inputCls} sm:col-span-2`}
      />

      <textarea
        name="description"
        rows={2}
        placeholder="תיאור המשימה (אופציונלי)"
        className={`${inputCls} sm:col-span-2`}
      />

      <div className="grid grid-cols-2 gap-2 sm:col-span-2">
        <div className="flex items-center gap-2">
          <input
            name="hours"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            className={inputCls}
            aria-label="שעות"
          />
          <span className="text-sm text-slate-500">שעות</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            name="minutes"
            type="number"
            min="0"
            max="59"
            step="1"
            defaultValue="0"
            className={inputCls}
            aria-label="דקות"
          />
          <span className="text-sm text-slate-500">דקות</span>
        </div>
      </div>

      {state.error && (
        <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>
      )}

            <div className="flex gap-2 sm:col-span-2">
              <Submit />
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                ביטול
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
