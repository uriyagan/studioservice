"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TimerControl } from "@/components/TimerControl";
import { updateTicket, deleteTicket } from "@/app/actions/admin";
import { Ticket, TimeLog } from "@/lib/types";
import { formatDate } from "@/lib/format";

const initial = { ok: false, error: undefined as string | undefined };

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface TaskCardTicket extends Ticket {
  projects: { name: string; is_retainer: boolean } | null;
  time_logs: TimeLog[];
}

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
    <Button
      type="submit"
      variant="ghost"
      disabled={pending}
      className="text-red-600 hover:bg-red-50"
    >
      {pending ? "מוחק..." : "מחק"}
    </Button>
  );
}

export function TaskCard({
  ticket,
  projects,
  showProject = true,
}: {
  ticket: TaskCardTicket;
  projects: { id: string; name: string }[];
  showProject?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState(updateTicket, initial);
  const [delState, delAction] = useActionState(deleteTicket, initial);
  const done = ticket.status === "completed";

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  return (
    <Card className={done ? "opacity-80" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={
                done
                  ? "font-medium text-slate-700"
                  : "font-semibold text-slate-900"
              }
            >
              {ticket.title || (
                <span className="italic text-slate-400">ללא שם</span>
              )}
            </h3>
            <StatusBadge status={ticket.status} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {showProject && (
              <>
                {ticket.projects?.name ?? "ללא פרויקט"}
                {ticket.projects?.is_retainer && " · ריטיינר"}
                {" · "}
              </>
            )}
            {formatDate(done ? ticket.completed_at : ticket.created_at)}
          </p>
          {ticket.description && (
            <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm text-slate-600">
              {ticket.description}
            </p>
          )}
          {ticket.link && (
            <a
              href={ticket.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm text-primary hover:underline"
            >
              לינק רלוונטי ↗
            </a>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <TimerControl ticket={ticket} logs={ticket.time_logs} />
          <div className="flex items-center gap-1">
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "ביטול" : "עריכה"}
            </Button>
            <form
              action={delAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `למחוק את המשימה "${ticket.title || "ללא שם"}"? הזמן שתועד בה יימחק לצמיתות.`
                  )
                )
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="id" value={ticket.id} />
              <input
                type="hidden"
                name="project_id"
                value={ticket.project_id ?? ""}
              />
              <DeleteBtn />
            </form>
          </div>
        </div>
      </div>

      {editing && (
        <form
          action={editAction}
          className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={ticket.id} />
          <input
            name="title"
            defaultValue={ticket.title ?? ""}
            placeholder="שם המשימה"
            className={inputCls}
          />
          <select
            name="project_id"
            className={inputCls}
            defaultValue={ticket.project_id ?? ""}
          >
            <option value="">ללא פרויקט</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <textarea
            name="description"
            rows={2}
            defaultValue={ticket.description ?? ""}
            placeholder="תיאור (אופציונלי)"
            className={`${inputCls} sm:col-span-2`}
          />
          {editState.error && (
            <p className="text-sm text-red-600 sm:col-span-2">
              {editState.error}
            </p>
          )}
          <div className="sm:col-span-2">
            <SaveBtn />
          </div>
        </form>
      )}

      {delState.error && (
        <p className="mt-2 text-sm text-red-600">{delState.error}</p>
      )}
    </Card>
  );
}
