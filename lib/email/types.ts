// Shared email-builder data model (block tree + design + settings),
// the list of automated emails, and the merge tags available per email.

export type EmailBlock = {
  id: string;
  type:
    | "heading"
    | "text"
    | "image"
    | "button"
    | "divider"
    | "spacer"
    | "columns"
    | "social"
    | "html"
    | "video"
    | "footer";
  // Block-specific props are loosely typed (no schema validation).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
};

// Template-level visual design (the shared "look" wrapping the blocks).
export type EmailDesign = {
  emailBackground: string;
  contentBackground: string;
  textColor: string;
  linkColor: string;
  fontFamily: string; // key into FONT_STACKS
  fontSize: number;
  contentAlign: "right" | "center" | "left";
  contentWidth: number;
  borderRadius: number;
  outerPadding: number;
  innerPadding: number;
};

export const DEFAULT_DESIGN: EmailDesign = {
  emailBackground: "#f4f4f7",
  contentBackground: "#ffffff",
  textColor: "#333333",
  linkColor: "#111111",
  fontFamily: "system",
  fontSize: 15,
  contentAlign: "right",
  contentWidth: 600,
  borderRadius: 12,
  outerPadding: 24,
  innerPadding: 32,
};

export type EmailSettings = {
  subject?: string;
};

// Global brand / sender settings (one row in email_settings).
export type BrandSettings = {
  fromName: string;
  fromEmail: string;
  logoUrl: string;
  brandColor: string;
};

export const DEFAULT_BRAND: BrandSettings = {
  fromName: "Uriya Ganor Studio",
  fromEmail: "info@uriyaganor.com",
  logoUrl: "https://service.uriyaganor.com/studio-logo.svg",
  brandColor: "#111111",
};

// The automated emails. `to` = default recipient audience.
export const EMAIL_DEFS = [
  { key: "welcome", title: "ברוך הבא (משתמש חדש)", to: "client" },
  { key: "password_reset", title: "איפוס סיסמה (יזום ע״י הלקוח)", to: "client" },
  { key: "task_completed", title: "משימה הושלמה", to: "client" },
  { key: "package_half", title: "50% מהחבילה נוצלו", to: "client" },
  { key: "package_depleted", title: "החבילה הסתיימה", to: "client" },
  { key: "hours_added", title: "שעות נוספו לחבילה", to: "client" },
  { key: "new_task_admin", title: "משימה חדשה מלקוח (למנהלים)", to: "admin" },
] as const;

export type EmailKey = (typeof EMAIL_DEFS)[number]["key"];
export const EMAIL_KEYS = EMAIL_DEFS.map((e) => e.key) as EmailKey[];

// Email-safe font stacks (no web fonts).
export const FONT_STACKS: { key: string; label: string; stack: string }[] = [
  { key: "system", label: "ברירת מחדל", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" },
  { key: "arial", label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { key: "helvetica", label: "Helvetica", stack: "Helvetica, Arial, sans-serif" },
  { key: "verdana", label: "Verdana", stack: "Verdana, Geneva, sans-serif" },
  { key: "tahoma", label: "Tahoma", stack: "Tahoma, Geneva, sans-serif" },
  { key: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
  { key: "times", label: "Times", stack: "'Times New Roman', Times, serif" },
];

export function fontStack(key: string): string {
  return FONT_STACKS.find((f) => f.key === key)?.stack ?? FONT_STACKS[0].stack;
}

// Merge tags, grouped per email, shown in the builder's "dynamic tags"
// dialog and substituted at send time.
export const MERGE_TAGS: {
  group: string;
  emails: EmailKey[]; // which emails these apply to
  tags: { token: string; label: string }[];
}[] = [
  {
    group: "כללי",
    emails: ["welcome", "password_reset", "task_completed", "package_half", "package_depleted", "hours_added", "new_task_admin"],
    tags: [
      { token: "{first_name}", label: "שם פרטי" },
      { token: "{last_name}", label: "שם משפחה" },
      { token: "{full_name}", label: "שם מלא" },
      { token: "{client_name}", label: "שם הלקוח (מלא)" },
      { token: "{project_name}", label: "שם הפרויקט" },
      { token: "{portal_url}", label: "קישור לפורטל" },
      { token: "{site_url}", label: "כתובת האתר" },
    ],
  },
  {
    group: "משתמש חדש",
    emails: ["welcome"],
    tags: [
      { token: "{email}", label: "אימייל הכניסה" },
      { token: "{login_url}", label: "קישור להתחברות" },
    ],
  },
  {
    group: "איפוס סיסמה",
    emails: ["password_reset"],
    tags: [{ token: "{reset_link}", label: "קישור לאיפוס סיסמה" }],
  },
  {
    group: "משימה",
    emails: ["task_completed", "new_task_admin"],
    tags: [
      { token: "{task_title}", label: "שם המשימה" },
      { token: "{task_description}", label: "תיאור המשימה" },
      { token: "{task_url}", label: "קישור למשימה (מנהל)" },
    ],
  },
  {
    group: "שעות חבילה",
    emails: ["task_completed", "package_half", "package_depleted", "hours_added"],
    tags: [
      { token: "{hours_used}", label: "שעות שנוצלו" },
      { token: "{hours_remaining}", label: "שעות שנותרו" },
      { token: "{total_hours}", label: "סך שעות בחבילה" },
      { token: "{hours_added}", label: "שעות שנוספו" },
      { token: "{buy_url}", label: "קישור לרכישת חבילה" },
    ],
  },
  {
    group: "סיכום משימות (מייל סיום חבילה)",
    emails: ["package_depleted"],
    tags: [{ token: "{tasks_summary}", label: "טבלת כל המשימות שבוצעו + זמן" }],
  },
];
