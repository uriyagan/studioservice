"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { createClientFull } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";

const initial = { ok: false, error: undefined as string | undefined };

const cls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "יוצר..." : "צור לקוח"}
    </Button>
  );
}

export function CreateClientForm() {
  const [state, action] = useActionState(createClientFull, initial);
  const [withProject, setWithProject] = useState(true);
  const [isRetainer, setIsRetainer] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setWithProject(true);
      setIsRetainer(false);
    }
  }, [state.ok]);

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="flex gap-2">
        <input name="first_name" placeholder="שם פרטי" className={cls} />
        <input name="last_name" placeholder="שם משפחה" className={cls} />
      </div>
      <input name="email" type="email" required placeholder="אימייל" className={cls} />
      <input name="password" type="text" placeholder="סיסמה (אופציונלי)" className={cls} />
      <p className="-mt-1 text-[11px] text-slate-400">
        השאר ריק — הלקוח יקבל מייל עם קישור ליצירת סיסמה בעצמו.
      </p>
      <input name="phone" placeholder="טלפון" className={cls} dir="ltr" />
      <div className="flex gap-2">
        <input name="company" placeholder="חברה / עסק" className={cls} />
        <input name="company_number" placeholder="מספר חברה" className={cls} />
      </div>
      <input name="address" placeholder="כתובת" className={cls} />
      <textarea name="notes" rows={2} placeholder="הערות פנימיות" className={cls} />

      <div className="rounded-lg border border-slate-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="create_project"
            checked={withProject}
            onChange={(e) => setWithProject(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary"
          />
          צור פרויקט ראשוני ללקוח
        </label>

        {withProject && (
          <div className="mt-3 space-y-3">
            <input name="project_name" placeholder="שם הפרויקט" className={cls} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="is_retainer"
                checked={isRetainer}
                onChange={(e) => setIsRetainer(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary"
              />
              חבילת ריטיינר (שעות בלתי מוגבלות)
            </label>
            {!isRetainer && (
              <input name="total_hours" type="number" step="0.5" min="0" placeholder="סך שעות בחבילה" className={cls} />
            )}
          </div>
        )}
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="text-sm text-emerald-600">הלקוח נוצר בהצלחה ✓</p>}
      <Submit />
    </form>
  );
}
