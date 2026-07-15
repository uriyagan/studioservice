# Studio Service App — פורטל שירות וניהול שעות

מערכת פנימית (Next.js 15 + Supabase + Stripe) המחליפה את Toggl: מעקב שעות פר-משימה,
פורטל לקוח שקוף, מערכת משימות עם קבצים והתכתבות, ורכישת חבילות שעות.

חי בפרודקשן: **https://service.uriyaganor.com**

> **📄 לפני עבודה על הקוד — קרא את [`HANDOFF.md`](HANDOFF.md).**
> ה-README הזה מכסה **הקמה ופריסה** בלבד. כל מה שקשור לארכיטקטורה, לפיצ'רים,
> למוסכמות ולמלכודות מתועד ב-`HANDOFF.md`, והוא מקור האמת.

---

## 1. סטאק

| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Server Actions, Tailwind |
| DB / Auth / Storage | Supabase (Postgres + RLS) |
| תשלומים | Stripe — embedded PaymentElement (**LIVE בפרודקשן**) |
| מיילים | Resend (יוצא + נכנס) |
| פריסה | Cloudflare Workers דרך OpenNext, אוטומטית ב-GitHub Actions |
| שפה | עברית, RTL. פונט-שורש 125% (`app/globals.css`) |

---

## 2. הקמה מקומית

```bash
npm install
cp .env.local.example .env.local   # מלא את הערכים — ראה §3
npm run dev                        # http://localhost:3000
```

> ### ⚠️ הסביבה המקומית מצביעה על מסד הפרודקשן
> אין פרויקט Supabase נפרד לפיתוח. משמעות הדבר: **כל פעולה מקומית נוגעת בנתונים
> חיים של לקוחות אמיתיים** — משימה שתיצור ב-localhost תופיע אצל לקוח אמיתי.
>
> שתי הגנות מובנות, אל תבטל אותן בלי סיבה:
> - **השאר את `RESEND_API_KEY` ריק.** `lib/email/send.ts` זורק שגיאה כשהמפתח חסר
>   במקום לשלוח — כך אף מייל בדיקה לא מגיע ללקוח אמיתי.
> - **השתמש במפתחות Stripe במצב test.** הפרודקשן רץ על LIVE; מפתחות live מקומית
>   יחייבו כרטיסי אשראי באמת.
>
> אם תרצה בידוד מלא — הקם פרויקט Supabase נפרד לפי §4 והפנה אליו את `.env.local`.

בדיקות לפני קומיט:

```bash
npx tsc --noEmit    # תמיד
npm run build       # לשינויים גדולים
```

---

## 3. משתני סביבה

| משתנה | נדרש? | מקור |
|-------|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API → `anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API → `service_role` — **סודי, עוקף RLS** |
| `NEXT_PUBLIC_SITE_URL` | ✅ | `http://localhost:3000` מקומית / `https://service.uriyaganor.com` בפרודקשן |
| `STRIPE_SECRET_KEY` | ✅ | Stripe → Developers → API keys (**test** מקומית) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | Stripe → Developers → API keys (**test** מקומית) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | פלט של `stripe listen` מקומית / Signing secret בפרודקשן |
| `RESEND_API_KEY` | לשליחת מיילים | Resend → API Keys. **מומלץ ריק מקומית** (ראה §2) |
| `RESEND_WEBHOOK_SECRET` | אופציונלי | אימות Svix ל-webhook סטטוס מסירה. לא נדרש מקומית |
| `INBOUND_WEBHOOK_TOKEN` | אופציונלי | מגן על `/api/email/inbound`. נדרש רק לבדיקת מייל נכנס |
| `NEXT_PUBLIC_BUILD_ID` | אופציונלי | נקבע אוטומטית ל-`github.sha` בפריסה; נופל ל-`"dev"` מקומית |

---

## 4. הקמת Supabase (חד-פעמי — הפרויקט הקיים כבר מוקם)

1. צור פרויקט ב-[supabase.com](https://supabase.com).
2. **SQL Editor** → הרץ את `supabase/schema.sql` (טבלאות, view, RLS, triggers, bucket `attachments`).
3. **הרץ את כל הקבצים ב-`supabase/migrations/` לפי סדר התאריכים בשם הקובץ.**
   `schema.sql` הוא הבסיס בלבד — הוא לא כולל את המיגרציות שנוספו אחריו.
4. **Authentication → URL Configuration:** `Site URL` = הדומיין, והוסף `<domain>/**` ל-Redirect URLs.

**מיגרציות מורצות ידנית** ב-SQL Editor — אין שלב אוטומטי בפריסה. אחרי הרצה, ודא בשאילתת בדיקה.

### יצירת משתמש האדמין הראשון
1. **Authentication → Users → Add user** (אימייל + סיסמה, סמן Auto-confirm).
2. **SQL Editor:**
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
   ```

מכאן האדמין יוצר לקוחות ופרויקטים מהממשק.

---

## 5. Stripe

חבילות השעות והמחירים מנוהלים **בטבלת `hour_packages` דרך `/admin/billing`** — לא בקוד.

**Webhook** (`/api/stripe/webhook`, אידמפוטנטי לפי `stripe_payment_intent`) מטפל בשני אירועים:

- `payment_intent.succeeded` — **המסלול העיקרי** (embedded PaymentElement)
- `checkout.session.completed` — מסלול legacy

בהגדרת endpoint בפרודקשן (`https://service.uriyaganor.com/api/stripe/webhook`) יש לסמן את
**שניהם**; רישום `checkout.session.completed` בלבד יחמיץ את רוב התשלומים.

בדיקה מקומית:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## 6. Resend (מיילים)

- **יוצא:** כל המיילים עוברים דרך `lib/email/send.ts` ונרשמים ב-`email_log` (`/admin/emails`).
- **נכנס:** Resend שולח ל-`/api/email/inbound` (מטא-דאטה בלבד; הגוף נמשך ב-API נפרד).
- **סטטוס מסירה:** `/api/resend/webhook` (מאומת Svix) מעדכן delivered/bounced/opened.

> ⚠️ **חשבון ה-Resend משותף עם פרויקטים אחרים** (ClickPo, Johnny). כל קוד שמושך מ-Resend
> מקבל את כל החשבון — חובה לסנן לפי הדומיין `service.uriyaganor.com`, אחרת נחשפים מיילים
> של פרויקטים אחרים. פרטים ב-`HANDOFF.md` §6.

---

## 7. פריסה לפרודקשן

**דחיפה ל-`main` → GitHub Actions → Cloudflare Workers.** אין שלב ידני, ואין Vercel.

```bash
npx tsc --noEmit
git add -A && git commit -m "..." && git push origin main   # → פריסה אוטומטית (~1–2 דק')
```

- **Workflow:** `.github/workflows/deploy.yml` — מריץ `npm run cf:deploy` (OpenNext build + wrangler deploy).
- **משתני `NEXT_PUBLIC_*`** מוטמעים בזמן build ומוגדרים כ-plaintext ב-`deploy.yml`
  (הם נשלחים לדפדפן ממילא — ציבוריים בתכנון).
- **סודות ריצה** (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY` …)
  **אינם** ב-`deploy.yml` — הם Worker secrets:
  ```bash
  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
  ```
  `CLOUDFLARE_API_TOKEN` הוא GitHub secret.
- **DNS/SSL:** מוגדר ב-`wrangler.jsonc` כ-`custom_domain`. מכיוון ש-`uriyaganor.com`
  נמצא באותו חשבון Cloudflare, **הפריסה יוצרת את רשומת ה-DNS ואת תעודת ה-SSL אוטומטית**
  — אין להוסיף CNAME ידנית.

פריסה מקומית (חירום בלבד — עוקף CI):
```bash
npm run cf:preview   # build + preview מקומי של ה-Worker
npm run cf:deploy    # build + deploy ישיר
```

---

## 8. מבנה הפרויקט

```
app/
  page.tsx                    ניתוב שורש לפי תפקיד
  login/  set-password/       כניסה + הגדרת סיסמה (token_hash, scanner-safe)
  admin/                      אזור ניהול (layout מגן role=admin)
    page.tsx                  דשבורד משימות + טיימר פר-שורה
    projects/[id]/            פרויקטים + משתתפים + הערות פנימיות
    clients/[id]/             לקוחות + פרטים + מחיקה
    emails/                   תבניות מייל + בנאי בלוקים + לוג שליחות
    billing/                  ניהול חבילות שעות
    users/
  portal/                     פורטל לקוח — 4 מסלולים
    page.tsx                  לוח בקרה   tasks/  packages/  profile/
  actions/                    Server Actions (admin, tickets, timer, messages,
                              clients, stripe, email, notes, email-log)
  api/
    stripe/webhook/           תשלום → זיכוי שעות
    email/inbound/            מייל נכנס מ-Resend
    resend/webhook/           סטטוס מסירה
    upload-url/  version/
components/
  NavBar  icons  VersionWatcher  TimerControl
  admin/                      TasksTable, RowTimerControl, TaskDetails,
                              InboxWidget, NotesPanel, EmailLogView …
  portal/  email-builder/  ui/
lib/
  supabase/                   client / server / admin / middleware
  email/                      dispatch, render, send, notifications, thread
  auth-links  portal-data  download-files  format  after  stripe  types
supabase/
  schema.sql                  סכמה בסיסית + RLS
  migrations/                 DDL מצטבר — מורץ ידנית לפי סדר תאריכים
```

---

## 9. ארכיטקטורה — נקודות מפתח

- **טיימר refresh-safe:** הזמן מחושב מ-`time_logs` (segment פעיל = `end_time IS NULL`),
  כך שרענון דף משחזר את אותו ערך וממשיך לתקתק.
- **`hours_used` ללא drift:** מחושב ב-view `project_stats` מסכום זמני המשימות שהושלמו.
  ה-view הוא מקור האמת היחיד לניצול שעות. ריטיינר ופרויקט הקמה אינם מנוכים.
- **שתי שכבות גישה ל-Supabase:** `createClient()` כפוף ל-RLS (פועל כמשתמש המחובר);
  `createAdminClient()` הוא service-role ו**עוקף RLS** — לפעולות אדמין, webhooks ומיילים.
- **RLS:** לקוח רואה רק את הפרויקטים שלו; אדמין רואה הכול דרך `is_admin()`.
  שייכות לפרויקט דרך `is_project_member()` / `is_ticket_member()`.
- **העלאות:** ישירות מהדפדפן ל-Storage דרך signed URLs (ללא הגבלת כמות/גודל בשרת).
- **מיילים כתבניות:** כל מייל מערכת הוא תבנית הניתנת לעיצוב ב-`/admin/emails`,
  עם merge tags. `lib/email/dispatch.ts` מרנדר, מחליף תגיות ושולח.
