"use client";

import { useEffect, useState } from "react";
import { sumLoggedSeconds } from "@/lib/format";
import type { TimeLog } from "@/lib/types";

// Total logged seconds for a task's segments, re-counted every second while one
// of them is still running.
//
// Without the tick the number freezes at whatever it was when the component
// rendered, because a running segment's contribution is `now - start_time` and
// nothing re-evaluates `now`. That was harmless while the total was only ever a
// label, but anything that *gates* on it (the time-adjustment preview and its
// over-reduction guard) would then disagree with the server, which recomputes
// the total fresh on every write.
export function useLoggedSeconds(logs: TimeLog[]): number {
  const hasActive = logs.some((l) => l.end_time === null);
  const [seconds, setSeconds] = useState(() => sumLoggedSeconds(logs));

  useEffect(() => {
    setSeconds(sumLoggedSeconds(logs));
    if (!hasActive) return;
    const t = setInterval(() => setSeconds(sumLoggedSeconds(logs)), 1000);
    return () => clearInterval(t);
  }, [hasActive, logs]);

  return seconds;
}
