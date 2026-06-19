# Studio Service App — Handoff Document

> Full context to resume work in a fresh conversation. Last updated: 2026-06-19.

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
- **Stripe** embedded PaymentElement (invoice + PaymentIntent) for package purchases.
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
`is_retainer`, `total_hours_allocated`), `tickets` (a task; `status`, `assignee_id`, `project_id`),
`time_logs`, `attachments`, `messages` (`direction` `in`|`out`), `message_attachments`,
`hour_packages`, `purchases`, `email_templates`, `email_settings`, `project_members`.

Key view **`project_stats`** = projects + computed `hours_used` (sum of time on **completed**
tickets) + `hours_remaining`. Single source of truth for usage. It's a plain view (owner rights),
so the portal also **filters by `client_id`/membership in the query** for scoping.

**RLS:** clients read own rows; admins read all via `is_admin()` (security definer). Membership via
`is_project_member(pid)` / `is_ticket_member(tid)` (security definer) lets members read/insert on
projects/tickets/time_logs/attachments/messages.

Migrations in `supabase/migrations/`. **Confirmed applied** (verified via SQL): `project_members`
+ `is_project_member` + `is_ticket_member`, `tickets.assignee_id`, `email_settings.reply_to`.

---

## 5. Major features

- **Admin dashboard** (`/admin`): tasks table with status tabs (open/completed/all), site/project +
  assignee filters, title search, column toggle, pagination, edit-in-modal, complete-in-modal,
  assignee column, stat cards; manual time entry; quick-start timer.
- **Projects** (`/admin/projects`): create; single-row cards (name · usage bar · edit/delete);
  detail page with tasks + **"משתתפים בפרויקט"** (project members manager).
- **Clients** (`/admin/clients`): create (optionally with first project); list (each row →
  "פרטי לקוח" button, bold name); detail page (details, assigned projects, **delete client**).
- **Project members (many-to-many):** add several clients to one project; each sees it in their
  portal, can open tasks and view the thread. Owner (`client_id`) stays the billing contact.
- **Client portal** (`/portal`): project status, hours (purchased/used/remaining), completed tasks
  + conversation thread, create task (files + links, instant upload), buy packages (Stripe),
  purchase history, profile. No-project clients see the packages screen.
- **Email system** — every system email is a **designable template** (`/admin/emails`, block
  builder). 9 templates: welcome, password_reset, task_completed, package_half, package_depleted,
  hours_added, new_task_admin, ticket_reply, client_reply_admin. Merge tags (`{first_name}`,
  `{hours_remaining}`, `{task_time}`, …). "Copy from another template" supported. No auto-logo.
  `lib/email/dispatch.ts` renders + substitutes + sends, falling back to `DEFAULT_BLOCKS`.
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
- **Mobile:** two-column input rows use `grid grid-cols-2` (NOT `flex` — flex won't shrink inputs
  and overflows). Layout wrappers have `overflow-x-hidden`. Tasks table keeps `min-w-[640px]` in its
  own scroll container; toolbar/filters stack full-width on mobile. Background `#f5f5f5`.
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
  admin/page.tsx                 dashboard (tasks table + stats)
  admin/projects/[id]/page.tsx   project detail + members manager
  admin/clients/[id]/page.tsx    client detail + delete
  portal/page.tsx                client portal (owned + member projects)
  actions/clients.ts             client CRUD, project members, assign, delete, send email
  actions/admin.ts               tickets/projects, manual time, completion
  actions/messages.ts            thread: send reply, attachments, signed URLs
  actions/stripe.ts              invoice/payment intent
  api/email/inbound/route.ts     Resend inbound webhook
  api/stripe/webhook/route.ts    Stripe webhook (idempotent)
  globals.css                    125% root font, --background #f5f5f5
components/
  NavBar.tsx                     responsive nav (hamburger right / logo left)
  icons.tsx                      custom black icon set
  admin/TasksTable.tsx           main tasks table
  admin/ProjectRow.tsx           single-row project card
  admin/ProjectMembers.tsx       add/remove project members
  admin/DeleteClientButton.tsx   delete client
  portal/PortalClient.tsx        portal tabs/status/purchase/details
  email-builder/                 email template designer
lib/
  email/{dispatch,render,notifications,thread,types}.ts
  format.ts                      formatHours (human), formatDurationShort, etc.
  supabase/{server,admin,middleware}.ts
  after.ts                       runAfter()
supabase/migrations/*.sql        DDL (run manually in Supabase)
```

---

## 8. Current state / open items

- All migrations applied; project-sharing (members) fully live. **No known open bugs.**
- Last work this session: human duration format everywhere; remove client comms card; RTL back
  arrows; "פרטי לקוח" buttons + bold names; cleaner active-packages; `#f5f5f5` background; black
  icons; delete client; project members (many-to-many); full mobile pass (nav hamburger right,
  responsive toolbar/buttons, fixed form overflow via grid).

### Possible next steps (not requested yet)
- Green ✓ badge on the user's *saved* `task_completed` template (default already has it).
- By-client filter on the tasks table (currently by-site/assignee).
- Continue mobile polish on any screen flagged by screenshots.

---

## 9. How to start the next conversation

> Continue work on the Studio Service App. Repo: `/Users/uriyaganor/code/studioservice`. Read
> `HANDOFF.md` first. Reply in English, shortest answers, deploy straight to prod (push to main).
> Then: <your task>.
