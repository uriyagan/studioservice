// Allowlist HTML sanitizer for admin-authored email content (the email
// builder's rich-text blocks + the "html" block). Runs both server-side (real
// sends, in the Cloudflare Worker) and client-side (the builder preview /
// dangerouslySetInnerHTML) — so it is pure JS with no DOM dependency.
//
// It PRESERVES what the inline editor produces — bold / italic / underline,
// links, colors, spans with style, merge tags ({token} is plain text) — and
// STRIPS scripts, iframes/objects, event handlers (on*), javascript:/vbscript:/
// data: URLs, and url()/expression() inside style. Tags outside the allowlist
// are removed but their text content is kept.
//
// Strategy: (1) drop dangerous elements WITH their content; (2) replace every
// well-formed tag with a placeholder holding its sanitized form (or nothing);
// (3) escape any leftover angle brackets so a malformed/stray "<" can never be
// re-parsed as a tag; (4) restore the placeholders.

const ALLOWED_TAGS = new Set([
  "a", "b", "strong", "i", "em", "u", "s", "strike", "del", "ins", "mark",
  "span", "p", "div", "br", "font", "small", "sub", "sup", "blockquote",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
]);

// Per-tag allowed attributes. Any tag not listed here allows `style` only.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel", "style"]),
  font: new Set(["color", "face", "style"]),
  td: new Set(["style", "colspan", "rowspan", "align", "valign", "width"]),
  th: new Set(["style", "colspan", "rowspan", "align", "valign", "width"]),
  table: new Set(["style", "width", "align", "cellpadding", "cellspacing", "border"]),
};
const DEFAULT_ATTRS = new Set(["style"]);

// Elements removed together with their content (the content is code/markup we
// never want). `|$` also kills an unclosed opener (e.g. a truncated <script).
const DROP_WITH_CONTENT = [
  "script", "style", "iframe", "object", "embed", "noscript", "template",
  "svg", "math", "form", "input", "button", "textarea", "select", "option",
  "link", "meta", "base", "head", "title", "frame", "frameset", "applet",
];

const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;

// Placeholder marker (NUL), derived at runtime so no control char sits in the
// source. Any NUL in the input is stripped first, so markers can't be forged.
const NUL = String.fromCharCode(0);
const PLACEHOLDER_RE = new RegExp(NUL + "(\\d+)" + NUL, "g");

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&(lt|gt|amp|quot|apos|colon|tab|newline|sol);/gi, (m, n) => {
      const map: Record<string, string> = {
        lt: "<", gt: ">", amp: "&", quot: '"', apos: "'",
        colon: ":", tab: "\t", newline: "\n", sol: "/",
      };
      return map[n.toLowerCase()] ?? m;
    });
}
function safeFromCodePoint(n: number): string {
  try {
    return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

function escAttr(v: string): string {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Strip whitespace + control characters (code point <= 0x20 or 0x7F) so a
// scheme can't hide behind tabs/newlines/NULs.
function stripControl(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c > 0x20 && c !== 0x7f) out += ch;
  }
  return out;
}

// Reveal a URL's scheme past entity/whitespace/control-char obfuscation and
// reject dangerous ones. Relative URLs and merge tags ({token}) have no scheme
// and pass through.
function safeUrl(url: string): string | null {
  const decoded = stripControl(decodeEntities(url));
  const scheme = (decoded.match(/^([a-z][a-z0-9+.-]*):/i) || [])[1];
  if (scheme && /^(javascript|vbscript|data|file|blob)$/i.test(scheme)) return null;
  return url.trim();
}

// Keep a style attribute but drop any declaration carrying an active-content
// vector (url(), expression(), @import, behavior:, or a script scheme).
function sanitizeStyle(style: string): string {
  const decoded = decodeEntities(style);
  const bad = /url\s*\(|expression\s*\(|javascript\s*:|vbscript\s*:|@import|behavior\s*:|-moz-binding/i;
  return decoded
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d && !bad.test(d))
    .join("; ");
}

function sanitizeAttrs(tag: string, attrsStr: string): string {
  const allowed = ALLOWED_ATTRS[tag] ?? DEFAULT_ATTRS;
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrsStr))) {
    const name = m[1].toLowerCase();
    let val = m[2] ?? "";
    if (val && (val[0] === '"' || val[0] === "'")) val = val.slice(1, -1);

    if (name.startsWith("on")) continue; // never allow event handlers
    if (!allowed.has(name)) continue;

    if (name === "href" || name === "src") {
      const safe = safeUrl(val);
      if (safe === null) continue;
      out += ` ${name}="${escAttr(safe)}"`;
    } else if (name === "style") {
      const safe = sanitizeStyle(val);
      if (safe) out += ` style="${escAttr(safe)}"`;
    } else if (name === "target") {
      // Force noopener when a link opens a new tab.
      out += ` target="${escAttr(val)}" rel="noopener noreferrer"`;
    } else {
      out += ` ${name}="${escAttr(val)}"`;
    }
  }
  return out;
}

function stripDangerousBlocks(html: string): string {
  let out = html;
  for (const tag of DROP_WITH_CONTENT) {
    out = out.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}\\s*>|$)`, "gi"), "");
  }
  return out.replace(/<!--[\s\S]*?-->/g, "").replace(/<![\s\S]*?>/g, "");
}

export function sanitizeEmailHtml(input: unknown): string {
  // Remove any NUL from the input so the placeholder marker can't be forged.
  let html = stripDangerousBlocks(String(input ?? "").split(NUL).join(""));

  const placeholders: string[] = [];
  html = html.replace(TAG_RE, (_m, slash: string, name: string, attrs: string) => {
    const tag = name.toLowerCase();
    let safe = "";
    if (ALLOWED_TAGS.has(tag)) {
      safe = slash ? `</${tag}>` : `<${tag}${sanitizeAttrs(tag, attrs)}>`;
    }
    const idx = placeholders.push(safe) - 1;
    return NUL + idx + NUL;
  });

  // Neutralize any leftover angle brackets (malformed/partial tags) so nothing
  // survives to be parsed as HTML. `&` is left alone to avoid double-encoding
  // legitimate entities the admin typed.
  html = html.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return html.replace(PLACEHOLDER_RE, (_, i: string) => placeholders[Number(i)] ?? "");
}

// Escape plain text for safe interpolation into HTML.
export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Build safe HTML for a user-typed message + user-provided links, for the
// {message} merge tag in notification emails. The text is fully escaped (no
// HTML the user typed survives as markup), newlines become <br>, and each link
// is scheme-validated and escaped.
export function safeMessageHtml(message: string, links: string[] = []): string {
  const text = escapeHtml(message).replace(/\n/g, "<br>");
  const safeLinks = (links ?? [])
    .map((l) => {
      const href = safeUrl(String(l));
      return href ? `<a href="${escAttr(href)}">${escapeHtml(l)}</a>` : "";
    })
    .filter(Boolean);
  const linksHtml = safeLinks.length ? `<br><br>לינקים:<br>${safeLinks.join("<br>")}` : "";
  return text + linksHtml;
}
