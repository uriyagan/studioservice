-- Link log rows to the task they were sent about, so the email log can show
-- the task name. Nullable: plenty of emails (welcome, password reset, package
-- notices, manual sends, Resend backfill) aren't about any task.

alter table public.email_log
  add column if not exists ticket_id uuid references public.tickets(id) on delete set null;

create index if not exists email_log_ticket_idx on public.email_log(ticket_id);
