"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, ArrowUp, ArrowDown } from "@/components/icons";
import { StatusBadge } from "@/components/ui/Badge";
import { RowTimerControl } from "@/components/admin/RowTimerControl";
import { getReadState } from "@/app/actions/messages";
import { Ticket, TimeLog, AdminOption } from "@/lib/types";
import { formatDate, formatDuration, sumLoggedSeconds } from "@/lib/format";
import { useLoggedSeconds } from "@/lib/use-logged-seconds";

export interface TaskRow extends Ticket {
  projects: { name: string; is_retainer: boolean } | null;
  time_logs: TimeLog[];
  clientName: string;
  openedByName?: string;
  lastInboundAt?: string | null;
  assignee_id?: string | null;
  assigneeName?: string;
}

const READS_KEY = "studio.threadReads";

type ColKey = "title" | "project" | "client" | "assignee" | "status" | "created" | "exec";
const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "title", label: "כותרת" },
  { key: "project", label: "פרויקט" },
  { key: "client", label: "לקוח" },
  { key: "assignee", label: "אחראי" },
  { key: "status", label: "סטטוס" },
  { key: "created", label: "תאריך בקשה" },
  { key: "exec", label: "זמן ביצוע" },
];

const STATUS_RANK: Record<string, number> = {
  in_progress: 0,
  paused: 1,
  pending: 2,
  completed: 3,
};

const STORAGE_KEY = "studio.tasksTable.cols";
const PAGE_SIZE = 25;

// Same face and size as every other cell — only the color signals state
// (green while the timer is running). tabular-nums keeps the digits steady.
function LiveTime({ logs }: { logs: TimeLog[] }) {
  const hasActive = logs.some((l) => l.end_time === null);
  const s = useLoggedSeconds(logs);
  return (
    <span className={`tabular-nums ${hasActive ? "text-emerald-600" : ""}`}>
      {formatDuration(s)}
    </span>
  );
}

// Rows are the single entry point: clicking anywhere on a row opens the task
// page (/admin/tasks/[id]) where viewing, replying and managing all live.
// The only in-row action left is the timer; an unread client message shows as
// a bold title + red dot (mail-client style).
export function TasksTable({
  tasks,
  projects,
  admins = [],
  currentUserId,
}: {
  tasks: TaskRow[];
  projects: { id: string; name: string }[];
  admins?: AdminOption[];
  currentUserId?: string;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    title: true,
    project: true,
    client: true,
    assignee: true,
    status: true,
    created: true,
    exec: true,
  });
  const [sortKey, setSortKey] = useState<ColKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showCols, setShowCols] = useState(false);
  const [reads, setReads] = useState<Record<string, number>>({});

  // Filters
  const [statusFilter, setStatusFilter] = useState<"open" | "completed" | "all">("open");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>(""); // "", "__me__", or admin id
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [page, setPage] = useState(1);

  // Per-browser "read at" per thread, merged with the cross-device server
  // state. The task page writes both when opened, so dots clear on return.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(READS_KEY);
      if (raw) setReads(JSON.parse(raw));
    } catch {
      /* noop */
    }
    getReadState().then((server) =>
      setReads((prev) => {
        const m = { ...prev };
        for (const k in server) m[k] = Math.max(m[k] ?? 0, server[k]);
        return m;
      })
    );
  }, []);
  const isUnread = (t: TaskRow) =>
    !!t.lastInboundAt && new Date(t.lastInboundAt).getTime() > (reads[t.id] ?? 0);

  const openTask = (t: TaskRow) => router.push(`/admin/tasks/${t.id}`);

  // Persist column choice.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setVisible((v) => ({ ...v, ...JSON.parse(raw) }));
    } catch {
      /* noop */
    }
  }, []);

  // Reset to page 1 whenever the filters/sort change.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, projectFilter, assigneeFilter, query, sortKey, sortDir, pageSize]);

  const toggleCol = (k: ColKey) =>
    setVisible((v) => {
      const nv = { ...v, [k]: !v[k] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nv));
      } catch {
        /* noop */
      }
      return nv;
    });

  const onSort = (k: ColKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let arr = tasks;
    if (statusFilter === "open") arr = arr.filter((t) => t.status !== "completed");
    else if (statusFilter === "completed") arr = arr.filter((t) => t.status === "completed");
    if (projectFilter) arr = arr.filter((t) => t.project_id === projectFilter);
    if (assigneeFilter === "__me__") arr = arr.filter((t) => t.assignee_id === currentUserId);
    else if (assigneeFilter) arr = arr.filter((t) => t.assignee_id === assigneeFilter);
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter((t) => (t.title || "").toLowerCase().includes(q));
    return arr;
  }, [tasks, statusFilter, projectFilter, assigneeFilter, query, currentUserId]);

  const sorted = useMemo(() => {
    const val = (t: TaskRow): string | number => {
      switch (sortKey) {
        case "title":
          return (t.title || "").toLowerCase();
        case "project":
          return (t.projects?.name || "").toLowerCase();
        case "client":
          return (t.clientName || "").toLowerCase();
        case "assignee":
          return (t.assigneeName || "").toLowerCase();
        case "status":
          return STATUS_RANK[t.status] ?? 9;
        case "created":
          return new Date(t.created_at).getTime();
        case "exec":
          return sumLoggedSeconds(t.time_logs);
      }
    };
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const c = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const cols = COLUMNS.filter((c) => visible[c.key]);
  const colspan = cols.length + 1;

  const Th = ({ k, label }: { k: ColKey; label: string }) => (
    <th className="cursor-pointer select-none px-3 py-2 text-right font-semibold text-slate-600 hover:text-slate-900" onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  // Mail-client-style unread title: bold + red dot. Read rows stay regular.
  // Same size as every other cell — the title stands out by color (black)
  // and, when unread, by weight.
  const TitleCell = ({ t }: { t: TaskRow }) => (
    <span className={`inline-flex items-center gap-2 break-words text-slate-900 ${isUnread(t) ? "font-bold" : "font-medium"}`}>
      {t.title || <span className="italic font-normal text-slate-400">ללא שם</span>}
      {isUnread(t) && (
        <span title="הודעה חדשה מהלקוח" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
      )}
    </span>
  );

  // An unread client message can land on a completed task — flag it on the tab
  // so it isn't missed while viewing "פתוחות".
  const completedUnread = tasks.some((t) => t.status === "completed" && isUnread(t));

  const tabBtn = (key: "open" | "completed" | "all", label: string, dot = false) => (
    <button
      onClick={() => setStatusFilter(key)}
      className={`relative rounded-md px-3 py-1.5 text-sm font-medium ${
        statusFilter === key ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
      {dot && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
      )}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 self-start rounded-lg bg-slate-50 p-1">
          {tabBtn("open", "פתוחות")}
          {tabBtn("completed", "הושלמו", completedUnread)}
          {tabBtn("all", "הכל")}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי כותרת…"
            className="col-span-2 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 sm:w-44"
          />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary sm:w-auto"
            dir="rtl"
          >
            <option value="">כל האתרים</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {admins.length > 0 && (
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary sm:w-auto"
              dir="rtl"
            >
              <option value="">כל האחראים</option>
              {currentUserId && <option value="__me__">המשימות שלי</option>}
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {/* Column toggle only applies to the desktop table — hidden on mobile cards. */}
          <div className="relative col-span-2 hidden sm:col-span-1 sm:block">
            <button onClick={() => setShowCols((v) => !v)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 sm:w-auto">
              <SlidersHorizontal className="h-4 w-4" /> עמודות
            </button>
            {showCols && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowCols(false)} />
                <div className="absolute end-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" dir="rtl">
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={visible[c.key]} onChange={() => toggleCol(c.key)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      {c.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: stacked cards (the table is desktop-only). */}
      <div className="divide-y divide-slate-100 md:hidden">
        {paged.length === 0 && (
          <p className="px-4 py-6 text-center text-slate-400">אין משימות.</p>
        )}
        {paged.map((t) => (
          <div key={t.id} onClick={() => openTask(t)} className="cursor-pointer p-4 hover:bg-slate-50/70">
            <div className="flex items-start justify-between gap-3">
              <TitleCell t={t} />
              <span className="shrink-0">
                <StatusBadge status={t.status} />
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {t.projects?.name && (
                <div className="col-span-2 min-w-0">
                  <dt className="text-xs text-slate-400">פרויקט</dt>
                  <dd className="break-words text-right text-slate-700" dir="ltr">
                    {t.projects.name}
                  </dd>
                </div>
              )}
              {t.clientName && (
                <div className="min-w-0">
                  <dt className="text-xs text-slate-400">לקוח</dt>
                  <dd className="truncate text-slate-700">{t.clientName}</dd>
                  {t.openedByName && (
                    <dd className="truncate text-xs text-slate-400">פתח/ה: {t.openedByName}</dd>
                  )}
                </div>
              )}
              {t.assigneeName && (
                <div className="min-w-0">
                  <dt className="text-xs text-slate-400">אחראי</dt>
                  <dd className="truncate text-slate-700">{t.assigneeName}</dd>
                </div>
              )}
              <div className="min-w-0">
                <dt className="text-xs text-slate-400">תאריך בקשה</dt>
                <dd className="text-slate-600">{formatDate(t.created_at)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-400">זמן ביצוע</dt>
                <dd className="text-slate-600"><LiveTime logs={t.time_logs} /></dd>
              </div>
            </dl>
            {t.status !== "completed" && (
              <div className="mt-3 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                <RowTimerControl ticket={t} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[640px] text-sm" dir="rtl">
          <thead className="border-b border-slate-100 bg-slate-50/60 text-xs">
            <tr>
              {cols.map((c) => (
                <Th key={c.key} k={c.key} label={c.label} />
              ))}
              <th className="px-3 py-2 text-left font-semibold text-slate-600">טיימר</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={colspan} className="px-3 py-6 text-center text-slate-400">
                  אין משימות.
                </td>
              </tr>
            )}
            {paged.map((t) => (
              <tr
                key={t.id}
                onClick={() => openTask(t)}
                className="cursor-pointer border-b border-slate-50 align-middle hover:bg-slate-50/50"
              >
                {visible.title && (
                  <td className="px-3 py-2">
                    <TitleCell t={t} />
                  </td>
                )}
                {visible.project && (
                  <td className="px-3 py-2 text-slate-600">
                    {t.projects?.name && t.project_id ? (
                      <Link
                        href={`/admin/projects/${t.project_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-primary hover:underline"
                      >
                        {t.projects.name}
                      </Link>
                    ) : (
                      t.projects?.name || "—"
                    )}
                  </td>
                )}
                {visible.client && (
                  <td className="px-3 py-2 text-slate-600">
                    {t.clientName || "—"}
                    {t.openedByName && (
                      <span className="mt-0.5 block text-xs text-slate-400">פתח/ה: {t.openedByName}</span>
                    )}
                  </td>
                )}
                {visible.assignee && <td className="px-3 py-2 text-slate-600">{t.assigneeName || "—"}</td>}
                {visible.status && (
                  <td className="px-3 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                )}
                {visible.created && <td className="px-3 py-2 whitespace-nowrap text-slate-600">{formatDate(t.created_at)}</td>}
                {visible.exec && (
                  <td className="px-3 py-2 text-slate-600">
                    <LiveTime logs={t.time_logs} />
                  </td>
                )}
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end">
                    {t.status !== "completed" && <RowTimerControl ticket={t} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer: count + pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-sm text-slate-600">
        <span>{sorted.length} משימות</span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value={25}>25 בעמוד</option>
            <option value={50}>50 בעמוד</option>
          </select>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40"
          >
            הקודם
          </button>
          <span className="text-xs">
            עמוד {safePage} מתוך {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={safePage >= pageCount}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40"
          >
            הבא
          </button>
        </div>
      </div>
    </div>
  );
}
