-- Reply-To address for outgoing emails (the real, monitored inbox).
alter table public.email_settings add column if not exists reply_to text;
