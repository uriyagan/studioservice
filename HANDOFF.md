# Studio Service App — Handoff Document

> Full context to resume work in a fresh conversation. Last updated: 2026-06-04.

---

## 1. What this is

A private web **Client Portal + Time-Tracking system** for the studio — replaces Toggl.
- **Admins** create projects/tasks and run a live per-task timer (Start → Pause/Resume → Complete).
- **Clients** log in, see their package (hourly or retainer), remaining hours, completed tasks,
  submit support tickets (with file uploads), and buy more hours via Stripe.
- Fully **Hebrew RTL**, modern SaaS look, black buttons, custom studio logo.

**Status: LIVE in production.** 🟢

---

## 2. Key links & identifiers

| Thing | Value |
|---|---|
| **Live site** | https://service.uriyaganor.com |
| **GitHub repo** | https://github.com/uriyagan/studioservice (branch `main`) |
| **Working dir** | `~/code/studioservice` (clone of the GitHub repo, **off Google Drive**). The old Drive folder is abandoned — it silently zeroed files and made `" 2"` duplicates. Work + commit + deploy from `~/code/studioservice` only. |
| **Host** | Cloudflare Workers, worker name `studioservice` |
| **Cloudflare account** | `info@uriyaganor.com` — account ID `8b904080ccb2858612d4edba364d85b2` (wrangler already authenticated on this Mac) |
| **Supabase project** | ref `eepbcsidaitixxrjzgiw` → https://eepbcsidaitixxrjzgiw.supabase.co |
| **Admin login** | `office@uriyaganor.com` (role=admin; password in owner's password manager) |

---

## 3. Tech stack

- **Next.js 15.5.19** (App Router) + **React 19.2.7** + TypeScript
- **Supabase** — Postgres + Auth + Storage (uses the NEW key format: `sb_publishable_…` as the anon/public key, `sb_secret_…` as the service-role key)
- **Tailwind CSS 3.4** — RTL via logical props (`ms-`/`me-`/`ps-`/`pe-`); primary color = black (`#111111`)
- **Stripe** — Checkout + webhook, **configured in TEST mode** (secrets `STRIPE_SECRET_KEY` `sk_test_…` + `STRIPE_WEBHOOK_SECRET` on the Worker). Charges in **EUR**. Webhook endpoint: `/api/stripe/webhook` (event `checkout.session.completed`).
- **Resend** — transactional email (`RESEND_API_KEY` Worker secret; from `info@uriyaganor.com`, domain verified on Cloudflare DNS).
- **Hosting:** Cloudflare Workers via **OpenNext** adapter `@opennextjs/cloudflare` 1.19.11 + wrangler 4.97
  - Chosen over Vercel because the domain `uriyaganor.com` is already on Cloudflare and the owner already uses Workers.

---

## 4. Commands

**Deploy = `git push origin main`.** A GitHub Actions workflow
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) builds with OpenNext and deploys to
Cloudflare on every push to `main`. No local build needed — git is the single source of truth.
Manual trigger: GitHub → Actions → "Deploy to Cloudflare" → Run workflow.

One-time setup: the GitHub repo must have a secret `CLOUDFLARE_API_TOKEN` (Cloudflare → My Profile →
API Tokens → "Edit Cloudflare Workers" template). All `NEXT_PUBLIC_*` build vars are set inside the
workflow (they're public — they ship in the browser bundle). Runtime Worker secrets
(`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_*`) already live on the Worker via `wrangler secret put` and
survive deploys.

```bash
# Local dev (Node, http://localhost:3000)
npm run dev

# Typecheck
npx tsc --noEmit

# DEPLOY → just push; CI builds & deploys
git push origin main

# Manual local deploy (fallback only — slow on Google Drive, avoid):
# NEXT_PUBLIC_SITE_URL=https://service.uriyaganor.com npm run cf:deploy
```

---

## 5. Environment variables / secrets

**Local** — `.env.local` (gitignored, already filled):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (= publishable key), `SUPABASE_SERVICE_ROLE_KEY` (= secret key)
- `NEXT_PUBLIC_SITE_URL` (localhost locally), Stripe keys (placeholders)

**Local CF preview** — `.dev.vars` (gitignored): server-only secrets for `wrangler dev`.

**Production (Cloudflare Worker secrets)** — set via `wrangler secret put <NAME>`:
- `SUPABASE_SERVICE_ROLE_KEY` ✅ real value set
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ⚠️ placeholders — replace when configuring Stripe
- `NEXT_PUBLIC_*` are build-time inlined (not Worker secrets)

List current worker secrets: `npx wrangler secret list`

---

## 6. Database (Supabase) — already applied

Schema lives in [`supabase/schema.sql`](supabase/schema.sql) and has **already been run** on the project.
Tables: `profiles`, `projects`, `tickets`, `time_logs`, `attachments` + view `project_stats` + Storage bucket `attachments`.

**Core domain rules:**
- **1 client = 1 project** (1:1). Login redirects a client straight to their project page.
- `projects.is_retainer = true` → unlimited hours, never deducted.
- `project_stats` view computes `hours_used` = sum of `time_logs.duration_seconds` for COMPLETED
  tickets only → single source of truth, no drift. `hours_remaining` = allocated − used.
- **RLS everywhere:** clients see only their own project/tickets/logs; all writes to projects and the
  timer are admin-only. Helper `is_admin()` (SECURITY DEFINER). Trigger `on_auth_user_created` auto-creates
  a `profiles` row from auth metadata (`name`, `role`).
- New auth users get `role='client'` by default. Admin was promoted manually:
  `update public.profiles set role='admin' where email='office@uriyaganor.com';`

---

## 7. How the timer works (the core feature)

- Per **task (ticket)**, not per project. Time rolls up to the project via the task.
- Server Actions in [`app/actions/timer.ts`](app/actions/timer.ts): `startTimer` (used for both "התחל טיפול"
  and "המשך טיימר"), `pauseTimer`, `completeTask`. Each Start opens a `time_logs` row (`end_time` NULL);
  Pause/Complete closes it and stores `duration_seconds`.
- **Refresh-safe:** the live elapsed time is computed from the active `time_logs` row's `start_time`
  ([`components/TimerControl.tsx`](components/TimerControl.tsx) + `sumLoggedSeconds` in
  [`lib/format.ts`](lib/format.ts)), so reloading the page recomputes the exact value and keeps ticking.
- Complete button label is **"הטיפול הסתיים"**. On complete, hours are deducted automatically (via the view)
  unless the project is a retainer.
- DB guarantees one active segment per ticket (unique partial index).

---

## 8. App structure

```
app/
  page.tsx              root → redirect by role
  login/page.tsx        email+password login (client component, studio logo, NO title)
  admin/                role=admin guarded layout (NavBar)
    page.tsx            dashboard: all tickets + live TimerControl + "+ משימה חדשה" (create task w/ project picker)
    projects/page.tsx   create project (client picker, retainer toggle, hours), edit hours inline, stats
    users/page.tsx      create client login (email+password)
  portal/               client area (logout-only header)
    page.tsx            fetches the client's single project + tickets
  actions/              server actions: timer, admin, tickets, stripe, auth
  api/stripe/webhook    Stripe checkout.session.completed → increment total_hours_allocated (uses service role)
  api/upload-url        issues signed Storage upload URL (direct browser→bucket)
components/
  TimerControl.tsx      live refresh-safe timer + 4 buttons
  NavBar.tsx            admin nav (active link highlight)
  ui/                   Card, StatCard, Button (black), StatusBadge
  admin/                CreateUserForm, CreateProjectForm, EditHoursForm, CreateTaskForm (all useActionState)
  portal/               PortalClient (3 tabs), TicketForm (file uploads)
lib/
  supabase/             client.ts (browser), server.ts (async createClient — Next 15 await cookies()),
                        admin.ts (service role), middleware.ts (session refresh + role routing)
  stripe.ts  packages.ts  format.ts  types.ts
supabase/schema.sql     full DB schema + RLS (already applied)
wrangler.jsonc          Worker config + custom_domain route service.uriyaganor.com
open-next.config.ts     OpenNext adapter config
```

Client portal has **3 tabs**: סטטוס הפרויקט (cards + completed tasks table) · הגשת פנייה (ticket form +
multi-file upload) · רכישת שעות (Stripe packages from `lib/packages.ts`).

---

## 9. What's DONE ✅

Auth + role routing · admin dashboard with live timer (start/pause/resume/complete) · admin creates
tasks and assigns to a project · admin creates client logins · admin creates/edits projects (hourly &
retainer, editable hours) · client portal (status, completed tasks, submit ticket, file uploads, purchase
tab) · RLS · Storage signed uploads · Hebrew RTL · custom logo · black buttons · **deployed live on
Cloudflare Workers at service.uriyaganor.com with SSL.**

---

## 10. PENDING / next steps ⏳

1. **Supabase Auth Site URL** — set to `https://service.uriyaganor.com` in
   Supabase → Authentication → URL Configuration (needed for future password-reset emails; login works without it).
2. **Stripe** — replace placeholder secrets with real keys, set webhook to
   `https://service.uriyaganor.com/api/stripe/webhook` (event `checkout.session.completed`). Then
   `wrangler secret put STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` and redeploy.
3. **Admin: view/download ticket attachments** — uploads are stored but there's no admin UI to view them yet.
4. **Client: list of their OPEN tickets** — portal currently shows only completed tasks + the submit form.
5. **Edit/delete tickets**, optional email notifications, optional GitHub→Cloudflare auto-deploy (Workers Builds).

---

## 11. Gotchas / notes

- `cookies()` is **async** in Next 15 → `lib/supabase/server.ts` `createClient()` is async; every caller
  uses `await createClient()`. Forms use **`useActionState`** (from `react`), not the old `useFormState`.
- Need `nodejs_compat` flag + `compatibility_date` ≥ 2024-09-23 in `wrangler.jsonc` for the Stripe/Supabase
  SDKs on Workers. Verified Supabase auth runs fine on workerd.
- `.open-next/`, `.dev.vars`, `.wrangler/`, `.env*.local` are gitignored. Never commit secrets.
- This project is unrelated to WooDonkey (the WordPress-plugin suite in a sibling folder). Ignore WooDonkey's
  CLAUDE.md cart-fee / build.sh notes here.

---

## 12. Major additions (2026-06-18 session)

Working dir moved off Google Drive → `~/code/studioservice`. Deploy is now `git push` → GitHub Actions → Cloudflare (see §4).

**Admin**
- **Clients tab** (`/admin/clients`) — create client with full details (first/last name, email, phone, company, address, notes); **client card** (`/admin/clients/[id]`): edit details, assign to multiple projects, see remaining hours per project, send an initiated (free-form, brand-wrapped) email.
- **Users tab** — admin/client **role** selection on create + edit (with self-lockout guards).
- **Projects** — full edit + delete; per-project page (`/admin/projects/[id]`); project names link to it.
- **Dashboard** — sortable, column-configurable **tasks table** (title/client/status/date/exec-time + timer + edit/delete). Quick "התחל טיימר מיידי" + manual time entry.
- **Emails tab** (`/admin/emails`) — WYSIWYG **email builder** (drag-drop blocks, inline rich text, design panel, merge tags, send-test) + brand/sender settings. 7 templates; each has a פעיל/כבוי toggle.
- **Billing tab** (`/admin/billing`) — manage hour packages (name/hours/price/active) in-app; prices in **EUR**.

**Client portal**
- Multi-project switcher; "+ משימה חדשה" button; task form with multiple links + modern drag-drop file upload; "הפרטים שלי" self-service; "רכישת שעות" (DB packages) + **purchase history with receipts**.
- Onboarding: clients are created **without** a password → welcome email with a **set-password link** (`/set-password`). Branded "forgot password" on login.

**Email automations (all wired, via `lib/email/`):** welcome, password_reset, task_completed, package_half (50%), package_depleted (incl. completed-tasks table), hours_added (Stripe), new_task_admin. Built/rendered/sent entirely in JS (`render.ts` → `dispatch.ts` → Resend `send.ts`); fired from `lib/email/notifications.ts` + the Stripe webhook + client/auth actions. Threshold emails fire once via `projects.notified_half/notified_depleted` (reset when hours are added).

**Migrations applied** (all run in Supabase; files in `supabase/migrations/`): `tasks_quickstart_delete`, `email_billing`, `name_split`, `client_fields`, `billing_phase2`.

**Key new files:** `app/actions/{clients,packages,email,stripe,auth}.ts` · `lib/email/*` · `components/email-builder/*` · `components/admin/{TasksTable,ClientDetailsForm,ClientProjects,SendClientEmail,PackagesManager,CreateClientForm,...}.tsx` · `app/set-password/page.tsx` · `app/api/stripe/webhook/route.ts`.

**Open / nice-to-have:** design the 7 email templates in the builder (they send with sensible defaults until then); the `hour_packages.price_ils` / `purchases.amount_ils` column names hold EUR values (cosmetic misnomer).
