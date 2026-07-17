/**
 * Regenerates the app icons from `app/icon.svg` (the studio's FAV asset).
 *
 *   node scripts/gen-icons.js
 *
 * Browser/OS icons, consumed by the App Router file conventions — Next emits the
 * <link> tags itself, so nothing in layout.tsx references them:
 *
 *   app/icon.svg        source of truth, edited by hand (modern browsers)
 *   app/favicon.ico     16/32/48 — Safari + older browsers, which reject SVG favicons
 *   app/apple-icon.png  180x180 — iOS home screen
 *
 * PWA icons, referenced by URL from app/manifest.ts:
 *
 *   public/icon-192.png           install prompt / Android launcher
 *   public/icon-512.png           splash screen, high-DPI launchers
 *   public/icon-maskable-512.png  Android adaptive icon (see maskableSvg below)
 *
 * All of these are committed binaries; they do NOT track icon.svg on their own.
 * Re-run this whenever the brand asset changes.
 *
 * `sharp` is not a direct dependency — it ships transitively with Next. If that ever
 * stops being true, `npm i -D sharp` and re-run.
 */
const fs = require('fs');
const path = require('path');

let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('Missing `sharp`. It normally ships with Next; run `npm i -D sharp` and retry.');
  process.exit(1);
}

const APP = path.join(__dirname, '..', 'app');
const PUBLIC = path.join(__dirname, '..', 'public');
const SRC = path.join(APP, 'icon.svg');

// How much of a maskable icon is guaranteed visible: a centred circle of 80%
// diameter. https://w3c.github.io/manifest/#icon-masks
const SAFE_ZONE = 0.8;

/** Rasterise the SVG at `size`, optionally flattening onto an opaque background. */
const png = (svg, size, bg) => {
  let s = sharp(svg, { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (bg) s = s.flatten({ background: bg });
  return s.png({ compressionLevel: 9 }).toBuffer();
};

/**
 * Rewrite the source icon into a maskable variant.
 *
 * Android crops an adaptive icon to a shape it picks (circle, squircle, teardrop)
 * and the app has no say in which. Feeding it the source icon — a disc on a
 * transparent square — means the crop bites into the disc and the corners show
 * through as gaps. A maskable icon instead bleeds its background to all four
 * edges and keeps the glyph inside the safe zone, so every mask shape comes out
 * looking deliberate.
 *
 * Two edits, both derived from the viewBox so they survive an icon redraw:
 *   - the background disc becomes a full-bleed rect
 *   - the glyph is scaled to SAFE_ZONE about the centre
 *
 * On the scale: at full size the "U" reaches r≈74 in a 190 box, just inside the
 * safe circle's r=76 — legal, but it would sit almost against the mask edge and
 * lose the ring of black the brand icon has around it. Scaling by the safe-zone
 * factor reproduces the source icon's proportions exactly under a circle mask.
 */
function maskableSvg(src) {
  let s = src.toString();

  const box = s.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!box) throw new Error('icon.svg: no viewBox="0 0 W H" to derive the canvas from');
  const [w, h] = [Number(box[1]), Number(box[2])];

  if (!/<circle\b[^>]*\/>/.test(s))
    throw new Error('icon.svg: expected a <circle> background to swap for a full-bleed rect');
  s = s.replace(/<circle\b[^>]*\/>/, `<rect width="${w}" height="${h}" fill="#000"/>`);

  if (!/<path\b[^>]*\/>/.test(s)) throw new Error('icon.svg: expected a <path> glyph to inset');
  const [cx, cy] = [w / 2, h / 2];
  s = s.replace(
    /<path\b[^>]*\/>/,
    (glyph) =>
      `<g transform="translate(${cx} ${cy}) scale(${SAFE_ZONE}) translate(${-cx} ${-cy})">${glyph}</g>`
  );

  return Buffer.from(s);
}

/**
 * Build a multi-size .ico around PNG payloads — sharp can't write ICO itself.
 * Layout: ICONDIR header, then one 16-byte ICONDIRENTRY per image, then the PNGs.
 * PNG-in-ICO is understood by every browser we care about.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;

  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 0); // width (0 means 256)
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1); // height
    dir.writeUInt8(0, o + 2); // palette size
    dir.writeUInt8(0, o + 3); // reserved
    dir.writeUInt16LE(1, o + 4); // colour planes
    dir.writeUInt16LE(32, o + 6); // bits per pixel
    dir.writeUInt32LE(e.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.data.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)]);
}

(async () => {
  const svg = fs.readFileSync(SRC);

  const sizes = [16, 32, 48];
  const bufs = await Promise.all(sizes.map((s) => png(svg, s)));
  const ico = buildIco(sizes.map((size, i) => ({ size, data: bufs[i] })));
  fs.writeFileSync(path.join(APP, 'favicon.ico'), ico);
  console.log(`app/favicon.ico   ${ico.length} bytes (${sizes.join('/')})`);

  // iOS ignores alpha and paints transparency black, so flatten onto the brand
  // black deliberately rather than leaving the corners to chance.
  const apple = await png(svg, 180, { r: 0, g: 0, b: 0 });
  fs.writeFileSync(path.join(APP, 'apple-icon.png'), apple);
  console.log(`app/apple-icon.png ${apple.length} bytes (180x180)`);

  // PWA icons. 192 and 512 are what Chrome wants for the install prompt and the
  // splash screen; both are flattened because a launcher icon with holes in it
  // renders against whatever the launcher's wallpaper happens to be.
  const black = { r: 0, g: 0, b: 0 };
  for (const size of [192, 512]) {
    const buf = await png(svg, size, black);
    fs.writeFileSync(path.join(PUBLIC, `icon-${size}.png`), buf);
    console.log(`public/icon-${size}.png ${buf.length} bytes (${size}x${size})`);
  }

  const maskable = await png(maskableSvg(svg), 512, black);
  fs.writeFileSync(path.join(PUBLIC, 'icon-maskable-512.png'), maskable);
  console.log(`public/icon-maskable-512.png ${maskable.length} bytes (512x512)`);
})();
