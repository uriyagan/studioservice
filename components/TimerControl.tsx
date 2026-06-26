"use client";

import { useEffect, useState, useTransition } from "react";
import { Ticket, TimeLog } from "@/lib/types";
import { formatDuration, sumLoggedSeconds } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { startTimer, pauseTimer, completeTask } from "@/app/actions/timer";

// Live, refresh-safe timer. Elapsed time is derived entirely from
// the time_logs rows in the DB — the active segment (end_time null)
// is counted from its start_time, so a page refresh recomputes the
// exact same value and keeps ticking.
export function TimerControl({
  ticket,
  logs,
  showComplete = true,
}: {
  ticket: Ticket;
  logs: TimeLog[];
  showComplete?: boolean;
}) {
  const hasActive = logs.some((l) => l.end_time === null);
  const [elapsed, setElapsed] = useState(() => sumLoggedSeconds(logs));
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");

  // Tick once a second only while a segment is actively running.
  useEffect(() => {
    if (!hasActive) {
      setElapsed(sumLoggedSeconds(logs));
      return;
    }
    const tick = () => setElapsed(sumLoggedSeconds(logs));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hasActive, logs]);

  const run = (fn: () => Promise<void>) => startTransition(() => void fn());

  const running = ticket.status === "in_progress";
  const done = ticket.status === "completed";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        className={`font-mono text-lg font-semibold tabular-nums ${
          running ? "text-blue-600" : "text-slate-700"
        }`}
      >
        {formatDuration(elapsed)}
        {running && <span className="ms-1 animate-pulse">●</span>}
      </span>

      {done ? (
        <span className="text-sm text-emerald-600">הטיפול הסתיים ✓</span>
      ) : (
        <>
          {ticket.status === "pending" && (
            <Button
              variant="primary"
              disabled={isPending}
              onClick={() => run(() => startTimer(ticket.id))}
            >
              ▶ התחל טיפול
            </Button>
          )}

          {ticket.status === "paused" && (
            <Button
              variant="primary"
              disabled={isPending}
              onClick={() => run(() => startTimer(ticket.id))}
            >
              ▶ המשך טיימר
            </Button>
          )}

          {running && (
            <Button
              variant="warning"
              disabled={isPending}
              onClick={() => run(() => pauseTimer(ticket.id))}
            >
              ⏸ עצירת טיימר
            </Button>
          )}

          {showComplete && ticket.status !== "pending" && (
            <Button variant="success" disabled={isPending} onClick={() => setConfirming(true)}>
              ✓ הטיפול הסתיים
            </Button>
          )}
        </>
      )}

      {confirming && (
        <Modal title="סיום המשימה ועדכון הלקוח" onClose={() => setConfirming(false)} closeOnBackdrop={false}>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">המשימה תסומן כהושלמה והלקוח יקבל עדכון במייל.</p>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">הערה למייל ללקוח (אופציונלי)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="סיכום קצר שיצורף למייל העדכון ללקוח…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="success"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    await completeTask(ticket.id, note);
                    setConfirming(false);
                    setNote("");
                  })
                }
              >
                {isPending ? "מסיים…" : "סיים ועדכן לקוח"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
                ביטול
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
