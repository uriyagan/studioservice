"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { createClientUser } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";

const initial = { ok: false, error: undefined as string | undefined };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "יוצר..." : "צור משתמש"}
    </Button>
  );
}

export function CreateUserForm() {
  const [state, action] = useActionState(createClientUser, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  const fieldCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="flex gap-2">
        <input name="first_name" placeholder="שם פרטי" className={fieldCls} />
        <input name="last_name" placeholder="שם משפחה" className={fieldCls} />
      </div>
      <input
        name="email"
        type="email"
        required
        placeholder="אימייל"
        className={fieldCls}
      />
      <input
        name="password"
        type="text"
        required
        placeholder="סיסמה (6+ תווים)"
        className={fieldCls}
      />
      <select name="role" defaultValue="client" className={fieldCls}>
        <option value="client">לקוח</option>
        <option value="admin">מנהל (אדמין)</option>
      </select>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600">המשתמש נוצר בהצלחה ✓</p>
      )}
      <Submit />
    </form>
  );
}
