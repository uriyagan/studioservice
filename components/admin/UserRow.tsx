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

export function UserRow({
  client,
  isSelf = false,
}: {
  client: Profile;
  isSelf?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateClientUser, initial);
  const [delState, delAction] = useActionState(deleteClientUser, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const isAdmin = client.role === "admin";

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate font-medium text-slate-800">
            {client.name || "—"}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isAdmin
                  ? "bg-primary-light text-primary"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {isAdmin ? "מנהל" : "לקוח"}
            </span>
            {isSelf && <span className="text-xs text-slate-400">(אתה)</span>}
          </p>
          <p className="truncate text-sm text-slate-500">{client.email}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="me-2 hidden text-xs text-slate-400 sm:inline">
            {formatDate(client.created_at)}
          </span>
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "ביטול" : "עריכה"}
          </Button>
          {!isSelf && (
            <form
              action={delAction}
              onSubmit={(e) => {
                if (!confirm(`למחוק את המשתמש "${client.name || client.email}"? פרויקט משויך יישמר ללא לקוח.`))
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={client.id} />
              <DeleteBtn />
            </form>
          )}
        </div>
      </div>

      {editing && (
        <form ref={formRef} action={editAction} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="id" value={client.id} />
          <div className="grid grid-cols-2 gap-2">
            <input name="first_name" defaultValue={client.first_name ?? ""} placeholder="שם פרטי" className={inputCls} />
            <input name="last_name" defaultValue={client.last_name ?? ""} placeholder="שם משפחה" className={inputCls} />
          </div>
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
          <select
            name={isSelf ? undefined : "role"}
            defaultValue={client.role}
            disabled={isSelf}
            className={`${inputCls} disabled:opacity-60`}
          >
            <option value="client">לקוח</option>
            <option value="admin">מנהל (אדמין)</option>
          </select>
          {/* Disabled controls don't submit — keep the role so a self-edit
              (name/email/password) doesn't trip the self-lockout guard. */}
          {isSelf && <input type="hidden" name="role" value={client.role} />}
          {isSelf && (
            <p className="text-xs text-slate-400">לא ניתן לשנות לעצמך הרשאה.</p>
          )}
          {editState.error && <p className="text-sm text-red-600">{editState.error}</p>}
          <SaveBtn />
        </form>
      )}

      {delState.error && <p className="mt-2 text-sm text-red-600">{delState.error}</p>}
    </div>
  );
}
