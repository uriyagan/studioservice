-- ============================================================
--  Migration: files + links on conversation messages
--  Run in the Supabase SQL Editor (Database → SQL Editor → paste → Run).
-- ============================================================

-- Attach an uploaded file to a specific message (still carries ticket_id
-- so the existing attachments RLS policies keep working unchanged).
alter table public.attachments
  add column if not exists message_id uuid references public.messages(id) on delete cascade;
create index if not exists attachments_message_id_idx on public.attachments(message_id);

-- Relevant links sent with a message (newline-separated).
alter table public.messages
  add column if not exists links text;
