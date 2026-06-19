"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { updateProject, deleteProject } from "@/app/actions/admin";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Profile, ProjectStats } from "@/lib/types";
import { formatHours } from "@/lib/format";
import { Pencil, Trash2, X, Loader2 } from "@/components/icons";

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
    <Button type="submit" variant="ghost" disabled={pending} title="מחק" className="p-2 text-red-600 hover:bg-red-50">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

export function ProjectRow({
  project,
  clients,
}: {
  project: ProjectStats;
  clients: Profile[];
}) {
  const [editing, setEditing] = useState(false);
  const [isRetainer, setIsRetainer] = useState(project.is_retainer);
  const [editState, editAction] = useActionState(updateProject, initial);
  const [delState, delAction] = useActionState(deleteProject, initial);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={`/admin/projects/${project.id}`}
            className="font-semibold text-slate-900 hover:text-primary hover:underline"
          >
            {project.name}
          </Link>
          {project.is_retainer ? (
            <span className="mt-1 inline-block rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-primary">
              ריטיינר · שעות בלתי מוגבלות
            </span>
          ) : (
            <p className="mt-1 text-sm text-slate-500">
              נוצלו {formatHours(project.hours_used)} מתוך{" "}
              {formatHours(project.total_hours_allocated)} ·{" "}
              <span className="font-medium text-slate-700">
                נותרו {formatHours(project.hours_remaining)}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            title={editing ? "ביטול" : "עריכה"}
            className="p-2"
            onClick={() => {
              setIsRetainer(project.is_retainer);
              setEditing((v) => !v);
            }}
          >
            {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </Button>
          <form
            action={delAction}
            onSubmit={(e) => {
              if (!confirm(`למחוק את הפרויקט "${project.name}"? כל המשימות והשעות שלו יימחקו לצמיתות.`))
                e.preventDefault();
            }}
          >
            <input type="hidden" name="project_id" value={project.id} />
            <DeleteBtn />
          </form>
        </div>
      </div>

      {editing && (
        <form action={editAction} className="mt-4 space-y-3 rounded-lg bg-slate-50 p-3">
          <input type="hidden" name="project_id" value={project.id} />
          <input name="name" required defaultValue={project.name} placeholder="שם הפרויקט" className={inputCls} />

          <select name="client_id" className={inputCls} defaultValue={project.client_id ?? ""}>
            <option value="">ללא לקוח משויך</option>
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
              defaultValue={project.total_hours_allocated}
              placeholder="סך שעות בחבילה"
              className={inputCls}
            />
          )}

          {editState.error && <p className="text-sm text-red-600">{editState.error}</p>}
          <SaveBtn />
        </form>
      )}

      {delState.error && <p className="mt-2 text-sm text-red-600">{delState.error}</p>}
    </Card>
  );
}
