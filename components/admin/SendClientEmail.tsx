"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { sendClientEmail } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";

const initial = { ok: false, error: undefined as string | undefined };

const cls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "שולח..." : "שליחה"}
    </Button>
  );
}

export function SendClientEmail({ clientId }: { clientId: string }) {
  const [state, action] = useActionState(sendClientEmail, initial);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      ref.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        ✉️ שליחת מייל יזום
      </Button>
    );
  }

  return (
    <form ref={ref} action={action} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input name="subject" required placeholder="נושא" className={cls} />
      <textarea name="message" required rows={5} placeholder="תוכן ההודעה (אפשר להשתמש בתגיות כמו {first_name})" className={cls} />
      <p className="text-[11px] text-slate-400">המייל נשלח עם עיצוב המותג שלך. תגיות מוחלפות בערכים אמיתיים.</p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <Submit />
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
