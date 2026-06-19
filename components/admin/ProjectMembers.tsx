"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addProjectMember, removeProjectMember } from "@/app/actions/clients";
import { Button } from "@/components/ui/Button";
import { Trash2, Loader2 } from "@/components/icons";

const initial = { ok: false, error: undefined as string | undefined };

export interface MemberRow {
  id: string;
  name: string;
  email: string;
}

function AddBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "מוסיף..." : "הוספה"}
    </Button>
  );
}

function RemoveBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" disabled={pending} title="הסרה" className="p-2 text-red-600 hover:bg-red-50">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}

export function ProjectMembers({
  projectId,
  ownerId,
  members,
  clients,
}: {
  projectId: string;
  ownerId: string | null;
  members: MemberRow[];
  clients: MemberRow[];
}) {
  const [addState, addAction] = useActionState(addProjectMember, initial);
  const [, removeAction] = useActionState(removeProjectMember, initial);
  const [pick, setPick] = useState("");

  // Candidates = clients who aren't already the owner or a member.
  const memberIds = new Set(members.map((m) => m.id));
  const candidates = clients.filter((c) => c.id !== ownerId && !memberIds.has(c.id));

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

  return (
    <div className="space-y-3">
      {members.length === 0 ? (
        <p className="text-sm text-slate-400">אין משתתפים נוספים. רק בעל הפרויקט רואה אותו.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{m.name || m.email}</p>
                {m.name && <p className="truncate text-xs text-slate-500">{m.email}</p>}
              </div>
              <form action={removeAction}>
                <input type="hidden" name="project_id" value={projectId} />
                <input type="hidden" name="profile_id" value={m.id} />
                <RemoveBtn />
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addAction} className="flex items-center gap-2">
        <input type="hidden" name="project_id" value={projectId} />
        <select
          name="profile_id"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className={inputCls}
          required
        >
          <option value="">הוספת משתתף…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || c.email}
            </option>
          ))}
        </select>
        <AddBtn />
      </form>
      {addState.error && <p className="text-sm text-red-600">{addState.error}</p>}
    </div>
  );
}
