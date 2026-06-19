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
    <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
      <Button variant="success" disabled={isPending} onClick={go} className="w-full sm:w-auto">
        {isPending ? "מתחיל..." : "▶ התחל טיימר מיידי"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
