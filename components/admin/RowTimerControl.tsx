"use client";

import { useState, useTransition } from "react";
import { Ticket } from "@/lib/types";
import { startTimer, pauseTimer, completeTask } from "@/app/actions/timer";
import { Play, Pause, Check } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// Compact per-row timer: two same-size buttons next to the row's action icons.
// A black play button that toggles to pause while running, and a green check
// that marks the task completed. The live elapsed time is shown by the
// "זמן ביצוע" column (not here), so there's no duplicate timer.
export function RowTimerControl({ ticket }: { ticket: Ticket }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  if (ticket.status === "completed") return null;

  const running = ticket.status === "in_progress";
  const run = (fn: () => Promise<void>) => start(() => void fn());

  const confirmComplete = () =>
    run(async () => {
      await completeTask(ticket.id, note);
      setConfirming(false);
      setNote("");
    });

  return (
    <>
      <button
        onClick={() => run(() => (running ? pauseTimer(ticket.id) : startTimer(ticket.id)))}
        disabled={pending}
        title={running ? "השהיית טיימר" : "התחל טיפול"}
        className={`inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full hover:opacity-90 disabled:opacity-50 ${
          running ? "bg-emerald-500" : "bg-black"
        }`}
      >
        {running ? <Pause className="h-[26px] w-[26px] text-white" /> : <Play className="h-[26px] w-[26px] text-white" />}
      </button>
      <button
        onClick={() => setConfirming(true)}
        disabled={pending}
        title="סמן כהושלמה"
        className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-[#f5f5f5] hover:bg-slate-200 disabled:opacity-50"
      >
        <Check className="h-[26px] w-[26px] text-emerald-500" />
      </button>

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
              <Button variant="success" disabled={pending} onClick={confirmComplete}>
                {pending ? "מסיים…" : "סיים ועדכן לקוח"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
                ביטול
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
