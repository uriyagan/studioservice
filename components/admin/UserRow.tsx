"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { updateClientUser, deleteClientUser } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Profile } from "@/lib/types";
import { formatDate } from "@/lib/format";

const initial = { ok: false, error: undefined as string | undefined };

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function SaveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "שומר..." : "שמור"}
    </Button>
  );
}

function DeleteBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" disabled={pending} className="text-red-600 hover:bg-red-50">
      {pending ? "מוחק..." : "מחק"}
    </Button>
  );
}

export function UserRow({ client }: { client: Profile }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateClientUser, initial);
  const [delState, delAction] = useActionState(deleteClientUser, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">{client.name || "—"}</p>
          <p className="truncate text-sm text-slate-500">{client.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="me-2 hidden text-xs text-slate-400 sm:inline">
            {formatDate(client.created_at)}
          </span>
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "ביטול" : "עריכה"}
          </Button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`למחוק את הלקוח "${client.name || client.email}"? הפרויקט שלו יישמר ללא לקוח משויך.`))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="id" value={client.id} />
            <DeleteBtn />
          </form>
        </div>
      </div>

      {editing && (
        <form ref={formRef} action={editAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="id" value={client.id} />
          <input name="name" defaultValue={client.name ?? ""} placeholder="שם הלקוח" className={inputCls} />
          <input
            name="email"
            type="email"
            required
            defaultValue={client.email}
            placeholder="אימייל"
            className={inputCls}
          />
          <input
            name="password"
            type="text"
            placeholder="סיסמה חדשה (השאר ריק כדי לא לשנות)"
            className={inputCls}
          />
          {editState.error && <p className="text-sm text-red-600">{editState.error}</p>}
          <SaveBtn />
        </form>
      )}

      {delState.error && <p className="mt-2 text-sm text-red-600">{delState.error}</p>}
    </div>
  );
}
