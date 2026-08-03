export const EMAIL_LOG_PAGE = 50;

export interface EmailLogRow {
  id: string;
  to_email: string;
  subject: string | null;
  template: string | null;
  status: string;
  created_at: string;
  // The task this email was sent about, when it was sent from a task context.
  ticket_id: string | null;
  task_title: string | null;
}
