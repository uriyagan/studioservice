"use client";

import { useTransition } from "react";
import { Ticket } from "@/lib/types";
import { startTimer, pauseTimer, completeTask } from "@/app/actions/timer";
import { Play, Pause, Check } from "@/components/icons";

// Compact per-row timer: two same-size buttons next to the row's action icons.
// A black play button that toggles to pause while running, and a green check
// that marks the task completed. The live elapsed time is shown by the
// "זמן ביצוע" column (not here), so there's no duplicate timer.
export function RowTimerControl({ ticket }: { ticket: Ticket }) {
  const [pending, start] = useTransition();
  if (ticket.status === "completed") return null;

  const running = ticket.status === "in_progress";
  const run = (fn: () => Promise<void>) => start(() => void fn());

  const complete = () => {
    if (!confirm("לסמן את המשימה כהושלמה? הלקוח יקבל על כך עדכון במייל.")) return;
    run(() => completeTask(ticket.id));
  };

  return (
    <>
      <button
        onClick={() => run(() => (running ? pauseTimer(ticket.id) : startTimer(ticket.id)))}
        disabled={pending}
        title={running ? "השהיית טיימר" : "התחל טיפול"}
        className="rounded-full bg-black p-2 hover:opacity-90 disabled:opacity-50"
      >
        {running ? <Pause className="h-5 w-5 text-white" /> : <Play className="h-5 w-5 text-white" />}
      </button>
      <button
        onClick={complete}
        disabled={pending}
        title="סמן כהושלמה"
        className="rounded p-2 hover:bg-slate-100 disabled:opacity-50"
      >
        <Check className="h-5 w-5 text-emerald-500" />
      </button>
    </>
  );
}
