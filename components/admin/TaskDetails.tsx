"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, FileText, Download } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { getTaskAttachments } from "@/app/actions/messages";
import { completeTask } from "@/app/actions/timer";
import { formatDuration } from "@/lib/format";

// Read view of what a client submitted + the (irreversible) "complete task"
// action, gated behind a confirmation that shows the total logged time.
export function TaskDetails({
  ticketId,
  title,
  description,
  link,
  status,
  seconds,
  onClose,
}: {
  ticketId: string;
  title: string;
  description: string | null;
  link: string | null;
  status: string;
  seconds: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<{ name: string; url: string }[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [completing, startComplete] = useTransition();
  const links = (link ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  useEffect(() => {
    getTaskAttachments(ticketId).then(setFiles);
  }, [ticketId]);

  const downloadAll = () => {
    (files ?? []).forEach((f, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400);
    });
  };

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h4>
      {children}
    </div>
  );

  return (
    <Modal title={title || "פרטי משימה"} onClose={onClose}>
      <div className="space-y-5">
        <Section label="תיאור">
          {description ? (
            <p className="whitespace-pre-wrap text-sm text-slate-800">{description}</p>
          ) : (
            <p className="text-sm text-slate-400">אין תיאור.</p>
          )}
        </Section>

        <Section label="לינקים">
          {links.length ? (
            <div className="space-y-1.5">
              {links.map((l, i) => (
                <a
                  key={i}
                  href={l}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="ltr"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Link2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{l}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">אין לינקים.</p>
          )}
        </Section>

        <Section label="קבצים מצורפים">
          {files === null ? (
            <p className="text-sm text-slate-400">טוען…</p>
          ) : files.length ? (
            <div className="space-y-1.5">
              {files.length > 1 && (
                <button
                  onClick={downloadAll}
                  className="mb-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  <Download className="h-4 w-4 text-white" /> הורדת כל הקבצים ({files.length})
                </button>
              )}
              {files.map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  download={f.name}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-black" />
                  <span className="truncate">{f.name}</span>
                  <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-xs text-primary">
                    <Download className="h-3.5 w-3.5" /> הורדה
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">אין קבצים.</p>
          )}
        </Section>

        {/* Complete the task (irreversible) — with confirmation + total time. */}
        {status === "completed" ? (
          <p className="border-t border-slate-100 pt-4 text-sm font-medium text-emerald-600">
            המשימה הושלמה ✓ · זמן כולל {formatDuration(seconds)}
          </p>
        ) : (
          <div className="border-t border-slate-100 pt-4">
            {!confirming ? (
              <Button variant="success" onClick={() => setConfirming(true)}>
                ✓ סיום המשימה ועדכון הלקוח
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg bg-emerald-50 p-3">
                <p className="text-sm text-slate-800">
                  לסיים את המשימה ולעדכן את הלקוח במייל? זמן המשימה הכולל:{" "}
                  <b className="font-mono tabular-nums">{formatDuration(seconds)}</b>
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    disabled={completing}
                    onClick={() =>
                      startComplete(async () => {
                        await completeTask(ticketId);
                        router.refresh();
                        onClose();
                      })
                    }
                  >
                    {completing ? "מסיים…" : "סיים ועדכן לקוח"}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirming(false)}>
                    ביטול
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
