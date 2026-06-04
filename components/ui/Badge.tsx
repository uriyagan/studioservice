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
