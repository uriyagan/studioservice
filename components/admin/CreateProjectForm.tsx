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
  const [type, setType] = useState<"hours" | "retainer" | "build">("hours");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setType("hours");
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

      <select
        name="project_type"
        value={type}
        onChange={(e) => setType(e.target.value as "hours" | "retainer" | "build")}
        className={inputCls}
      >
        <option value="hours">חבילת שעות</option>
        <option value="retainer">ריטיינר (שעות בלתי מוגבלות)</option>
        <option value="build">פרוייקט הקמה (ללא מעקב שעות)</option>
      </select>

      {type === "hours" && (
        <input
          name="total_hours"
          type="number"
          step="0.5"
          min="0"
          placeholder="סך שעות בחבילה"
          className={inputCls}
        />
      )}
      {type === "build" && (
        <p className="text-xs text-slate-400">
          פרוייקט הקמה מתומחר בנפרד — ללא מעקב שעות. ניתן לשייך אותו ללקוח ולנהל בו משימות וקבצים.
        </p>
      )}

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600">הפרויקט נוצר בהצלחה ✓</p>
      )}
      <Submit />
    </form>
  );
}
