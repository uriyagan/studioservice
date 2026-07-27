"use client";

import { useTransition } from "react";
import { Ticket } from "@/lib/types";
import { startTimer, pauseTimer, toggleFlatTaskStatus } from "@/app/actions/timer";
import { Play, Pause } from "@/components/icons";
import { showToast } from "@/components/ui/Toast";

// Compact timer toggle: a black play button that turns green (and shows pause)
// while running. The live elapsed time is shown by the "זמן ביצוע" column /
// the task page header, so there's no duplicate clock here. Completing a task
// happens only on the task page (single, confirmed flow).
//
// `blocked` = the project's active package is exhausted → starting is disabled
// (pausing a running timer always stays allowed). A start rejected server-side
// (e.g. the package ran out between render and click) surfaces as a red toast.
//
// `noTimer` = build / retainer project with no hours package: there is no timer
// at all, so the button just flips the status ממתין ⇄ בטיפול. It never turns
// green (no running clock) and is never package-blocked.
export function RowTimerControl({
  ticket,
  blocked = false,
  noTimer = false,
  running: runningProp,
}: {
  ticket: Ticket;
  blocked?: boolean;
  noTimer?: boolean;
  // Actual timer state (is a time-log segment open). Defaults to the status,
  // but a manually-set "in_progress" has no open segment, so callers with the
  // logs pass the real value to avoid a false green/pause button.
  running?: boolean;
}) {
  const [pending, start] = useTransition();
  if (ticket.status === "completed") return null;

  // noTimer flips status, so its "running" IS the status; a real timer keys off
  // an open segment.
  const running = noTimer ? ticket.status === "in_progress" : runningProp ?? ticket.status === "in_progress";
  const startBlocked = blocked && !running && !noTimer;
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r && r.ok === false) showToast(r.error || "הפעולה נכשלה", "error");
      } catch (e) {
        showToast((e as Error)?.message || "הפעולה נכשלה", "error");
      }
    });

  const onClick = () => {
    if (noTimer) return run(() => toggleFlatTaskStatus(ticket.id));
    return run(() => (running ? pauseTimer(ticket.id) : startTimer(ticket.id)));
  };

  const title = noTimer
    ? running
      ? "החזרה לסטטוס ממתין"
      : "העברה לטיפול"
    : startBlocked
      ? "אין חבילה פעילה בפרויקט — הטיימר חסום"
      : running
        ? "השהיית טיימר"
        : "התחלת טיפול";

  // Green only signals a live running clock — that never applies to noTimer.
  const green = running && !noTimer;

  return (
    <button
      onClick={onClick}
      disabled={pending || startBlocked}
      title={title}
      className={`inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full hover:opacity-90 disabled:opacity-40 ${
        startBlocked ? "cursor-not-allowed" : ""
      } ${green ? "bg-emerald-500" : "bg-black"}`}
    >
      {running ? <Pause className="h-[26px] w-[26px] text-white" /> : <Play className="h-[26px] w-[26px] text-white" />}
    </button>
  );
}
