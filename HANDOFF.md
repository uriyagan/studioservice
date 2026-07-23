# Studio Service App — Handoff Document

> Full context to resume work in a fresh conversation. Last updated: 2026-07-23.

A Hebrew, RTL client portal + time-tracking system for **Uriya Ganor Studio / ULISSES DIGITAL LTD**.
It replaces Toggl: admins track time on client tasks, clients buy hour-packages, see their
projects/tasks, and message back and forth. Live at **https://service.uriyaganor.com**.

---

## 0. Working agreement (read first)

> Owned and maintained by **Sam** since 2026-07-15. Everything below reflects that handover —
> earlier instructions in this file that assumed a macOS setup or English replies are gone.

- **Reply in Hebrew**, shortest possible answers. Start a new line before Hebrew text so RTL
  doesn't break.
- **Pushing to `main` deploys to production immediately** (GitHub Actions → Cloudflare, ~1–2 min).
  There is no staging, so a bad push reaches real clients.
  - **Docs, static assets, tooling:** push freely once `tsc` passes — no need to ask.
  - **Code, logic, or anything touching the DB:** ask Sam before pushing.
- **Work only from the git repo** (`github.com/uriyagan/studioservice`), never from a copy. An
  older Google Drive copy exists on the previous maintainer's machine and is **abandoned** — the
  Drive mount zeroes files and creates `" 2"` duplicates, which is why `.gitignore` carries the
  `* 2.*` rules.
- **Sam runs all SQL migrations** in the Supabase SQL Editor. Hand over SQL to paste; never assume
  a migration ran without a check query. (The assistant *can* read the DB — `.env.local` holds a
  working service-role key — but does not run migrations.)
- Run `npx tsc --noEmit` before every commit (and a full build for big changes).
- **The local env points at the production Supabase.** Every local action touches real client data.
  `RESEND_API_KEY` is deliberately left empty so no test mail reaches a real client, and Stripe is
  test-mode locally. Don't undo either without a reason.

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
npx tsc --noEmit         # typecheck (always before commit)
npm run build            # full Next build (for big changes)
git add -A && git commit && git push origin main   # → GitHub Actions → Cloudflare (prod)
```

Deploy takes ~1–2 min. Stale-chunk errors after deploy self-heal (see §6).
Watch a deploy with `gh run list` / `gh run watch`; confirm it landed by polling `/api/version`
until it reports the pushed SHA — but see the propagation caveat in §6 before judging a deploy.

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
`project_id`, **`created_by`** = who opened it), `time_logs`, `attachments`, `messages`
(`direction` `in`|`out`), `message_attachments`, `hour_packages`, `purchases`, `email_templates`,
`email_settings`, `project_members`.
Newer tables: **`message_reads`** (`admin_id`,`ticket_id`,`read_at` — cross-device unread),
**`project_notes`** + **`project_note_files`** (admin-only per-project note cards + files),
**`ticket_notes`** + **`ticket_note_files`** ("הערות מהסטודיו" — per-task note cards + files;
admin writes, **client sees read-only** via `getMyTicketNotes`, never emailed),
**`email_log`** (`to_email`,`subject`,`template`,`status`,`resend_id`,… — outbound email log).

Key view **`project_stats`** = projects + `is_build` + computed `hours_used` (sum of time on
**completed** tickets) + `hours_remaining`. Single source of truth for usage. It's a plain view
(owner rights), so the portal also **filters by `client_id`/membership in the query** for scoping.
NOTE: `project_stats` lists columns explicitly — `CREATE OR REPLACE VIEW` can only **append** new
columns at the end (adding mid-list renames columns → error 42P16).

**RLS:** clients read own rows; admins read all via `is_admin()` (security definer). Membership via
`is_project_member(pid)` / `is_ticket_member(tid)` (security definer) lets members read/insert on
projects/tickets/time_logs/attachments/messages. `message_reads`/`project_notes`/`project_note_files`/
`ticket_notes`/`ticket_note_files`/`email_log` are **admin-only** (`is_admin()`); the app inserts via
service role. Clients see studio task notes through the `getMyTicketNotes` action, which authorizes
the caller against the ticket (RLS) then reads + signs files via service role — no client RLS needed.

Migrations in `supabase/migrations/`. **All confirmed applied** (verified via SQL), incl.:
`project_members` + `is_project_member`/`is_ticket_member`, `tickets.assignee_id`,
`email_settings.reply_to`, `message_reads`, `project_build_type` (`projects.is_build` + view),
`project_notes_cards` (`project_notes` + `project_note_files`), `email_log_v2` (+ `resend_id`),
`2026-06-24_ticket_creator` (`tickets.created_by`), `2026-06-24_ticket_notes` (`ticket_notes` +
`ticket_note_files`). Also: `messages` is in the Supabase **realtime publication** (inbox live updates).

---

## 5. Major features

- **Admin dashboard** (`/admin`): tasks table with status tabs (open/completed/all), site/project +
  assignee filters, title search, column toggle, pagination, edit-in-modal, assignee column, stat
  cards; quick-start timer. **Per-row timer** (`RowTimerControl`): fixed **40px** circular buttons with
  **26px** custom icons — a **play** that turns **green** (and toggles to **pause**) while running, plus
  a **complete** check. The single live clock runs in the **"זמן ביצוע"** column (no duplicate) and its
  digits turn green while running. Completing opens a confirm dialog with an optional **"הערה למייל
  ללקוח"** (`completeTask(id, note)` → `{completion_note}` in the email). The **לקוח** column shows
  **"פתח/ה: <name>"** when a project member (not the primary client) opened the task.
  - **Task details modal** (click the title): read view of what the client submitted + **"זמן עבודה"**
    (logged total + **add manual time** to this existing open task — no new task/project, no email;
    client is notified only on completion) + **"הערות מהסטודיו"** + complete-task action (same
    optional-note confirm dialog).
  - **"הערות מהסטודיו"** (`NotesPanel` + `actions/ticket-notes.ts`): text and/or files added to a task,
    add/edit/delete + search + **download-all**. Shown **read-only to the client** in their portal,
    **never emailed** (for emailed updates use the conversation thread). `NotesPanel` is shared with
    the project-level **"הערות פנימיות"** (`ProjectNotes` is a thin wrapper).
  - Global **"הזנת זמן ידנית"** still creates a *separate completed task* (emails the client) — for work
    with no existing task. Per-task manual time (above) is the silent, open-task variant.
- **Task correspondence → the opener:** `taskRecipient(ticketId)` (`lib/email/thread.ts`) sends admin
  replies + the task-completed email to whoever opened the task (`tickets.created_by`, a member),
  falling back to the project's primary `client_id` for older/admin-created tasks. Reply still threads
  on the same `reply+<ticketId>@…` address.
- **Client reply reopens a completed task:** any inbound client message on a `completed` task flips it
  back to **`pending`** (clears `completed_at`) so it returns to the "פתוחות" tab — it stays open until
  actively re-completed. Shared helper `reopenIfCompleted(ticketId)` (`lib/email/thread.ts`, service
  role — clients can't update tickets; only touches `completed` rows) is called from both inbound paths:
  `sendClientReply` (portal) and `/api/email/inbound` (email). Admin dashboard is server-rendered, so the
  status change shows on next load/refresh (the inbox bubble itself updates live via realtime).
- **Projects** (`/admin/projects`): create with a **3-way type selector** — hours-package /
  retainer / **פרוייקט הקמה (build)**. Build = client-linked, no hours budget, no time tracking.
  Single-row cards (name · usage bar / type badge · edit/delete); detail page with tasks +
  **"משתתפים בפרויקט"** (members manager) + **"הערות פנימיות"** (admin-only note cards: text +
  files, add/edit/delete/search — `components/admin/ProjectNotes.tsx`, `actions/project-notes.ts`).
- **Clients** (`/admin/clients`): create (optionally with first project); list (each row →
  "פרטי לקוח" button, bold name); detail page (details, assigned projects, **"שליחת קישור להגדרת
  סיסמה"** resend button, **delete client**). The details form (admin mode) can **edit the client's
  login email** — updates Supabase Auth (`updateUserById`, `email_confirm`) + `profiles.email`
  together (`ClientDetailsForm`, `actions/clients.ts`).
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
  builder). 10 templates: welcome, password_reset, task_completed, package_half, package_depleted,
  hours_added, new_task_admin, ticket_reply, client_reply_admin, **task_assigned**. Merge tags
  (`{first_name}`, `{hours_remaining}`, `{task_time}`, **`{completion_note}`**, …). "Copy from another
  template" supported. No auto-logo. `lib/email/dispatch.ts` renders + substitutes + sends, falling
  back to `DEFAULT_BLOCKS`. Admin→client replies **attach the client's files to the email** (Resend
  `attachments` by URL).
  - **task_assigned:** assigning a task to an admin emails that assignee (`notifyTaskAssigned`, fired
    from `updateTicket` when the assignee changes, is non-null, and isn't a self-assign).
  - **task_completed** carries the optional **`{completion_note}`** the admin typed in the complete
    dialog (styled block, escaped + newline-aware; renders nothing when empty).
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
- **PWA (installable to a phone home screen)** — `app/manifest.ts` (typed; served at
  `/manifest.webmanifest`), `public/sw.js` (**caches nothing — see §6 before touching it**),
  `components/ServiceWorkerRegistrar.tsx` (mounted in the root layout, so the app is installable
  from the login screen too). One install serves **both audiences**: `start_url` is `/`, which
  `app/page.tsx` already dispatches by role (admin → `/admin`, client → `/portal`, logged out →
  `/login`). `theme_color` is white to match the NavBar the status bar sits above; `background_color`
  `#f5f5f5` is the splash. Icons come from `scripts/gen-icons.js` (§6). No offline support, by
  choice. Note that an installed iOS web app gets its own cookie jar, separate from Safari — the
  first launch always needs a fresh login, which is expected, not a bug.

---

## 6. Conventions & gotchas

- **Icons:** custom SVG set in `components/icons.tsx` (`mk()` factory). They render **solid black
  `#000000` by default**, unless the className carries an intent color (`text-white|emerald|red|
  primary|…`, matched by `KEEP_COLOR`). Icons on dark buttons need `text-white`. Email builder still
  uses lucide. `Loader2` re-exported from lucide. **`Play`/`Pause`/`Check`** are circular (the circle
  is part of the glyph) — used by the row timer. Row action/timer buttons are fixed **`h-[40px]
  w-[40px]`** flex-centered circles with **26px (px-based)** icons; use explicit px sizes, not `rem`
  (`h-10` inflates to 50px under the 125% root font). Gray buttons use `#f5f5f5`; play is `bg-black`,
  turning `bg-emerald-500` while the timer runs.
- **Download-all = ZIP** (`lib/download-files.ts`, lazy `JSZip`): files are cross-origin signed URLs,
  so the old per-file `a.click()` loop was throttled/dropped by browsers. Now each file is fetched as
  a blob and zipped into one object-URL download (busy state + failure reporting). Used by
  `TaskDetails`, `NotesPanel`, and the client task thread.
- **Modal** (`components/ui/Modal.tsx`): `closeOnBackdrop` (default true) — the new-task modals pass
  `false` so a stray backdrop click can't discard a draft; the modal also ignores a click whose
  mousedown started inside the box (text-selection drag). Portal `TicketForm` **auto-saves a draft**
  (title/description/links) to localStorage (debounced, restore banner, clears on submit; files excluded).
  The unmount-flush keeps a `skipFlush` ref set on successful submit — the modal unmounts in the same
  batch that clears the fields, so without it the cleanup's stale closure would re-save the just-created
  task as a "draft".
- **React-19 form-action reset:** a `<form action={…}>` auto-resets its uncontrolled fields after the
  action runs. `TasksTable`'s edit modal closes on the `editState` **object** (fresh per submit), NOT on
  `editState.ok` — `ok` stays `true` across consecutive edits, so keying on it skipped closing the modal
  on the 2nd+ assignment and the reset flipped the assignee `<select>` back to its default while the DB
  write actually succeeded.
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
- **⚠️ The service worker must never cache — this is load-bearing.** `public/sw.js` exists only to
  make the app installable (Chrome gates the automatic install prompt on a `fetch` handler being
  present) and deliberately holds no caches; its fetch listener is empty so every request stays on
  the browser's normal network path. Adding caching for `/_next/static/**` would break the
  stale-chunk recovery directly above: the reload in `error.tsx` would be served the same stale
  chunks, the 20s guard would read that as "reloaded and still broken → real bug", and a condition
  that heals in one second becomes permanent — the manual refresh button can't fix it either.
  Caching authenticated HTML would additionally outlive a logout and leak one client's data to the
  next person holding the phone. Offline is a deliberate non-goal: every page is `force-dynamic`
  over live Supabase data, so a cached view would show stale hours/task state, which is worse than
  an honest error (Chrome supplies its own offline page). Full reasoning is in `public/sw.js`.
- **Deploy propagation lag — don't misdiagnose it:** `/api/version` flips to the new SHA *before*
  static assets finish propagating. Observed 2026-07-15: ~80s after a deploy the version endpoint
  already reported the new SHA while `/favicon.ico` and `/icon.svg` still 404'd and
  `/apple-icon.png` served fine; all three were 200 a minute later with no code change. The Worker
  swaps over faster than the assets binding fills, and the two serving paths propagate on
  different clocks. Wait and re-test before concluding a deploy is broken. The `x-opennext: 1`
  header marks assets served through the Worker; assets from the Cloudflare binding show
  `CF-Cache-Status` and no `x-opennext`.
- **Favicon / app icons** (`app/icon.svg`, `app/favicon.ico`, `app/apple-icon.png`): App Router
  file conventions — Next emits the `<link>` tags itself, so **nothing references them in
  `layout.tsx`**; renaming or moving them silently drops the icons. All three derive from one
  brand asset (black disc, white "U") and are **committed binaries — they do not regenerate from
  the SVG**. If the brand asset changes, re-run `scripts/gen-icons.js` (`node scripts/gen-icons.js`,
  uses the `sharp` that ships transitively with Next). Notes for whoever touches them: `sharp`
  cannot write ICO, so the script hand-builds the ICO container around PNG payloads (16/32/48, for
  Safari and older browsers, which don't accept SVG favicons); `apple-icon.png` is flattened onto
  black because iOS discards alpha and would otherwise paint the transparent corners itself.
  - The same script emits the **PWA icons** into `public/` (`icon-192`, `icon-512`,
    `icon-maskable-512`), referenced by URL from `app/manifest.ts`. The maskable one is separate
    art on purpose: Android crops adaptive icons to a shape *it* picks, and the plain icon clears
    the 80% safe zone by only ~7px, so a circle mask leaves the "U" pressed against the edge with
    none of the black ring the brand icon has. The script rebuilds it from the same SVG — disc
    swapped for a full-bleed rect, glyph scaled to the safe zone — so there's still one source of
    truth for the glyph. All PWA icons are flattened: a launcher icon with holes shows the user's
    wallpaper through them.
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
  actions/admin.ts               tickets/projects (3 types), manual time, updateTicket (→ notifyTaskAssigned)
  actions/messages.ts            threads, getConversations, read-state, sendTicketReply (→ taskRecipient)
  actions/tickets.ts             client createTicket (stamps created_by)
  actions/timer.ts               start/pause/completeTask(id,note) + addManualTimeToTask (open task, no email)
  actions/project-notes.ts       admin project note cards + files
  actions/ticket-notes.ts        studio task notes (admin CRUD + getMyTicketNotes for the client)
  actions/email-log.ts           getEmailLog (search/paginate) + backfillEmailLog (domain-scoped)
  actions/stripe.ts              invoice/payment intent
  api/email/inbound/route.ts     Resend inbound webhook
  api/resend/webhook/route.ts    Resend delivery-status webhook (Svix)
  api/stripe/webhook/route.ts    Stripe webhook (idempotent)
  set-password/page.tsx          token_hash + verify-on-submit
  globals.css                    125% root font, min-width:0 on form controls, #f5f5f5
  icon.svg / favicon.ico / apple-icon.png   app icons — App Router conventions, auto-linked (§6)
  manifest.ts                    PWA manifest → /manifest.webmanifest (start_url "/" = role-aware)
components/
  ServiceWorkerRegistrar.tsx     registers /sw.js (root layout); sw.js caches NOTHING — §6
  NavBar.tsx                     responsive nav (rootHref prop; admin + portal)
  icons.tsx                      custom black icon set
  admin/TasksTable.tsx           tasks table (desktop) + mobile cards; פרויקט col links; פתח/ה indicator
  admin/RowTimerControl.tsx      per-row play/pause(+green running) + complete-with-note dialog (40px/26px)
  admin/TaskDetails.tsx          task view modal: submitted info + manual time + studio notes + complete
  admin/ClientDetailsForm.tsx    client details; admin mode edits the login email
  admin/CreateTaskForm.tsx / portal/TicketForm.tsx  new-task forms (TicketForm = localStorage drafts)
  admin/NotesPanel.tsx           shared notes UI (text+files, CRUD, search, download-all) — project & task
  admin/ProjectRow.tsx           project card (type badge / usage bar)
  admin/ProjectMembers.tsx       add/remove project members
  admin/ProjectNotes.tsx         thin wrapper over NotesPanel (per-project notes)
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
  download-files.ts              fetch+zip (JSZip) one-click "download all" for signed-URL files
  format.ts / supabase/{server,admin,middleware}.ts / after.ts
scripts/gen-icons.js             regenerates favicon/apple/PWA icons from app/icon.svg (§6)
public/sw.js                     minimal service worker — installability only, no caching (§6)
supabase/migrations/*.sql        DDL (run manually in Supabase)
```

---

## 8. Current state / open items

- All migrations applied (re-verified via SQL 2026-06-24); everything below is **live in prod**.
  **No known open bugs. Nothing pending Sam.**
- Session 2026-07-23 (later) — **admin task-management redesign**: the three overlapping modals
  (details / thread / edit) are GONE, replaced by a **dedicated task page**
  `/admin/tasks/[id]` (`TaskPageView`): a static **info row** (title, status, project, client,
  opener, date — deliberately not editable; task fields come from the client, so the whole edit
  modal was dropped) over an interactive **work row** (assignee dropdown saving inline via
  `updateTicket`, live timer + `RowTimerControl` — now play/pause ONLY — and a "עריכת זמן ידנית"
  accordion holding the add/subtract control), then two columns: the task content + **"תיעוד
  פנימי"** (right) beside the conversation (left); mobile gets a two-tab switcher. The tasks
  table rows are the single entry point (whole row → task page; unread = bold title + red dot,
  mail-style; per-row complete ✓ / edit / delete / chat icons removed — delete lives behind the
  page's ⋯ menu with an in-app confirm Modal, new `danger` Button variant). **"הערות מהסטודיו"
  became admins-only "תיעוד פנימי"** — `getMyTicketNotes` was deleted and the portal no longer
  renders notes (existing 5 notes + 27 files kept, hidden from clients; Sam approved after
  verifying every file was admin-uploaded via the storage-path uid prefix). Admin **green
  toasts** on: task created, message sent (task page + inbox), task completed, task deleted,
  time adjusted, assignee changed. Ticket-touching actions now revalidate `("/admin",
  "layout")` so the nested page refreshes. Emails' `task_url` (new_task_admin, task_assigned,
  client_reply_admin) now deep-link to `/admin/tasks/[id]`; the inbox thread header got a
  "פתיחת המשימה" link. **Google Sans app-wide** (Google Fonts CDN `<link>`, has a Hebrew
  subset; Heebo kept as self-hosted fallback in the Tailwind stack). Verified in the browser
  end-to-end as admin (create→toast, assignee→toast, +30m→toast, internal note, send→bubble+
  toast, complete→toast, delete→confirm modal+toast) + mobile tabs; `tsc` and a full
  `next build` pass. Polish round (same day): the ⋯ menu clipped under the header card's
  `overflow-hidden` → replaced with a **direct trash icon** (confirm modal stays as the guard);
  the manual-time accordion **closes itself** after a successful update; tasks-table typography
  unified — one face/size for every cell (LiveTime dropped `font-mono`, keeps `tabular-nums`),
  title black (bold only when unread), timer green only while running, the rest slate-600.
- Session 2026-07-23 (continuation of the UX pass): **client read-state reset** — one-off script
  seeded `message_reads` (read_at = now) for all 21 client users × their 73 tickets that had
  studio messages (96 rows), so the new red dot only fires for messages sent from now on;
  **email text now logged as the message body** — `dispatchEmail` renders the template's content
  blocks (headings/paragraphs/html notes, buttons and chrome skipped) to plain text via the new
  exported `blocksToPlainText` and stores it as `body_text`, killing the
  "(הודעה מעוצבת — נשלחה במייל)" placeholder for future sends; the 75 existing html-only out
  messages were **backfilled** in prod by stripping their stored `body_html` (output verified
  clean); **gender-neutral sweep of every client-facing string** (upload dropzone, thread
  composer, retry/remove labels, busy states now plural "יוצרים/שולחים/ממתינים…", login +
  set-password pages, "לא מחובר" → "נדרשת התחברות" in client actions). Both one-off scripts live
  in the session scratchpad only — they are not in the repo.
- Session 2026-07-22: **client-portal UX pass** — green success **toasts** (new
  `components/ui/Toast.tsx`: event-bus `showToast()` + one `<Toaster />` in the portal layout,
  5s auto-dismiss): creating a task now closes the modal and toasts instead of the inline
  "נוצרה בהצלחה" line, and sending a thread message toasts as the modal closes (new `onSent`
  hook on `ConversationThread`); the tasks list's **conversation column adapts to content**
  ("התחלת שיחה" / "צפייה בשיחה" / "קריאת הודעה חדשה" + red dot) off per-ticket message stats
  computed in `portal/tasks/page.tsx`; **client read state reuses `message_reads`** — its RLS
  only checks `admin_id = auth.uid()`, so client rows coexist with admin rows, **no migration
  needed** — written by the new `markMyTicketRead` when a thread opens (dot clears instantly via
  local state); **client-facing status collapses** to ממתין / בטיפול (amber) / הושלם
  (`ClientStatusBadge`): "בטיפול" from the studio's first touch (any time log OR any admin
  message) and it survives timer pauses until completion — internal statuses and all admin
  screens unchanged; **task-modal separation** — "המשימה המקורית" heading with the title, no
  chat background, then a divider captioned "תכתובת עם הסטודיו בנוגע למשימה זו" before the chat
  bubbles. Verified end-to-end in the browser as a client (both toasts, all three labels, all
  three statuses, instant dot clear). **Admin-side counterpart deliberately deferred** to the
  next session. Leftover local test data on client "אוריה בדיקה": task "בדיקת טוסט יצירה" + a
  "בדיקת שליחה עם טוסט" message on טסט1 — safe to delete.
- Session 2026-07-17: **PWA — the app installs to a phone home screen** for admins and clients
  alike off a single manifest, since `start_url: "/"` rides the role dispatcher that `app/page.tsx`
  already had (§5). Ships `app/manifest.ts`, a **deliberately no-op** `public/sw.js` (§6 explains
  why caching would break deploys — read it before touching that file), and maskable PWA icons from
  the existing `gen-icons.js`. Verified locally: manifest served as `application/manifest+json`,
  `sw.js` as `application/javascript`, worker activates at scope `/` and controls the page while
  holding zero caches, chunks and `/api/version` still come off the network with the worker in
  control, and the middleware's auth guards still redirect `/admin` + `/portal` after the matcher
  edit. Not verified: an actual iPhone/Android install — no device here.
- Session 2026-07-15 — first under Sam's ownership: **project handed over** (§0 rewritten:
  Hebrew replies, no macOS path, confirm before pushing); **verified the service-role key** in
  `.env.local` works (payload `role: service_role`, `ref` matches the project, signature accepted by
  both PostgREST and `/auth/v1/admin/*`) — so §0's old claim that the assistant can't reach the DB
  was wrong and is now corrected; **added the favicon / app icons** (`icon.svg` + hand-built
  `favicon.ico` + `apple-icon.png`, `scripts/gen-icons.js`, §6) — verified end-to-end in prod;
  documented the **deploy propagation lag** (§6) after a fresh deploy's 404s were briefly
  misread as a routing bug; **bumped the deploy workflow** to `actions/checkout@v7` +
  `actions/setup-node@v6`, clearing GitHub's Node 20 EOL warning (v5/v6/v7 all run node24, so
  the minimum bump would have held just as long — going current was hygiene, not urgency;
  setup-node stays at v6 on purpose, see the comment in `deploy.yml`).
- Prior session (2026-06-30): **client reply reopens a completed task** (→ `pending`, back to "פתוחות",
  `reopenIfCompleted` on both inbound paths); fixed **TicketForm draft re-saving a just-created task**
  (unmount-flush `skipFlush` ref); fixed **assignee select reverting on consecutive edits without a
  refresh** (close the edit modal on the `editState` object, not sticky `editState.ok`).
- Session 2026-06-24: **task correspondence routes to the opener** (`tickets.created_by` +
  `taskRecipient`, with a "פתח/ה" indicator on the tasks table); **"הערות מהסטודיו"** per-task notes +
  files (admin CRUD, client-visible read-only, never emailed, download-all) on a shared `NotesPanel`;
  **manual time on an existing open task** (no new task/project, no email); **redesigned per-row timer**
  (`RowTimerControl`: black play/pause + green complete, custom circular icons, single live clock in
  the "זמן ביצוע" column).
- Later same day (follow-up commits): **complete-task confirm dialog with an optional `{completion_note}`**
  added to the client email; **`task_assigned` email** to the assignee on (re)assignment; **edit a
  client's login email** (Auth + profiles); **row buttons** finalized to 40px circles + 26px icons +
  **green running state**; **download-all → single ZIP** (`lib/download-files.ts`, JSZip); **new-task
  modal** no longer closes on backdrop click + **localStorage draft auto-save** (`TicketForm`).
- Session 2026-06-20: full mobile-native pass (grid-cols-1 fix, stacked cards, min-width:0);
  **Stripe switched to LIVE**; client portal rebuilt as a routed NavBar menu w/ multi-project
  dashboard; **admin centralized inbox** (beep, cross-device reads, realtime); **3rd project type
  "build"**; **admin project notes** (cards + files); **set-password link fix** (token_hash) +
  per-client resend; **full outbound email log** (logging + Resend backfill + delivery webhook),
  scoped to this app's domain; admin→client email **file attachments**; browser title →
  "אפליקציית שירות - סטודיו אוריה גנור"; assorted polish.

### Possible next steps (not requested yet)
- Inbox: per-client grouping (collapse a client's tasks under one header) — discussed, deferred.
- By-client filter on the tasks table (currently by-site/assignee).
- Desktop/OS push notifications for new messages when the app isn't open (Notification API). The
  service worker this needs now exists (§6) — but it is a no-op by design, so this means adding
  `push`/`notificationclick` handlers to it, **not** caching.
- A custom in-app install button (`beforeinstallprompt`), if the browser's own prompt turns out to
  be too easy for clients to miss.

---

## 9. How to start the next conversation

> המשך עבודה על ה-Studio Service App. הריפו: `C:\Users\f5f5\code\studioservice`.
> קרא קודם את `HANDOFF.md` — הוא מקור האמת לארכיטקטורה, פיצ'רים ומלכודות
> (`README.md` מכסה הקמה ופריסה בלבד). ענה בעברית, תשובות קצרות.
> `npx tsc --noEmit` לפני כל קומיט; דחיפה ל-`main` = פריסה מיידית לפרודקשן, אז אשר לפני.
> שים לב: הסביבה המקומית מצביעה על מסד הפרודקשן. ואז: <המשימה שלך>.
