import type { EmailBlock } from "@/lib/email/types";

export const BLOCK_PALETTE: { type: EmailBlock["type"]; label: string }[] = [
  { type: "heading", label: "כותרת" },
  { type: "text", label: "טקסט" },
  { type: "image", label: "תמונה" },
  { type: "button", label: "כפתור" },
  { type: "video", label: "וידאו" },
  { type: "columns", label: "עמודות" },
  { type: "social", label: "סושיאל" },
  { type: "divider", label: "קו מפריד" },
  { type: "spacer", label: "רווח" },
  { type: "html", label: "HTML" },
  { type: "footer", label: "פוטר" },
];

export const SOCIAL_NETWORKS = [
  { v: "facebook", l: "פייסבוק" },
  { v: "instagram", l: "אינסטגרם" },
  { v: "whatsapp", l: "וואטסאפ" },
  { v: "tiktok", l: "טיקטוק" },
  { v: "youtube", l: "יוטיוב" },
  { v: "x", l: "X / טוויטר" },
  { v: "website", l: "אתר" },
  { v: "email", l: "אימייל" },
  { v: "phone", l: "טלפון" },
];

export const ALIGN_OPTS = [
  { v: "right", l: "ימין" },
  { v: "center", l: "מרכז" },
  { v: "left", l: "שמאל" },
];

export function blockLabel(type: EmailBlock["type"]): string {
  return BLOCK_PALETTE.find((p) => p.type === type)?.label ?? type;
}

export function newBlock(type: EmailBlock["type"]): EmailBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "heading":
      return { id, type, text: "שלום {client_name},", level: "h2", align: "right" };
    case "text":
      return { id, type, text: "תוכן ההודעה כאן.", align: "right", size: "15" };
    case "image":
      return { id, type, src: "", alt: "", width: "100", align: "center", href: "" };
    case "button":
      return { id, type, text: "מעבר לפורטל", href: "{portal_url}", bg: "#111111", color: "#ffffff", align: "center", radius: "6", fontSize: "16" };
    case "divider":
      return { id, type, color: "#e5e7eb" };
    case "spacer":
      return { id, type, height: "24" };
    case "footer":
      return { id, type, text: "© Uriya Ganor Studio", align: "center", color: "#9ca3af" };
    case "columns":
      return { id, type, count: 2, columns: [{ blocks: [] }, { blocks: [] }] };
    case "social":
      return { id, type, align: "center", color: "#111111", iconSize: "28", gap: "10", networks: [{ type: "instagram", url: "" }, { type: "website", url: "" }] };
    case "html":
      return { id, type, html: "<p>HTML מותאם אישית</p>" };
    case "video":
      return { id, type, url: "", align: "center" };
    default:
      return { id, type };
  }
}

export function defaultTemplate(): EmailBlock[] {
  return [newBlock("heading"), newBlock("text"), newBlock("footer")];
}

/* ===================== nested-tree model (paths) ===================== */
export type Loc =
  | { t: "top"; i: number }
  | { t: "col"; b: number; c: number; i: number };

export function eqLoc(a: Loc | null, b: Loc): boolean {
  if (!a || a.t !== b.t) return false;
  if (a.t === "top" && b.t === "top") return a.i === b.i;
  if (a.t === "col" && b.t === "col") return a.b === b.b && a.c === b.c && a.i === b.i;
  return false;
}

function clone(blocks: EmailBlock[]): EmailBlock[] {
  return JSON.parse(JSON.stringify(blocks));
}

function reId(b: EmailBlock): EmailBlock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nb: any = { ...b, id: crypto.randomUUID() };
  if (nb.type === "columns" && Array.isArray(nb.columns)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nb.columns = nb.columns.map((col: any) => ({ blocks: (col?.blocks ?? []).map(reId) }));
  }
  return nb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function colChildren(tree: EmailBlock[], b: number, c: number): EmailBlock[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cb = tree[b] as any;
  if (!cb || cb.type !== "columns") return [];
  cb.columns = cb.columns ?? [];
  cb.columns[c] = cb.columns[c] ?? { blocks: [] };
  cb.columns[c].blocks = cb.columns[c].blocks ?? [];
  return cb.columns[c].blocks;
}

export function getBlockAt(blocks: EmailBlock[], loc: Loc | null): EmailBlock | null {
  if (!loc) return null;
  if (loc.t === "top") return blocks[loc.i] ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cb = blocks[loc.b] as any;
  if (!cb || cb.type !== "columns") return null;
  return cb.columns?.[loc.c]?.blocks?.[loc.i] ?? null;
}

export function updateBlockAt(blocks: EmailBlock[], loc: Loc, patch: Partial<EmailBlock>): EmailBlock[] {
  const tree = clone(blocks);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref: any = loc.t === "top" ? tree[loc.i] : colChildren(tree, loc.b, loc.c)[loc.i];
  if (ref) Object.assign(ref, patch);
  return tree;
}

export function removeBlockAt(blocks: EmailBlock[], loc: Loc): { blocks: EmailBlock[]; removed: EmailBlock | null } {
  const tree = clone(blocks);
  let removed: EmailBlock | null = null;
  if (loc.t === "top") removed = tree.splice(loc.i, 1)[0] ?? null;
  else removed = colChildren(tree, loc.b, loc.c).splice(loc.i, 1)[0] ?? null;
  return { blocks: tree, removed };
}

export function insertBlockAt(blocks: EmailBlock[], target: Loc, block: EmailBlock): { blocks: EmailBlock[]; loc: Loc } {
  const tree = clone(blocks);
  if (target.t === "top") {
    tree.splice(target.i, 0, block);
    return { blocks: tree, loc: { t: "top", i: target.i } };
  }
  colChildren(tree, target.b, target.c).splice(target.i, 0, block);
  return { blocks: tree, loc: { t: "col", b: target.b, c: target.c, i: target.i } };
}

export function duplicateBlockAt(blocks: EmailBlock[], loc: Loc): { blocks: EmailBlock[]; loc: Loc } {
  const orig = getBlockAt(blocks, loc);
  if (!orig) return { blocks, loc };
  const copy = reId(JSON.parse(JSON.stringify(orig)));
  return insertBlockAt(blocks, { ...loc, i: loc.i + 1 } as Loc, copy);
}

export function nudgeBlock(blocks: EmailBlock[], loc: Loc, dir: -1 | 1): { blocks: EmailBlock[]; loc: Loc } {
  const tree = clone(blocks);
  const arr = loc.t === "top" ? tree : colChildren(tree, loc.b, loc.c);
  const j = loc.i + dir;
  if (j < 0 || j >= arr.length) return { blocks, loc };
  [arr[loc.i], arr[j]] = [arr[j], arr[loc.i]];
  return { blocks: tree, loc: { ...loc, i: j } as Loc };
}

export function moveBlock(blocks: EmailBlock[], src: Loc, target: Loc): { blocks: EmailBlock[]; loc: Loc } {
  const moving = getBlockAt(blocks, src);
  if (!moving) return { blocks, loc: src };
  if (target.t === "col" && moving.type === "columns") return { blocks, loc: src };
  if (src.t === "top" && target.t === "col" && target.b === src.i) return { blocks, loc: src };

  const { blocks: afterRemove, removed } = removeBlockAt(blocks, src);
  if (!removed) return { blocks, loc: src };

  let t: Loc;
  if (target.t === "top") {
    let i = target.i;
    if (src.t === "top" && src.i < target.i) i -= 1;
    t = { t: "top", i };
  } else {
    let b = target.b;
    if (src.t === "top" && src.i < target.b) b -= 1;
    let i = target.i;
    if (src.t === "col" && src.b === target.b && src.c === target.c && src.i < target.i) i -= 1;
    t = { t: "col", b, c: target.c, i };
  }
  return insertBlockAt(afterRemove, t, removed);
}

/* ---- drag/drop id encoding ---- */
export function zoneId(loc: Loc): string {
  return loc.t === "top" ? `z:t:${loc.i}` : `z:c:${loc.b}:${loc.c}:${loc.i}`;
}
export function dragId(loc: Loc): string {
  return loc.t === "top" ? `d:t:${loc.i}` : `d:c:${loc.b}:${loc.c}:${loc.i}`;
}
export function parseZone(id: string): Loc | null {
  const p = id.split(":");
  if (p[0] !== "z") return null;
  if (p[1] === "t") return { t: "top", i: Number(p[2]) };
  if (p[1] === "c") return { t: "col", b: Number(p[2]), c: Number(p[3]), i: Number(p[4]) };
  return null;
}
export function parseDrag(id: string): { kind: "new"; type: EmailBlock["type"] } | { kind: "move"; loc: Loc } | null {
  if (id.startsWith("n:")) return { kind: "new", type: id.slice(2) as EmailBlock["type"] };
  const p = id.split(":");
  if (p[0] !== "d") return null;
  if (p[1] === "t") return { kind: "move", loc: { t: "top", i: Number(p[2]) } };
  if (p[1] === "c") return { kind: "move", loc: { t: "col", b: Number(p[2]), c: Number(p[3]), i: Number(p[4]) } };
  return null;
}
