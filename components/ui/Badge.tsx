import { TicketStatus, STATUS_LABELS } from "@/lib/types";

const styles: Record<TicketStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// Client-portal presentation of a task's status. The internal pending /
// in_progress / paused trio collapses into two client-facing states: "ממתין"
// until the studio first touches the task (timer started OR an admin message
// sent), then "בטיפול" — in the amber style — until the task is completed.
// Admin screens keep showing the full internal status via StatusBadge.
export type ClientTaskStatus = "pending" | "active" | "completed";

const clientStyles: Record<ClientTaskStatus, { cls: string; label: string }> = {
  pending: { cls: "bg-slate-100 text-slate-600", label: "ממתין" },
  active: { cls: "bg-amber-100 text-amber-700", label: "בטיפול" },
  completed: { cls: "bg-emerald-100 text-emerald-700", label: "הושלם" },
};

export function ClientStatusBadge({ status }: { status: ClientTaskStatus }) {
  const s = clientStyles[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
