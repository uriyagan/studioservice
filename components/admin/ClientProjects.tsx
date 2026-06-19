"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { assignProjects } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";
import { formatHours } from "@/lib/format";

const initial = { ok: false, error: undefined as string | undefined };

export interface ProjectOpt {
  id: string;
  name: string;
  is_retainer: boolean;
  hours_remaining: number;
  total_hours_allocated: number;
  client_id: string | null;
  ownerName: string;
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "שומר..." : "שמירת שיוך"}
    </Button>
  );
}

export function ClientProjects({
  clientId,
  projects,
}: {
  clientId: string;
  projects: ProjectOpt[];
}) {
  const [state, action] = useActionState(assignProjects, initial);
  const [msg, setMsg] = useState(false);
  useEffect(() => {
    if (state.ok) {
      setMsg(true);
      const t = setTimeout(() => setMsg(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state.ok]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="client_id" value={clientId} />
      <div className="divide-y divide-slate-100">
        {projects.length === 0 && <p className="py-2 text-sm text-slate-400">אין פרויקטים.</p>}
        {projects.map((p) => {
          const mine = p.client_id === clientId;
          const takenByOther = p.client_id && !mine;
          return (
            <label key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" name="project_ids" value={p.id} defaultChecked={mine} className="h-4 w-4 rounded border-slate-300 text-primary" />
                <span className="font-medium text-slate-800">{p.name}</span>
                {takenByOther && <span className="text-xs text-amber-600">משויך כעת ל{p.ownerName || "לקוח אחר"}</span>}
              </span>
              <span className="text-xs text-slate-500">
                {p.is_retainer ? "ריטיינר" : `נותרו ${formatHours(p.hours_remaining)}`}
              </span>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Save />
        {msg && <span className="text-sm text-emerald-600">נשמר ✓</span>}
        {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
