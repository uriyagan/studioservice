"use client";

import { useTransition } from "react";
import { Ticket } from "@/lib/types";
import { startTimer, pauseTimer } from "@/app/actions/timer";
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
export function RowTimerControl({ ticket, blocked = false }: { ticket: Ticket; blocked?: boolean }) {
  const [pending, start] = useTransition();
  if (ticket.status === "completed") return null;

  const running = ticket.status === "in_progress";
  const startBlocked = blocked && !running;
  const run = (fn: () => Promise<void>) =>
    start(() => void fn().catch((e) => showToast((e as Error)?.message || "הפעולה נכשלה", "error")));

  return (
    <button
      onClick={() => run(() => (running ? pauseTimer(ticket.id) : startTimer(ticket.id)))}
      disabled={pending || startBlocked}
      title={
        startBlocked ? "אין חבילה פעילה בפרויקט — הטיימר חסום" : running ? "השהיית טיימר" : "התחלת טיפול"
      }
      className={`inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full hover:opacity-90 disabled:opacity-40 ${
        startBlocked ? "cursor-not-allowed" : ""
      } ${running ? "bg-emerald-500" : "bg-black"}`}
    >
      {running ? <Pause className="h-[26px] w-[26px] text-white" /> : <Play className="h-[26px] w-[26px] text-white" />}
    </button>
  );
}
