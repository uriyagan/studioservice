"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { createProject } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Profile } from "@/lib/types";

const initial = { ok: false, error: undefined as string | undefined };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "יוצר..." : "צור פרויקט"}
    </Button>
  );
}

export function CreateProjectForm({ clients }: { clients: Profile[] }) {
  const [state, action] = useActionState(createProject, initial);
  const [isRetainer, setIsRetainer] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setIsRetainer(false);
    }
  }, [state.ok]);

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input name="name" required placeholder="שם הפרויקט" className={inputCls} />

      <select name="client_id" className={inputCls} defaultValue="">
        <option value="" disabled>
          שייך ללקוח...
        </option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || c.email}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="is_retainer"
          checked={isRetainer}
          onChange={(e) => setIsRetainer(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/30"
        />
        חבילת ריטיינר (שעות בלתי מוגבלות)
      </label>

      {!isRetainer && (
        <input
          name="total_hours"
          type="number"
          step="0.5"
          min="0"
          placeholder="סך שעות בחבילה"
          className={inputCls}
        />
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600">הפרויקט נוצר בהצלחה ✓</p>
      )}
      <Submit />
    </form>
  );
}
