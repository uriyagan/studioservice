export const EMAIL_LOG_PAGE = 50;

export interface EmailLogRow {
  id: string;
  to_email: string;
  subject: string | null;
  template: string | null;
  status: string;
  created_at: string;
}
