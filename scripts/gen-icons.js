/**
 * Regenerates the app icons from `app/icon.svg` (the studio's FAV asset).
 *
 *   node scripts/gen-icons.js
 *
 * Outputs, all consumed by the App Router icon file conventions — Next emits the
 * <link> tags itself, so nothing in layout.tsx references them:
 *
 *   app/icon.svg        source of truth, edited by hand (modern browsers)
 *   app/favicon.ico     16/32/48 — Safari + older browsers, which reject SVG favicons
 *   app/apple-icon.png  180x180 — iOS home screen
 *
 * The .ico and .png are committed binaries; they do NOT track icon.svg on their own.
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
const SRC = path.join(APP, 'icon.svg');

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
})();
