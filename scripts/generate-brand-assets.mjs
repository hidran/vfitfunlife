#!/usr/bin/env node
/**
 * Regenerates every app icon / favicon / splash from the brand mark in
 * resources/brand/vfit-mark.svg (the gradient double "V" of the landing BrandMark).
 *
 * Usage: node scripts/generate-brand-assets.mjs
 *
 * Outputs are committed (this is not part of the build):
 *   public/icon.svg, public/favicon.ico, public/icons/*      (web / PWA / web push)
 *   resources/icon.png, resources/splash.png                 (sources for @capacitor/assets)
 *   ios/App/App/Assets.xcassets/{AppIcon,Splash}             (native iOS)
 *   android/app/src/main/res/{mipmap-*,drawable*}            (native Android)
 *
 * Icons use a white tile (as on the landing page); splashes use the app background
 * #1A1D29 (capacitor.config.ts SplashScreen.backgroundColor). Web icon file names are new
 * on purpose: firebase.json serves *.png as `immutable`, so reusing the old names would
 * leave browsers on the old placeholder artwork for a year.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const r = (...p) => path.join(root, ...p);

const MARK_SVG = fs.readFileSync(r('resources/brand/vfit-mark.svg'), 'utf8');
const WHITE = '#FFFFFF';
const APP_BG = '#1A1D29';

/** The mark rendered to `size` px on a transparent background. */
function mark(size) {
  return sharp(Buffer.from(MARK_SVG), { density: Math.max(72, Math.ceil((size / 80) * 72 * 2)) })
    .resize(size, size)
    .png()
    .toBuffer();
}

/** White-mark variant for monochrome notification badges (Android uses only the alpha). */
function monoMark(size) {
  const svg = MARK_SVG.replace(/url\(#g\)/g, '#FFFFFF').replace(/opacity="0\.58"/, 'opacity="0.7"');
  return sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil((size / 80) * 72 * 2)) })
    .resize(size, size)
    .png()
    .toBuffer();
}

/**
 * Square canvas `size` with the mark scaled to `scale` of it, centred.
 * `shape`: 'square' (full bleed), 'rounded' (22% radius, transparent corners), 'circle'.
 */
async function icon(size, { scale = 0.78, background = WHITE, shape = 'square' } = {}) {
  const inner = Math.round(size * scale);
  const offset = Math.round((size - inner) / 2);
  const base = sharp({
    create: { width: size, height: size, channels: 4, background: shape === 'square' ? background : '#00000000' },
  });
  const layers = [];
  if (shape !== 'square') {
    const rx = shape === 'circle' ? size / 2 : Math.round(size * 0.22);
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${background}"/></svg>`
      ),
    });
  }
  layers.push({ input: await mark(inner), left: offset, top: offset });
  return base.composite(layers).png();
}

async function write(file, pipeline, { opaque = false } = {}) {
  const abs = r(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  // iOS rejects app icons with an alpha channel.
  const p = opaque ? pipeline.flatten({ background: WHITE }).removeAlpha() : pipeline;
  await p.png({ compressionLevel: 9 }).toFile(abs);
  const { width, height } = await sharp(abs).metadata();
  console.log(`${file}  ${width}x${height}`);
}

/** ICO container with PNG-encoded entries (supported by every current browser). */
async function writeIco(file, sizes) {
  const images = await Promise.all(sizes.map(async (s) => (await icon(s, { shape: 'rounded', scale: 0.84 })).toBuffer()));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((img, i) => {
    const s = sizes[i];
    dir.writeUInt8(s >= 256 ? 0 : s, i * 16);
    dir.writeUInt8(s >= 256 ? 0 : s, i * 16 + 1);
    dir.writeUInt8(0, i * 16 + 2);
    dir.writeUInt8(0, i * 16 + 3);
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(img.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += img.length;
  });
  fs.writeFileSync(r(file), Buffer.concat([header, dir, ...images]));
  console.log(`${file}  ${sizes.join('/')}`);
}

async function splash(width, height) {
  const inner = Math.round(Math.min(width, height) * 0.22);
  return sharp({ create: { width, height, channels: 4, background: APP_BG } })
    .composite([{ input: await mark(inner), left: Math.round((width - inner) / 2), top: Math.round((height - inner) / 2) }])
    .flatten({ background: APP_BG })
    .removeAlpha()
    .png();
}

// ---- web / PWA ---------------------------------------------------------------------------
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="${WHITE}"/><g transform="translate(6.4 6.4) scale(0.84)">${MARK_SVG.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<!--[\s\S]*?-->/g, '').trim()}</g></svg>\n`;
fs.writeFileSync(r('public/icon.svg'), svgIcon);
console.log('public/icon.svg');
await writeIco('public/favicon.ico', [16, 32, 48]);
await write('public/icons/favicon-32.png', await icon(32, { shape: 'rounded', scale: 0.84 }));
await write('public/icons/app-icon-192.png', await icon(192, { shape: 'rounded' }));
await write('public/icons/app-icon-512.png', await icon(512, { shape: 'rounded' }));
// Maskable: full bleed, mark inside the 80% safe zone.
await write('public/icons/app-icon-maskable-192.png', await icon(192, { scale: 0.6 }));
await write('public/icons/app-icon-maskable-512.png', await icon(512, { scale: 0.6 }));
// iOS rounds the corners itself and shows transparency as black.
await write('public/icons/apple-touch-icon.png', await icon(180, { scale: 0.74 }), { opaque: true });
await write('public/icons/badge-72.png', sharp(await monoMark(72)));

// ---- Capacitor sources -------------------------------------------------------------------
await write('resources/icon.png', await icon(1024, { scale: 0.74 }), { opaque: true });
await write('resources/splash.png', await splash(2732, 2732));

// ---- iOS ---------------------------------------------------------------------------------
await write('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', await icon(1024, { scale: 0.74 }), { opaque: true });
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await write(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, await splash(2732, 2732));
}

// ---- Android -----------------------------------------------------------------------------
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  await write(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, await icon(legacy, { shape: 'rounded', scale: 0.8 }));
  await write(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, await icon(legacy, { shape: 'circle', scale: 0.72 }));
  // Adaptive foreground: 108dp canvas, launcher masks to the central 66dp.
  const fg = Math.round(108 * k);
  await write(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, await icon(fg, { background: '#00000000', scale: 0.5 }));
}
const resDir = r('android/app/src/main/res');
for (const dir of fs.readdirSync(resDir).filter((d) => d.startsWith('drawable'))) {
  const file = path.join(resDir, dir, 'splash.png');
  if (!fs.existsSync(file)) continue;
  const { width, height } = await sharp(file).metadata();
  await write(path.relative(root, file), await splash(width, height));
}
