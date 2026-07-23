"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ClientStatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { showToast } from "@/components/ui/Toast";
import { TicketForm } from "@/components/portal/TicketForm";
import { ClientTaskThread } from "@/components/portal/ClientTaskThread";
import { MessageSquare, PlusCircle } from "@/components/icons";
import { formatDate, formatDurationShort, formatRelativeDay } from "@/lib/format";
import { ProjectStats } from "@/lib/types";
import { PortalTask } from "@/components/portal/types";
import { markMyTicketRead } from "@/app/actions/messages";

type Tab = "open" | "completed" | "all";

export function TasksView({
  projects,
  tasks,
}: {
  projects: ProjectStats[];
  tasks: PortalTask[];
}) {
  const [showNew, setShowNew] = useState(false);
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id ?? "");
  const [openTask, setOpenTask] = useState<PortalTask | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  // Threads opened this session — clears the red dot immediately, without
  // waiting for a server refresh to pick up the new read_at.
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const multiProject = projects.length > 1;

  const isUnread = (t: PortalTask) => t.unread && !readIds.has(t.id);

  const openThread = (t: PortalTask) => {
    setOpenTask(t);
    setReadIds((prev) => new Set(prev).add(t.id));
    void markMyTicketRead(t.id);
  };

  const filtered = useMemo(() => {
    if (tab === "open") return tasks.filter((t) => t.status !== "completed");
    if (tab === "completed") return tasks.filter((t) => t.status === "completed");
    return tasks;
  }, [tasks, tab]);

  // An unread studio message on a completed task shouldn't be missed while
  // the default "פתוחות" tab is showing.
  const completedUnread = tasks.some((t) => t.status === "completed" && isUnread(t));

  const tabBtn = (key: Tab, label: string, dot = false) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`relative rounded-md px-3 py-1.5 text-sm font-medium ${
        tab === key ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
      {dot && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
      )}
    </button>
  );

  // Mail-client-style unread: bold title + red dot; read rows stay regular.
  const TitleCell = ({ t }: { t: PortalTask }) => (
    <span className={`inline-flex items-center gap-2 break-words text-slate-900 ${isUnread(t) ? "font-bold" : "font-medium"}`}>
      {t.title}
      {isUnread(t) && (
        <span title="הודעה חדשה מהסטודיו" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
      )}
    </span>
  );

  // Passive conversation indicator — the row itself is the (only) way in.
  const ConversationInfo = ({ t }: { t: PortalTask }) => {
    if (t.msgCount === 0) return <span className="text-slate-400">אין הודעות</span>;
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        <MessageSquare className="h-4 w-4 shrink-0" />
        {t.msgCount}
        {isUnread(t) && <span className="font-medium text-red-600">· חדשה</span>}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">משימות</h1>
        <Button onClick={() => setShowNew(true)} disabled={!projects.length} className="flex items-center gap-1.5">
          <PlusCircle className="h-4 w-4 text-white" /> משימה חדשה
        </Button>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-1 self-start rounded-lg bg-slate-50 p-1 sm:inline-flex">
          {tabBtn("open", "פתוחות")}
          {tabBtn("completed", "הושלמו", completedUnread)}
          {tabBtn("all", "הכל")}
        </div>

        {filtered.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">
            {tasks.length === 0 ? "עדיין אין משימות." : "אין משימות בתצוגה זו."}
          </p>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="space-y-2 sm:hidden">
              {filtered.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openThread(t)}
                  className="flex w-full flex-col gap-1.5 rounded-lg border border-slate-200 p-3 text-start hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <TitleCell t={t} />
                    <span className="shrink-0">
                      <ClientStatusBadge status={t.clientStatus} />
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {multiProject && t.projectName && <>{t.projectName} · </>}
                    הוגשה {formatDate(t.created_at)}
                    {t.lastActivityAt && <> · עדכון אחרון {formatRelativeDay(t.lastActivityAt)}</>}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="tabular-nums">{formatDurationShort(t.seconds)}</span>
                    <span className="text-slate-300">·</span>
                    <ConversationInfo t={t} />
                  </span>
                </button>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
              <table className="w-full min-w-[640px] text-start text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium">כותרת משימה</th>
                    {multiProject && <th className="px-4 py-2.5 text-start font-medium">פרויקט</th>}
                    <th className="px-4 py-2.5 text-start font-medium">סטטוס</th>
                    <th className="px-4 py-2.5 text-start font-medium">תאריך הגשה</th>
                    <th className="px-4 py-2.5 text-start font-medium">עדכון אחרון</th>
                    <th className="px-4 py-2.5 text-start font-medium">זמן ביצוע</th>
                    <th className="px-4 py-2.5 text-start font-medium">שיחה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((t) => (
                    <tr key={t.id} onClick={() => openThread(t)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <TitleCell t={t} />
                      </td>
                      {multiProject && <td className="px-4 py-3 text-slate-600">{t.projectName}</td>}
                      <td className="px-4 py-3">
                        <ClientStatusBadge status={t.clientStatus} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(t.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {t.lastActivityAt ? formatRelativeDay(t.lastActivityAt) : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {formatDurationShort(t.seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <ConversationInfo t={t} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {showNew && (
        <Modal title="משימה חדשה" onClose={() => setShowNew(false)} closeOnBackdrop={false}>
          {multiProject && (
            <div className="mb-3">
              <label className="mb-1 block text-sm text-slate-600">פרויקט</label>
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary"
                dir="rtl"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <TicketForm
            projectId={newProjectId}
            onDone={() => {
              setShowNew(false);
              showToast("המשימה נוצרה בהצלחה");
            }}
          />
        </Modal>
      )}

      {openTask && (
        <ClientTaskThread task={openTask} multiProject={multiProject} onClose={() => setOpenTask(null)} />
      )}
    </div>
  );
}
