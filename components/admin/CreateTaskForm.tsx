"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TicketForm } from "@/components/portal/TicketForm";

interface ProjectOption {
  id: string;
  name: string;
}

// Admin "new task" — same rich form as the client portal (title, free
// text, multiple links, file upload) plus a project picker.
export function CreateTaskForm({
  projects = [],
  fixedProjectId,
}: {
  projects?: ProjectOption[];
  fixedProjectId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        + משימה חדשה
      </Button>
      {open && (
        <Modal title="משימה חדשה" onClose={() => setOpen(false)}>
          <TicketForm
            mode="admin"
            projects={projects}
            projectId={fixedProjectId}
            onDone={() => setOpen(false)}
          />
        </Modal>
      )}
    </>
  );
}
