"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { TicketForm } from "@/components/portal/TicketForm";
import { ClientTaskThread } from "@/components/portal/ClientTaskThread";
import { MessageSquare, PlusCircle } from "@/components/icons";
import { formatDurationShort } from "@/lib/format";
import { ProjectStats } from "@/lib/types";
import { PortalTask } from "@/components/portal/types";

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
  const multiProject = projects.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">משימות</h1>
        <Button onClick={() => setShowNew(true)} disabled={!projects.length} className="flex items-center gap-1.5">
          <PlusCircle className="h-4 w-4 text-white" /> משימה חדשה
        </Button>
      </div>

      <Card>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-400">עדיין אין משימות.</p>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="space-y-2 sm:hidden">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenTask(t)}
                  className="flex w-full flex-col gap-2 rounded-lg border border-slate-200 p-3 text-start hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium text-slate-800">{t.title}</span>
                    <span className="shrink-0">
                      <StatusBadge status={t.status} />
                    </span>
                  </div>
                  {multiProject && <span className="text-xs text-slate-500">{t.projectName}</span>}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-mono tabular-nums text-slate-600">{formatDurationShort(t.seconds)}</span>
                    <span className="inline-flex items-center gap-1.5 text-primary">
                      <MessageSquare className="h-4 w-4" /> צפייה בשיחה
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {/* Desktop: table */}
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
              <table className="w-full min-w-[520px] text-start text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-medium">כותרת משימה</th>
                    {multiProject && <th className="px-4 py-2.5 text-start font-medium">פרויקט</th>}
                    <th className="px-4 py-2.5 text-start font-medium">סטטוס</th>
                    <th className="px-4 py-2.5 text-start font-medium">זמן ביצוע</th>
                    <th className="px-4 py-2.5 text-start font-medium">שיחה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((t) => (
                    <tr key={t.id} onClick={() => setOpenTask(t)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{t.title}</td>
                      {multiProject && <td className="px-4 py-3 text-slate-600">{t.projectName}</td>}
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                        {formatDurationShort(t.seconds)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-primary hover:underline">
                          <MessageSquare className="h-4 w-4" /> צפייה בשיחה
                        </span>
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
        <Modal title="משימה חדשה" onClose={() => setShowNew(false)}>
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
          <TicketForm projectId={newProjectId} />
        </Modal>
      )}

      {openTask && (
        <ClientTaskThread
          ticketId={openTask.id}
          title={openTask.title}
          description={openTask.description}
          link={openTask.link}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  );
}
