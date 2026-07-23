"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TicketForm } from "@/components/portal/TicketForm";
import { PlusCircle } from "@/components/icons";
import { showToast } from "@/components/ui/Toast";
import type { AdminOption } from "@/lib/types";

interface ProjectOption {
  id: string;
  name: string;
}

// Admin "new task" — same rich form as the client portal (title, free
// text, multiple links, file upload) plus a project picker and an
// optional assignee.
export function CreateTaskForm({
  projects = [],
  admins = [],
  fixedProjectId,
}: {
  projects?: ProjectOption[];
  admins?: AdminOption[];
  fixedProjectId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <PlusCircle className="h-4 w-4 text-white" /> משימה חדשה
      </Button>
      {open && (
        <Modal title="משימה חדשה" onClose={() => setOpen(false)} closeOnBackdrop={false}>
          <TicketForm
            mode="admin"
            projects={projects}
            admins={admins}
            projectId={fixedProjectId}
            onDone={() => {
              setOpen(false);
              showToast("המשימה נוצרה בהצלחה");
            }}
          />
        </Modal>
      )}
    </>
  );
}
