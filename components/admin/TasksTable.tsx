"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
import { Pencil, Trash2, SlidersHorizontal, ArrowUp, ArrowDown, MessageSquare } from "@/components/icons";
import { TaskThread } from "@/components/admin/TaskThread";
import { TaskDetails } from "@/components/admin/TaskDetails";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TimerControl } from "@/components/TimerControl";
import { updateTicket, deleteTicket } from "@/app/actions/admin";
import { Ticket, TimeLog } from "@/lib/types";
import { formatDate, formatDuration, sumLoggedSeconds } from "@/lib/format";

const initial = { ok: false, error: undefined as string | undefined };

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

export interface TaskRow extends Ticket {
  projects: { name: string; is_retainer: boolean } | null;
  time_logs: TimeLog[];
  clientName: string;
  lastInboundAt?: string | null;
}

const READS_KEY = "studio.threadReads";

type ColKey = "title" | "project" | "client" | "status" | "created" | "exec";
const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "title", label: "כותרת" },
  { key: "project", label: "אתר" },
  { key: "client", label: "לקוח" },
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

function LiveTime({ logs }: { logs: TimeLog[] }) {
  const hasActive = logs.some((l) => l.end_time === null);
  const [s, setS] = useState(() => sumLoggedSeconds(logs));
  useEffect(() => {
    setS(sumLoggedSeconds(logs));
    if (!hasActive) return;
    const t = setInterval(() => setS(sumLoggedSeconds(logs)), 1000);
    return () => clearInterval(t);
  }, [hasActive, logs]);
  return <span className="font-mono tabular-nums">{formatDuration(s)}</span>;
}

export function TasksTable({
  tasks,
  projects,
}: {
  tasks: TaskRow[];
  projects: { id: string; name: string }[];
}) {
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({
    title: true,
    project: true,
    client: true,
    status: true,
    created: true,
    exec: true,
  });
  const [sortKey, setSortKey] = useState<ColKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showCols, setShowCols] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [threadFor, setThreadFor] = useState<TaskRow | null>(null);
  const [detailsFor, setDetailsFor] = useState<TaskRow | null>(null);
  const [reads, setReads] = useState<Record<string, number>>({});

  // Filters
  const [statusFilter, setStatusFilter] = useState<"open" | "completed" | "all">("open");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [page, setPage] = useState(1);

  // Per-browser "read at" per thread — the unread dot clears on open.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(READS_KEY);
      if (raw) setReads(JSON.parse(raw));
    } catch {
      /* noop */
    }
  }, []);
  const isUnread = (t: TaskRow) =>
    !!t.lastInboundAt && new Date(t.lastInboundAt).getTime() > (reads[t.id] ?? 0);
  const openThread = (t: TaskRow) => {
    setThreadFor(t);
    setReads((prev) => {
      const nv = { ...prev, [t.id]: Date.now() };
      try {
        localStorage.setItem(READS_KEY, JSON.stringify(nv));
      } catch {
        /* noop */
      }
      return nv;
    });
  };

  const [editState, editAction] = useActionState(updateTicket, initial);
  const [delState, delAction] = useActionState(deleteTicket, initial);

  // Persist column choice.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setVisible((v) => ({ ...v, ...JSON.parse(raw) }));
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    if (editState.ok) setEditingId(null);
  }, [editState.ok]);

  // Reset to page 1 whenever the filters/sort change.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, projectFilter, query, sortKey, sortDir, pageSize]);

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
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter((t) => (t.title || "").toLowerCase().includes(q));
    return arr;
  }, [tasks, statusFilter, projectFilter, query]);

  const sorted = useMemo(() => {
    const val = (t: TaskRow): string | number => {
      switch (sortKey) {
        case "title":
          return (t.title || "").toLowerCase();
        case "project":
          return (t.projects?.name || "").toLowerCase();
        case "client":
          return (t.clientName || "").toLowerCase();
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

  // Guard the inline edit modal against a concurrently-deleted task.
  const editingTask = editingId ? tasks.find((t) => t.id === editingId) ?? null : null;
  useEffect(() => {
    if (editingId && !tasks.some((t) => t.id === editingId)) setEditingId(null);
  }, [tasks, editingId]);

  const Th = ({ k, label }: { k: ColKey; label: string }) => (
    <th className="cursor-pointer select-none px-3 py-2 text-right font-semibold text-slate-600 hover:text-slate-900" onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  const tabBtn = (key: "open" | "completed" | "all", label: string) => (
    <button
      onClick={() => setStatusFilter(key)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        statusFilter === key ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {delState.error && (
        <p className="border-b border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
          מחיקת המשימה נכשלה: {delState.error}
        </p>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-1">
          {tabBtn("open", "פתוחות")}
          {tabBtn("completed", "הושלמו")}
          {tabBtn("all", "הכל")}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי כותרת…"
            className="w-44 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            dir="rtl"
          >
            <option value="">כל האתרים</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <button onClick={() => setShowCols((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead className="border-b border-slate-100 bg-slate-50/60 text-xs">
            <tr>
              {cols.map((c) => (
                <Th key={c.key} k={c.key} label={c.label} />
              ))}
              <th className="px-3 py-2 text-left font-semibold text-slate-600">פעולות</th>
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
              <tr key={t.id} className="border-b border-slate-50 align-middle hover:bg-slate-50/50">
                {visible.title && (
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <button
                      onClick={() => setDetailsFor(t)}
                      title="צפייה בפרטי המשימה"
                      className="text-right hover:text-primary hover:underline"
                    >
                      {t.title || <span className="italic text-slate-400">ללא שם</span>}
                    </button>
                  </td>
                )}
                {visible.project && <td className="px-3 py-2 text-slate-600">{t.projects?.name || "—"}</td>}
                {visible.client && <td className="px-3 py-2 text-slate-600">{t.clientName || "—"}</td>}
                {visible.status && (
                  <td className="px-3 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                )}
                {visible.created && <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatDate(t.created_at)}</td>}
                {visible.exec && (
                  <td className="px-3 py-2 text-slate-700">
                    <LiveTime logs={t.time_logs} />
                  </td>
                )}
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    {t.status !== "completed" && <TimerControl ticket={t} logs={t.time_logs} showComplete={false} />}
                    <button
                      onClick={() => openThread(t)}
                      title={isUnread(t) ? "הודעה חדשה מהלקוח" : "שיחה"}
                      className={`relative rounded p-1 hover:bg-slate-100 ${isUnread(t) ? "text-primary" : "text-slate-500 hover:text-slate-800"}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      {isUnread(t) && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
                      )}
                    </button>
                    <button onClick={() => setEditingId(t.id)} title="עריכה" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <form
                      action={delAction}
                      onSubmit={(e) => {
                        if (!confirm(`למחוק את המשימה "${t.title || "ללא שם"}"? הזמן שתועד יימחק לצמיתות.`)) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="project_id" value={t.project_id ?? ""} />
                      <button type="submit" title="מחק" className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
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

      {threadFor && (
        <TaskThread ticketId={threadFor.id} title={threadFor.title ?? ""} onClose={() => setThreadFor(null)} />
      )}
      {detailsFor && (
        <TaskDetails
          ticketId={detailsFor.id}
          title={detailsFor.title ?? ""}
          description={detailsFor.description}
          link={detailsFor.link}
          status={detailsFor.status}
          seconds={sumLoggedSeconds(detailsFor.time_logs)}
          onClose={() => setDetailsFor(null)}
        />
      )}
      {editingTask && (
        <Modal title={`עריכת משימה — ${editingTask.title || "ללא שם"}`} onClose={() => setEditingId(null)}>
          <EditForm
            task={editingTask}
            projects={projects}
            action={editAction}
            error={editState.error}
            onCancel={() => setEditingId(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function EditForm({
  task,
  projects,
  action,
  error,
  onCancel,
}: {
  task: TaskRow;
  projects: { id: string; name: string }[];
  action: (formData: FormData) => void;
  error?: string;
  onCancel: () => void;
}) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={task.id} />
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700">שם המשימה</label>
        <input name="title" defaultValue={task.title ?? ""} placeholder="שם המשימה" className={inputCls} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700">אתר / פרויקט</label>
        <select name="project_id" defaultValue={task.project_id ?? ""} className={inputCls}>
          <option value="">ללא פרויקט</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700">תיאור</label>
        <textarea name="description" defaultValue={task.description ?? ""} rows={3} placeholder="תיאור (אופציונלי)" className={inputCls} />
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit">שמור</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
