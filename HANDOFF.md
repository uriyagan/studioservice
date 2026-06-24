# Studio Service App — Handoff Document

> Full context to resume work in a fresh conversation. Last updated: 2026-06-20.

A Hebrew, RTL client portal + time-tracking system for **Uriya Ganor Studio / ULISSES DIGITAL LTD**.
It replaces Toggl: admins track time on client tasks, clients buy hour-packages, see their
projects/tasks, and message back and forth. Live at **https://service.uriyaganor.com**.

---

## 0. Working agreement (read first)

- **Reply in English, shortest possible answers.**
- **Always deploy straight to production** (push to `main` → auto-deploys).
- **Work only from the git repo:** `/Users/uriyaganor/code/studioservice`
  (an older Google Drive copy exists and is **abandoned** — never edit there; the Drive mount
  zeroes files and creates `" 2"` duplicates).
- **The user runs all SQL migrations** in the Supabase SQL Editor — the assistant cannot reach the
  DB. Hand over SQL to paste; never assume a migration ran without a check query.
- Run `npx tsc --noEmit` before every commit (and a full build for big changes).

---

## 1. Tech stack

- **Next.js 15** (App Router), **React 19**, Server Actions, `useActionState` / `useTransition`.
- **Supabase**: Postgres + Auth + Storage + RLS.
- **Cloudflare Workers** via **OpenNext**; deploy through **GitHub Actions on push to `main`**.
- **Resend** for email (send + inbound).
- **Stripe** embedded PaymentElement (invoice + PaymentIntent) for package purchases. **LIVE mode**
  (`pk_live` in `.github/workflows/deploy.yml`; `sk_live` + live `whsec` are Worker secrets).
- **Tailwind CSS**, UI scaled to 125% root font (`app/globals.css`). Language: Hebrew, **RTL**.

---

## 2. Run / build / deploy

```bash
cd /Users/uriyaganor/code/studioservice
npx tsc --noEmit         # typecheck (always before commit)
npm run build            # full Next build (for big changes)
git add -A && git commit && git push origin main   # → GitHub Actions → Cloudflare (prod)
```

Deploy takes ~1–2 min. Stale-chunk errors after deploy self-heal (see §6).

---

## 3. Supabase access layers

- `createClient()` (`lib/supabase/server.ts`) — **server, RLS-enforced** (acts as logged-in user).
- `createAdminClient()` (`lib/supabase/admin.ts`) — **service role, bypasses RLS** (admin actions,
  webhooks, email).
- `createBrowserClient` — browser/middleware.
- Storage: service-role `createSignedUrls` / `createSignedUrl` / `createBucket`. Append `&download=`
  to a signed URL to force download.

---

## 4. Data model & RLS (migrations below are APPLIED in prod)

Core tables: `profiles` (role `admin`|`client`), `projects` (`client_id` = primary owner,
`is_retainer`, **`is_build`**, `total_hours_allocated`), `tickets` (a task; `status`, `assignee_id`,
`project_id`), `time_logs`, `attachments`, `messages` (`direction` `in`|`out`), `message_attachments`,
`hour_packages`, `purchases`, `email_templates`, `email_settings`, `project_members`.
Newer tables: **`message_reads`** (`admin_id`,`ticket_id`,`read_at` — cross-device unread),
**`project_notes`** + **`project_note_files`** (admin-only per-project note cards + files),
**`email_log`** (`to_email`,`subject`,`template`,`status`,`resend_id`,… — outbound email log).

Key view **`project_stats`** = projects + `is_build` + computed `hours_used` (sum of time on
**completed** tickets) + `hours_remaining`. Single source of truth for usage. It's a plain view
(owner rights), so the portal also **filters by `client_id`/membership in the query** for scoping.
NOTE: `project_stats` lists columns explicitly — `CREATE OR REPLACE VIEW` can only **append** new
columns at the end (adding mid-list renames columns → error 42P16).

**RLS:** clients read own rows; admins read all via `is_admin()` (security definer). Membership via
`is_project_member(pid)` / `is_ticket_member(tid)` (security definer) lets members read/insert on
projects/tickets/time_logs/attachments/messages. `message_reads`/`project_notes`/`project_note_files`/
`email_log` are **admin-only** (`is_admin()`); the app inserts via service role.

Migrations in `supabase/migrations/`. **All confirmed applied** (verified via SQL), incl.:
`project_members` + `is_project_member`/`is_ticket_member`, `tickets.assignee_id`,
`email_settings.reply_to`, `message_reads`, `project_build_type` (`projects.is_build` + view),
`project_notes_cards` (`project_notes` + `project_note_files`), `email_log_v2` (+ `resend_id`).
Also: `messages` is in the Supabase **realtime publication** (inbox live updates).

---

## 5. Major features

- **Admin dashboard** (`/admin`): tasks table with status tabs (open/completed/all), site/project +
  assignee filters, title search, column toggle, pagination, edit-in-modal, complete-in-modal,
  assignee column, stat cards; manual time entry; quick-start timer.
- **Projects** (`/admin/projects`): create with a **3-way type selector** — hours-package /
  retainer / **פרוייקט הקמה (build)**. Build = client-linked, no hours budget, no time tracking.
  Single-row cards (name · usage bar / type badge · edit/delete); detail page with tasks +
  **"משתתפים בפרויקט"** (members manager) + **"הערות פנימיות"** (admin-only note cards: text +
  files, add/edit/delete/search — `components/admin/ProjectNotes.tsx`, `actions/project-notes.ts`).
- **Clients** (`/admin/clients`): create (optionally with first project); list (each row →
  "פרטי לקוח" button, bold name); detail page (details, assigned projects, **"שליחת קישור להגדרת
  סיסמה"** resend button, **delete client**).
- **Project members (many-to-many):** add several clients to one project; each sees it in their
  portal, can open tasks and view the thread. Owner (`client_id`) stays the billing contact.
- **Admin inbox** (`components/admin/InboxWidget.tsx`) — floating bubble on every admin page; a
  WhatsApp-Web-style centralized inbox: conversation list (one per ticket with messages, labeled by
  client) + inline thread/composer (reuses `ConversationThreadBody` + `sendTicketReply`). Search,
  "unread only", mark-all-read, **gentle beep** on new client message (`/public/notification.mp3`,
  works from a background tab; 🔔/🔕 toggle), cross-device read state (`message_reads`), and
  Supabase **Realtime** for instant updates (20s poll fallback). Messaging never touches `time_logs`.
- **Client portal** (`/portal`) — **routed NavBar menu** (same component/behavior as admin, incl.
  mobile hamburger), 4 routes: **לוח בקרה** (`/portal` — status of ALL the client's projects),
  **משימות** (`/portal/tasks` — task list + new-task modal w/ project picker), **חבילות שירות**
  (`/portal/packages` — active packages, buy via Stripe, purchase history), **הפרטים שלי**
  (`/portal/profile`). No-project clients see the buy-packages welcome. Shared data via
  `lib/portal-data.ts` (`getMyProjects`).
- **Email system** — every system email is a **designable template** (`/admin/emails`, block
  builder). 9 templates: welcome, password_reset, task_completed, package_half, package_depleted,
  hours_added, new_task_admin, ticket_reply, client_reply_admin. Merge tags (`{first_name}`,
  `{hours_remaining}`, `{task_time}`, …). "Copy from another template" supported. No auto-logo.
  `lib/email/dispatch.ts` renders + substitutes + sends, falling back to `DEFAULT_BLOCKS`.
  Admin→client replies **attach the client's files to the email** (Resend `attachments` by URL).
- **Email log** (`/admin/emails` → "לוג שליחת מיילים"): every outbound email is logged at the single
  `sendEmail` choke point (`email_log`: recipient, template, subject, status, `resend_id`).
  Searchable + paginated. A `/api/resend/webhook` (Svix-verified, secret optional) updates rows to
  delivered/bounced/opened live. ⚠️ The Resend account is **shared across projects** — see §6.
- **Inbound email** (`/api/email/inbound`): Resend `email.received` is **metadata-only** — body
  fetched via `GET https://api.resend.com/emails/receiving/{email_id}`; `cleanInboundReply` strips
  quotes/footers/signatures; logs an `in` message and notifies admins.
- **Billing** (`/admin/billing`): manage hour packages. Stripe webhook (`/api/stripe/webhook`) is
  idempotent (by `stripe_payment_intent`), credits hours, creates a project for first-time buyers,
  emails `hours_added`.
- **Auth:** login with "remember me" (middleware strips cookie maxAge when unchecked).

---

## 6. Conventions & gotchas

- **Icons:** custom SVG set in `components/icons.tsx` (`mk()` factory). They render **solid black
  `#000000` by default**, unless the className carries an intent color (`text-white|emerald|red|
  primary|…`, matched by `KEEP_COLOR`). Icons on dark buttons need `text-white`. Email builder still
  uses lucide. `Loader2` re-exported from lucide.
- **Duration formatting** (`lib/format.ts`): `formatHours(hours)` → human **"9 שעות 57 דקות" /
  "5 דקות" / "10 שעות"** (no decimals); used app-wide + in email merge tags. `formatDurationShort`
  = HH:MM (client task exec time, no seconds). Email default bodies must NOT append "שעות" after
  these tags (value already includes the unit).
- **RTL:** back arrows point **right** (`ArrowRight`). NavBar mobile: **hamburger right, logo left**.
- **Mobile (2026-native; verify visually, not just by reading code — see memory):** root font is
  125% on all sizes (kept — looks better). Key rules: global `input,select,textarea{min-width:0}` +
  `img,svg{max-width:100%}` (`globals.css`); **every responsive grid needs a base `grid-cols-1`** —
  a bare `grid` with cols only at a breakpoint sizes its single implicit track to *max-content* and
  overflows (this caused the clients-form clipping). Data tables render as **stacked cards** under
  `md`/`sm` (tasks table, projects list, portal completed-tasks + purchases) with the desktop table
  in a `hidden md:block`/`sm:block` wrapper. `Card` is `p-4 sm:p-6`. Layout wrappers have
  `overflow-x-hidden`. Background `#f5f5f5`.
- **Set-password / reset links:** do NOT email Supabase's auto-verify `action_link` — email
  scanners pre-open it and consume the one-time token ("link expired" for everyone). Use
  `lib/auth-links.ts` `setPasswordLink()` → links to our own `/set-password?token_hash=…&type=recovery`
  and `verifyOtp` runs only on form **submit** (scanner-safe; also bypasses the redirect allowlist).
- **Shared Resend account:** the Resend key is shared across the user's other projects (ClickPo
  `clickpo.io`, Johnny `askjohnny.io`). Anything pulling from Resend (`GET /emails`) returns the
  whole account — **scope by the app's sending domain `service.uriyaganor.com`** or you leak other
  projects' emails. Live logging + the webhook are already scoped (own sends / existing rows only).
- **Stale chunks after deploy:** `app/error.tsx` + `app/global-error.tsx` auto-reload once on any
  error; `components/VersionWatcher.tsx` + `/api/version` + `NEXT_PUBLIC_BUILD_ID` (= `github.sha`)
  show a "new version" banner.
- **Fire-and-forget:** `lib/after.ts` `runAfter()` → `waitUntil` with inline-await fallback (email
  dispatch, so actions don't block).
- **Resilience:** code touching newer columns/tables retries-without / fails-closed so the app keeps
  working before a migration is applied.

---

## 7. Key files map

```
app/
  admin/layout.tsx               NavBar + <InboxWidget/>
  admin/page.tsx                 dashboard (tasks table + stats; cards on mobile)
  admin/projects/[id]/page.tsx   project detail + members + הערות פנימיות
  admin/clients/[id]/page.tsx    client detail + resend-password + delete
  admin/emails/page.tsx          templates + brand + email log (EmailLogView)
  portal/layout.tsx              portal NavBar (routed menu)
  portal/page.tsx                לוח בקרה (all projects)  + tasks/ packages/ profile/ subroutes
  actions/clients.ts             client CRUD, members, delete, send/resend email
  actions/admin.ts               tickets/projects (3 types), manual time, completion
  actions/messages.ts            threads, getConversations, read-state, sendTicketReply
  actions/project-notes.ts       admin project note cards + files
  actions/email-log.ts           getEmailLog (search/paginate) + backfillEmailLog (domain-scoped)
  actions/stripe.ts              invoice/payment intent
  api/email/inbound/route.ts     Resend inbound webhook
  api/resend/webhook/route.ts    Resend delivery-status webhook (Svix)
  api/stripe/webhook/route.ts    Stripe webhook (idempotent)
  set-password/page.tsx          token_hash + verify-on-submit
  globals.css                    125% root font, min-width:0 on form controls, #f5f5f5
components/
  NavBar.tsx                     responsive nav (rootHref prop; admin + portal)
  icons.tsx                      custom black icon set
  admin/TasksTable.tsx           tasks table (desktop) + mobile cards; פרויקט col links to project
  admin/ProjectRow.tsx           project card (type badge / usage bar)
  admin/ProjectMembers.tsx       add/remove project members
  admin/ProjectNotes.tsx         admin-only note cards (text + files)
  admin/InboxWidget.tsx          floating centralized inbox + beep + read state
  admin/EmailLogView.tsx         email log (search/paginate/status pills)
  admin/DeleteClientButton.tsx / ResendWelcomeButton.tsx
  portal/{DashboardView,TasksView,PurchaseView,BuyWelcome,types}.tsx  routed portal views
  portal/ConversationThread.tsx  ConversationThreadBody (modal-free) + Modal wrapper
  email-builder/                 email template designer
lib/
  email/{dispatch,render,send,notifications,thread,types}.ts   (send.ts logs every email)
  auth-links.ts                  setPasswordLink() (scanner-safe recovery link)
  portal-data.ts                 getMyProjects()
  email-log-shared.ts            EMAIL_LOG_PAGE + EmailLogRow type
  format.ts / supabase/{server,admin,middleware}.ts / after.ts
supabase/migrations/*.sql        DDL (run manually in Supabase)
```

---

## 8. Current state / open items

- All migrations applied; everything below is **live in prod**. **No known open bugs.**
- This session (2026-06-20): full mobile-native pass (grid-cols-1 fix, stacked cards, min-width:0);
  **Stripe switched to LIVE**; client portal rebuilt as a routed NavBar menu w/ multi-project
  dashboard; **admin centralized inbox** (beep, cross-device reads, realtime); **3rd project type
  "build"**; **admin project notes** (cards + files); **set-password link fix** (token_hash) +
  per-client resend; **full outbound email log** (logging + Resend backfill + delivery webhook),
  scoped to this app's domain; admin→client email **file attachments**; browser title →
  "אפליקציית שירות - סטודיו אוריה גנור"; assorted polish.

### Possible next steps (not requested yet)
- Inbox: per-client grouping (collapse a client's tasks under one header) — discussed, deferred.
- By-client filter on the tasks table (currently by-site/assignee).
- Desktop/OS push notifications for new messages when the app isn't open (PWA / Notification API).

---

## 9. How to start the next conversation

> Continue work on the Studio Service App. Repo: `/Users/uriyaganor/code/studioservice`. Read
> `HANDOFF.md` first. Reply in English, shortest answers, deploy straight to prod (push to main).
> Then: <your task>.
