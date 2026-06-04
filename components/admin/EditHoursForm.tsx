"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { updateProjectHours } from "@/app/actions/admin";

const initial = { ok: false, error: undefined as string | undefined };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "..." : "עדכן"}
    </button>
  );
}

// Inline editor for a project's allocated hours.
export function EditHoursForm({
  projectId,
  current,
}: {
  projectId: string;
  current: number;
}) {
  const [state, action] = useActionState(updateProjectHours, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="project_id" value={projectId} />
      <input
        name="total_hours"
        type="number"
        step="0.5"
        min="0"
        defaultValue={current}
        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />
      <Submit />
      {state.ok && <span className="text-xs text-emerald-600">✓</span>}
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
