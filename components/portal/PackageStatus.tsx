import { formatDate, formatHours } from "@/lib/format";
import { ProjectStats } from "@/lib/types";

// The client-facing state of one project's hour package: which package is
// running, how much of it is gone, how much is left. Shared by the dashboard
// and the packages page so the same package can never be described two
// different ways on two screens. The project's NAME is the caller's business —
// each screen frames it differently (a card heading vs. a row label).
export function PackageStatus({
  project: p,
  className = "",
}: {
  project: ProjectStats;
  className?: string;
}) {
  if (p.is_build) {
    return (
      <div className={className}>
        <Pill tone="slate">פרוייקט הקמה · ללא מעקב שעות</Pill>
      </div>
    );
  }

  if (p.is_retainer) {
    return (
      <div className={className}>
        <Pill tone="primary">ריטיינר פעיל · שעות בלתי מוגבלות</Pill>
      </div>
    );
  }

  if (!p.has_active) {
    return (
      <div className={className}>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
          <p className="font-medium text-amber-700">אין חבילה פעילה</p>
          <p className="mt-1 text-slate-500">כדי להמשיך יש לרכוש חבילה חדשה.</p>
        </div>
      </div>
    );
  }

  const total = Number(p.total_hours_allocated) || 0;
  const remaining = Math.max(0, Number(p.hours_remaining) || 0);
  const used = Math.max(0, total - remaining);
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  // Running low: the bar and the remaining figure go red together, so the
  // warning never rests on colour alone.
  const low = total > 0 && remaining / total <= 0.2;
  const valueText = `נוצלו ${formatHours(used)} מתוך ${formatHours(total)}`;

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Pill tone="slate">{p.active_source === "studio" ? 'נוספה ע"י הצוות' : "רכשת"}</Pill>
        {p.active_started_at && (
          <span className="text-slate-400">הופעלה {formatDate(p.active_started_at)}</span>
        )}
        {p.queued_count ? <span className="text-slate-400">· {p.queued_count} בתור</span> : null}
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={usedPct}
        aria-valuetext={valueText}
        aria-label="ניצול חבילת השעות"
        className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
            low ? "bg-red-500" : "bg-primary"
          }`}
          style={{ width: `${usedPct}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
        <span>
          נרכשו: <b className="font-medium text-slate-800">{formatHours(total)}</b>
        </span>
        <span>
          נוצלו: <b className="font-medium text-slate-800">{formatHours(used)}</b>
        </span>
        <span>
          נותרו:{" "}
          <b className={`font-medium ${low ? "text-red-600" : "text-slate-800"}`}>
            {formatHours(remaining)}
          </b>
        </span>
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "slate" | "primary"; children: React.ReactNode }) {
  const cls =
    tone === "primary" ? "bg-primary-light text-primary" : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}
