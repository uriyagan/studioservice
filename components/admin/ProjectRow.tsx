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
  const projectType: "hours" | "retainer" | "build" = project.is_build
    ? "build"
    : project.is_retainer
      ? "retainer"
      : "hours";
  const [type, setType] = useState<"hours" | "retainer" | "build">(projectType);
  const [editState, editAction] = useActionState(updateProject, initial);
  const [delState, delAction] = useActionState(deleteProject, initial);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState.ok]);

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <Link
          href={`/admin/projects/${project.id}`}
          className="min-w-0 break-words font-semibold text-slate-900 hover:text-primary hover:underline sm:max-w-[200px] sm:shrink sm:truncate"
        >
          {project.name}
        </Link>

        <div className="min-w-0 sm:flex-1">
          {project.is_build ? (
            <span className="inline-block max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 align-middle text-xs font-medium text-slate-600">
              פרוייקט הקמה
            </span>
          ) : project.is_retainer ? (
            <span className="inline-block max-w-full truncate rounded-full bg-primary-light px-2.5 py-1 align-middle text-xs font-medium text-primary">
              ריטיינר · שעות בלתי מוגבלות
            </span>
          ) : (
            (() => {
              const total = Number(project.total_hours_allocated) || 0;
              const remaining = Math.max(0, Number(project.hours_remaining) || 0);
              const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
              const bar = pct <= 20 ? "bg-red-500" : pct <= 50 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <div
                  className="flex items-center gap-3"
                  title={`נוצלו ${formatHours(project.hours_used)} מתוך ${formatHours(project.total_hours_allocated)}`}
                >
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-sm">
                    <b className="text-slate-800">{pct}%</b> <span className="text-slate-500">נותרו</span>
                  </span>
                </div>
              );
            })()
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            title={editing ? "ביטול" : "עריכה"}
            className="p-2"
            onClick={() => {
              setType(projectType);
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
