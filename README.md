# Studio Service App — פורטל שירות וניהול שעות

מערכת פנימית (Next.js + Supabase + Stripe) המחליפה את Toggl: מעקב שעות פר-פנייה,
פורטל לקוח שקוף, מערכת פניות עם קבצים, ורכישת חבילות שעות.

מיועד לפריסה תחת `https://service.uriyaganor.com`.

---

## 1. הקמה מקומית

```bash
npm install
cp .env.local.example .env.local   # מלא את הערכים
npm run dev                        # http://localhost:3000
```

## 2. הקמת Supabase (חד-פעמי)

1. צור פרויקט חדש ב-[supabase.com](https://supabase.com).
2. **SQL Editor** → הדבק והרץ את כל `supabase/schema.sql`.
   זה יוצר את כל הטבלאות, ה-view, ה-RLS, ה-trigger וה-bucket `attachments`.
3. **Project Settings → API** → העתק:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (סודי! צד-שרת בלבד)

### יצירת משתמש האדמין הראשון
האדמין לא נוצר אוטומטית. צור משתמש ואז הפוך אותו לאדמין:

1. **Authentication → Users → Add user** (אימייל + סיסמה, סמן Auto-confirm).
2. **SQL Editor**, הרץ:
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
   ```
מכאן האדמין יוצר לקוחות ופרויקטים מתוך הממשק.

## 3. הקמת Stripe

1. **Developers → API keys** → `Secret key` → `STRIPE_SECRET_KEY`,
   `Publishable key` → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. **Developers → Webhooks → Add endpoint:**
   - URL: `https://service.uriyaganor.com/api/stripe/webhook`
   - Event: `checkout.session.completed`
   - העתק את ה-`Signing secret` → `STRIPE_WEBHOOK_SECRET`.
3. החבילות והמחירים מוגדרים ב-`lib/packages.ts` (₪, ניתן לעריכה חופשית).

בדיקה מקומית של webhook:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## 4. פריסה ל-Vercel + Cloudflare (service.uriyaganor.com)

### א. פריסה ל-Vercel
1. דחוף את הקוד ל-GitHub וייבא ב-[vercel.com](https://vercel.com) (framework מזוהה כ-Next.js).
2. **Settings → Environment Variables** → הוסף את כל המשתנים מ-`.env.local.example`,
   כאשר `NEXT_PUBLIC_SITE_URL=https://service.uriyaganor.com`.
3. **Settings → Domains** → הוסף `service.uriyaganor.com`. Vercel ייתן יעד CNAME
   (בדרך כלל `cname.vercel-dns.com`).

### ב. Cloudflare DNS
ב-Dashboard של `uriyaganor.com` → **DNS → Records → Add record:**

| Type  | Name      | Target                  | Proxy           |
|-------|-----------|-------------------------|-----------------|
| CNAME | `service` | `cname.vercel-dns.com`  | **DNS only** (אפור) |

> חשוב: כבה את ה-Proxy (ענן אפור) לרשומה הזו. כך Vercel מנפיק ומנהל את תעודת
> ה-SSL ישירות, ונמנעים מ-redirect-loops של "too many redirects" שנגרמים מ-proxy
> כפול. אם אתה חייב Proxy פעיל (ענן כתום) — קבע **SSL/TLS → Full (Strict)**.

### ג. SSL / TLS ו-Cookies
- **SSL/TLS → Overview → Full (Strict)** (לעולם לא "Flexible" — שובר את ה-cookies).
- **SSL/TLS → Edge Certificates → Always Use HTTPS = On.**
- עוגיות ה-auth של Supabase כבר נשלחות עם `Secure` + `SameSite=Lax`
  אוטומטית על דומיין HTTPS — לא נדרשת הגדרה נוספת.

### ד. עדכון Supabase ל-production
**Authentication → URL Configuration:**
- `Site URL` = `https://service.uriyaganor.com`
- הוסף ל-Redirect URLs את `https://service.uriyaganor.com/**`.

---

## 5. מבנה הפרויקט

```
app/
  page.tsx                 ניתוב שורש לפי תפקיד
  login/                   מסך כניסה
  admin/                   אזור ניהול (layout מגן role=admin)
    page.tsx               דשבורד פניות + בקרת טיימר
    projects/              ניהול פרויקטים + עדכון שעות
    users/                 יצירת לקוחות
  portal/                  פורטל לקוח (3 טאבים)
  actions/                 Server Actions: timer, admin, tickets, stripe, auth
  api/
    stripe/webhook/        קליטת תשלום → הוספת שעות
    upload-url/            signed URL להעלאת קבצים
components/
  TimerControl.tsx         טיימר חי refresh-safe
  ui/                      Card / Button / Badge
  admin/  portal/          טפסים וטאבים
lib/
  supabase/                client / server / admin / middleware
  stripe.ts  packages.ts  format.ts  types.ts
supabase/schema.sql        הסכמה המלאה + RLS
```

## ארכיטקטורה — נקודות מפתח
- **טיימר refresh-safe:** הזמן מחושב מ-`time_logs` (ה-segment הפעיל = `end_time IS NULL`),
  כך שרענון דף משחזר את אותו ערך וממשיך לתקתק.
- **`hours_used` ללא drift:** מחושב ב-view `project_stats` מסכום זמני הפניות שהושלמו;
  ריטיינר אינו מנוכה.
- **RLS:** לקוח רואה אך ורק את הפרויקט שלו; כתיבות הטיימר/פרויקטים מוגבלות לאדמין.
- **העלאות:** ישירות מהדפדפן ל-Storage דרך signed URLs (ללא הגבלת כמות/גודל בשרת).
