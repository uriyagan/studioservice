"use client";

import { useEffect, useState } from "react";
import { Link2, FileText, Download } from "@/components/icons";
import { Modal } from "@/components/ui/Modal";
import { getTaskAttachments } from "@/app/actions/messages";

// Read-only view of what a client submitted: description, links, files.
export function TaskDetails({
  ticketId,
  title,
  description,
  link,
  onClose,
}: {
  ticketId: string;
  title: string;
  description: string | null;
  link: string | null;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<{ name: string; url: string }[] | null>(null);
  const links = (link ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  useEffect(() => {
    getTaskAttachments(ticketId).then(setFiles);
  }, [ticketId]);

  // Trigger a download for each file (staggered so the browser doesn't block).
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
                  <Download className="h-4 w-4" /> הורדת כל הקבצים ({files.length})
                </button>
              )}
              {files.map((f, i) => (
                <a
                  key={i}
                  href={f.url}
                  download={f.name}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
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
      </div>
    </Modal>
  );
}
