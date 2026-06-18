"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { quickStartTimer } from "@/app/actions/timer";

// Starts a timer immediately on a blank task. The new task appears at
// the top of the list, where it can be named + assigned to a project.
export function QuickStartButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const go = () =>
    startTransition(async () => {
      setError(null);
      try {
        await quickStartTimer();
      } catch (e) {
        setError((e as Error).message);
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="success" disabled={isPending} onClick={go}>
        {isPending ? "מתחיל..." : "▶ התחל טיימר מיידי"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
