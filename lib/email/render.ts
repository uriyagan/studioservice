// Turns the block tree + design into email-safe HTML, and substitutes
// merge tags. Used for both the live "send test" and real automated
// sends. (In the donkey app this lived in PHP; here it's all in JS.)

import { DEFAULT_BRAND, DEFAULT_DESIGN, fontStack } from "./types";
import type { BrandSettings, EmailBlock, EmailDesign } from "./types";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// If the value already contains HTML (from the inline editor) keep it;
// otherwise escape it and turn newlines into <br>.
function richOrText(v: unknown): string {
  const s = String(v ?? "");
  if (/<[a-z][\s\S]*>/i.test(s)) return s;
  return esc(s).replace(/\n/g, "<br>");
}

function alignOf(v: unknown, fallback: string): string {
  return v === "left" || v === "center" || v === "right" ? v : fallback;
}

function spacing(b: EmailBlock): string {
  const outer = b.outer === undefined ? 8 : Number(b.outer) || 0;
  const inner = b.inner === undefined ? 0 : Number(b.inner) || 0;
  return `margin:${outer}px 0;${inner ? `padding:${inner}px;` : ""}`;
}

function renderBlock(b: EmailBlock, d: EmailDesign): string {
  const wrap = (inner: string) => `<div style="${spacing(b)}">${inner}</div>`;

  switch (b.type) {
    case "heading": {
      const size = b.level === "h1" ? 28 : b.level === "h3" ? 18 : 22;
      const align = alignOf(b.align, "center");
      return wrap(
        `<div style="text-align:${align};font-size:${size}px;font-weight:700;line-height:1.3;color:${d.textColor};">${richOrText(
          b.text
        )}</div>`
      );
    }
    case "text": {
      const align = alignOf(b.align, d.contentAlign);
      const size = Number(b.size) || d.fontSize;
      return wrap(
        `<div style="text-align:${align};font-size:${size}px;line-height:1.6;color:${d.textColor};">${richOrText(
          b.text
        )}</div>`
      );
    }
    case "image": {
      const align = alignOf(b.align, "center");
      const width = Math.max(1, Math.min(100, Number(b.width) || 100));
      if (!b.src) return "";
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" style="width:${width}%;max-width:100%;height:auto;border:0;display:inline-block;" />`;
      const linked = b.href ? `<a href="${esc(b.href)}" target="_blank">${img}</a>` : img;
      return wrap(`<div style="text-align:${align};">${linked}</div>`);
    }
    case "button": {
      const align = alignOf(b.align, "center");
      const radius = Number(b.radius) || 6;
      const fontSize = Number(b.fontSize) || 16;
      return wrap(
        `<div style="text-align:${align};"><a href="${esc(
          b.href || "#"
        )}" target="_blank" style="display:inline-block;background:${esc(
          b.bg || "#111111"
        )};color:${esc(
          b.color || "#ffffff"
        )};padding:12px 26px;border-radius:${radius}px;font-weight:600;font-size:${fontSize}px;text-decoration:none;">${richOrText(
          b.text
        )}</a></div>`
      );
    }
    case "divider": {
      return wrap(
        `<div style="border-top:1px solid ${esc(b.color || "#e5e7eb")};font-size:0;line-height:0;">&nbsp;</div>`
      );
    }
    case "spacer": {
      const h = Number(b.height) || 24;
      return `<div style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</div>`;
    }
    case "html": {
      return wrap(String(b.html ?? ""));
    }
    case "video": {
      if (!b.url) return "";
      const align = alignOf(b.align, "center");
      return wrap(
        `<div style="text-align:${align};"><a href="${esc(
          b.url
        )}" target="_blank" style="color:${d.linkColor};">▶ צפייה בסרטון</a></div>`
      );
    }
    case "social": {
      const align = alignOf(b.align, "center");
      const gap = Number(b.gap) || 8;
      const networks: { type?: string; url?: string }[] = Array.isArray(b.networks) ? b.networks : [];
      const links = networks
        .filter((n) => n.url)
        .map(
          (n) =>
            `<a href="${esc(n.url)}" target="_blank" style="display:inline-block;margin:0 ${gap / 2}px;color:${esc(
              b.color || d.linkColor
            )};text-decoration:none;font-weight:600;">${esc(n.type || "link")}</a>`
        )
        .join("");
      return wrap(`<div style="text-align:${align};">${links}</div>`);
    }
    case "footer": {
      return wrap(
        `<div style="text-align:center;font-size:12px;line-height:1.6;color:#9ca3af;">${richOrText(
          b.text ?? ""
        )}</div>`
      );
    }
    case "columns": {
      const cols: { blocks?: EmailBlock[] }[] = Array.isArray(b.columns) ? b.columns : [];
      const count = cols.length || 1;
      const w = Math.floor(100 / count);
      const cells = cols
        .map(
          (c) =>
            `<td valign="top" style="width:${w}%;padding:0 6px;">${(c.blocks ?? [])
              .map((cb) => renderBlock(cb, d))
              .join("")}</td>`
        )
        .join("");
      return wrap(
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${cells}</tr></table>`
      );
    }
    default:
      return "";
  }
}

export function renderEmailHtml(opts: {
  blocks: EmailBlock[];
  design?: Partial<EmailDesign>;
  brand?: Partial<BrandSettings>;
}): string {
  const d: EmailDesign = { ...DEFAULT_DESIGN, ...(opts.design ?? {}) };
  const brand: BrandSettings = { ...DEFAULT_BRAND, ...(opts.brand ?? {}) };
  const body = (opts.blocks ?? []).map((b) => renderBlock(b, d)).join("");

  const header = brand.logoUrl
    ? `<div style="text-align:center;margin-bottom:20px;"><img src="${esc(
        brand.logoUrl
      )}" alt="${esc(brand.fromName)}" style="height:36px;width:auto;border:0;" /></div>`
    : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
</head>
<body style="margin:0;padding:0;background:${d.emailBackground};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${d.emailBackground};">
<tr><td align="center" style="padding:${d.outerPadding}px;">
<table role="presentation" width="${d.contentWidth}" cellpadding="0" cellspacing="0" style="width:${d.contentWidth}px;max-width:100%;background:${d.contentBackground};border-radius:${d.borderRadius}px;overflow:hidden;">
<tr><td dir="rtl" style="padding:${d.innerPadding}px;text-align:${d.contentAlign};font-family:${fontStack(
    d.fontFamily
  )};font-size:${d.fontSize}px;color:${d.textColor};">
${header}
${body}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

// Replace {token} occurrences in a string with provided values.
// Unknown tokens are left untouched (helps debugging).
export function substituteTags(input: string, vars: Record<string, string | number | undefined>): string {
  let out = input;
  for (const [token, val] of Object.entries(vars)) {
    if (val === undefined) continue;
    out = out.split(`{${token}}`).join(esc(val));
  }
  return out;
}
