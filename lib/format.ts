// Format a number of seconds as HH:MM:SS.
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

// Decimal hours (e.g. 9.95) → human "X שעות Y דקות" (e.g. "9 שעות 57 דקות",
// "5 דקות", "10 שעות"). Avoids confusing decimals like "9.95 שעות".
export function formatHours(hours: number): string {
  const totalMin = Math.max(0, Math.round(Number(hours || 0) * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h} שעות ${m} דקות`;
  if (h) return `${h} שעות`;
  return `${m} דקות`;
}

// Seconds → HH:MM (no seconds) — for client-facing displays.
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

// Decimal hours (e.g. 5.5) → "HH:MM" clock string ("05:30").
export function formatHoursClock(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(Number(hours || 0) * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

// Format an ISO timestamp as a Hebrew date.
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// "היום" / "אתמול" for recent dates, otherwise the regular short date —
// used for "last activity" style columns where recency is the point.
export function formatRelativeDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "היום";
  if (diffDays === 1) return "אתמול";
  return formatDate(iso);
}

// Sum the duration of a set of time-log rows, counting an active
// (end_time === null) segment up to `now`.
export function sumLoggedSeconds(
  logs: { start_time: string; end_time: string | null; duration_seconds: number | null }[],
  now: number = Date.now()
): number {
  return logs.reduce((acc, log) => {
    if (log.end_time) {
      return acc + (log.duration_seconds ?? 0);
    }
    // Active segment — count elapsed time since start.
    return acc + Math.floor((now - new Date(log.start_time).getTime()) / 1000);
  }, 0);
}
