"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDateTimeParts } from "@/lib/format";
import { EMAIL_DEFS } from "@/lib/email/types";
import { getEmailLog } from "@/app/actions/email-log";
import { EMAIL_LOG_PAGE, type EmailLogRow } from "@/lib/email-log-shared";

const titleByKey = new Map<string, string>(EMAIL_DEFS.map((d) => [d.key, d.title]));
const templateLabel = (t: string | null) =>
  !t ? "—" : t === "custom" ? "מייל ידני" : t === "test" ? "בדיקה" : titleByKey.get(t) ?? t;

const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "נשלח", cls: "bg-slate-100 text-slate-600" },
  delivered: { label: "נמסר", cls: "bg-emerald-100 text-emerald-700" },
  opened: { label: "נפתח", cls: "bg-blue-100 text-blue-700" },
  clicked: { label: "הוקלק", cls: "bg-blue-100 text-blue-700" },
  delayed: { label: "מתעכב", cls: "bg-amber-100 text-amber-700" },
  bounced: { label: "נדחה", cls: "bg-red-100 text-red-700" },
  complained: { label: "תלונה", cls: "bg-red-100 text-red-700" },
  failed: { label: "נכשל", cls: "bg-red-100 text-red-700" },
};
function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

// The task the email was sent about — a link into the task when we have its
// id, plain text if the task was since deleted, "—" for non-task emails.
function TaskCell({ row }: { row: EmailLogRow }) {
  if (!row.ticket_id) return <span className="text-slate-400">—</span>;
  const label = row.task_title || "משימה";
  if (!row.task_title) return <span className="text-slate-400">{label}</span>;
  return (
    <Link href={`/admin/tasks/${row.ticket_id}`} className="text-slate-700 hover:text-primary hover:underline">
      {label}
    </Link>
  );
}

export function EmailLogView({ initialRows }: { initialRows: EmailLogRow[] }) {
  const [rows, setRows] = useState<EmailLogRow[]>(initialRows);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(initialRows.length >= EMAIL_LOG_PAGE);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  // Debounced search.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(async () => {
      setLoading(true);
      const r = await getEmailLog({ offset: 0, query });
      setRows(r);
      setHasMore(r.length >= EMAIL_LOG_PAGE);
      setLoading(false);
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  const loadMore = async () => {
    setLoading(true);
    const r = await getEmailLog({ offset: rows.length, query });
    setRows((prev) => [...prev, ...r]);
    setHasMore(r.length >= EMAIL_LOG_PAGE);
    setLoading(false);
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-slate-900">לוג שליחת מיילים</h2>
      <p className="mb-4 text-sm text-slate-500">כל המיילים שיצאו מהמערכת, כולל סטטוס מסירה.</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש לפי נמען או נושא…"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">
          {loading ? "טוען…" : "אין מיילים להצגה (ייתכן שטבלת הלוג טרם הופעלה)."}
        </p>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-2 sm:hidden">
            {rows.map((e) => {
              const { date, time } = formatDateTimeParts(e.created_at);
              return (
                <div key={e.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-slate-800" dir="ltr">{e.to_email}</span>
                    <StatusPill status={e.status} />
                  </div>
                  {e.subject && <p className="mt-1 break-words text-sm text-slate-600">{e.subject}</p>}
                  {e.ticket_id && (
                    <p className="mt-1 break-words text-xs text-slate-500">
                      משימה: <TaskCell row={e} />
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                    <span>{templateLabel(e.template)}</span>
                    {/* One LTR run so bidi doesn't flip the date and time. */}
                    <span dir="ltr">{date} · {time}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[760px] text-sm" dir="rtl">
              <thead className="border-b border-slate-100 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right font-semibold">תאריך</th>
                  <th className="px-3 py-2 text-right font-semibold">נמען</th>
                  <th className="px-3 py-2 text-right font-semibold">סוג</th>
                  <th className="px-3 py-2 text-right font-semibold">נושא</th>
                  <th className="px-3 py-2 text-right font-semibold">משימה</th>
                  <th className="px-3 py-2 text-right font-semibold">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const { date, time } = formatDateTimeParts(e.created_at);
                  return (
                    <tr key={e.id} className="border-b border-slate-50">
                      <td className="px-3 py-2 whitespace-nowrap align-top text-slate-500">
                        <div>{date}</div>
                        <div className="text-xs text-slate-400">{time}</div>
                      </td>
                      <td className="px-3 py-2 align-top text-slate-800" dir="ltr">{e.to_email}</td>
                      <td className="px-3 py-2 whitespace-nowrap align-top text-slate-600">{templateLabel(e.template)}</td>
                      <td className="px-3 py-2 align-top text-slate-600">{e.subject || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        <TaskCell row={e} />
                      </td>
                      <td className="px-3 py-2 align-top"><StatusPill status={e.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <Button variant="ghost" onClick={loadMore} disabled={loading}>
                {loading ? "טוען…" : "טען עוד"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
