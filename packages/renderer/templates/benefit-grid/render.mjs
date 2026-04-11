/**
 * LMNT "Benefit Grid" template — dark bg, bold headline, colored benefit strip, product hero
 * Reference: AdExamples-kb/04_benefit-grid-hydration-system.jpg
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');
import { writeFileSync, mkdirSync } from 'fs';

const W = 1080;
const H = 1080;
const HEAD_FONT = 'Montserrat, Helvetica Neue, Arial, sans-serif';
const BODY_FONT = 'Source Sans Pro, Helvetica, Arial, sans-serif';
const ACCENT = '#E8722A';
const LOGO_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png';

const ads = [
  {
    id: 'grid-01-epic-axis-system',
    product: '/mnt/raid/Data/tmp/openclaw-builds/epic-axis-kit-product.jpg',
    headline: 'THE COMPLETE WAHOO SYSTEM',
    benefits: ['Stainless\nSteel', 'Pre-\nRigged', '480lb\nCable', 'UV\nSkirts', '32oz\nWeight'],
  },
  {
    id: 'grid-02-jagahoo-system',
    product: '/mnt/raid/Data/tmp/openclaw-builds/jagahoo-purple.jpg',
    headline: 'THE COMPLETE JAGAHOO KIT',
    benefits: ['3 Wahoo\nColors', '480lb\nCable', '250lb\nLeader', '16/24oz\nWeight', 'Clip On\n& Go'],
  },
  {
    id: 'grid-03-chugger-system',
    product: '/mnt/raid/Data/tmp/openclaw-builds/chugger-table.png',
    headline: 'THE OFFSHORE CHUGGER SYSTEM',
    benefits: ['Dual\nHeads', '8\nColors', '150lb\nLeader', '8/0\nMustad', '$29.99\nRigged'],
  },
  {
    id: 'grid-04-spread-builder',
    product: '/mnt/raid/Data/tmp/openclaw-builds/epic-axis-kit-product.jpg',
    headline: 'BUILD YOUR WAHOO SPREAD',
    benefits: ['Lure\nKit', 'Cable\nRig', 'Shock\nLeader', 'Trolling\nWeight', 'Ready\nTo Fish'],
  },
];

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildOverlay(ad) {
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // ── Headline — bold white uppercase, auto-size for long headlines ──
  const headSize = ad.headline.length > 25 ? 52 : 64;
  svg += `<text x="${W/2}" y="100" text-anchor="middle" fill="white"
          font-size="${headSize}" font-family="${HEAD_FONT}" font-weight="900" letter-spacing="1">${esc(ad.headline)}</text>`;

  // ── Benefit strip — orange bar with 5 columns ──
  const stripY = 140;
  const stripH = 80;
  const stripPad = 40;
  const stripW = W - stripPad * 2;
  const colW = stripW / ad.benefits.length;

  // Orange background bar
  svg += `<rect x="${stripPad}" y="${stripY}" width="${stripW}" height="${stripH}" rx="6" fill="${ACCENT}"/>`;

  // Benefit text columns
  for (let i = 0; i < ad.benefits.length; i++) {
    const cx = stripPad + (i * colW) + colW / 2;
    const lines = ad.benefits[i].split('\n');

    if (lines.length === 1) {
      svg += `<text x="${cx}" y="${stripY + stripH/2 + 7}" text-anchor="middle" fill="white"
              font-size="18" font-family="${HEAD_FONT}" font-weight="700">${esc(lines[0])}</text>`;
    } else {
      svg += `<text x="${cx}" y="${stripY + stripH/2 - 6}" text-anchor="middle" fill="white"
              font-size="18" font-family="${HEAD_FONT}" font-weight="700">${esc(lines[0])}</text>`;
      svg += `<text x="${cx}" y="${stripY + stripH/2 + 18}" text-anchor="middle" fill="white"
              font-size="18" font-family="${HEAD_FONT}" font-weight="700">${esc(lines[1])}</text>`;
    }

    // Divider line (not after last)
    if (i < ad.benefits.length - 1) {
      const dx = stripPad + ((i + 1) * colW);
      svg += `<line x1="${dx}" y1="${stripY + 15}" x2="${dx}" y2="${stripY + stripH - 15}" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>`;
    }
  }

  // ── URL bottom center ──
  svg += `<text x="${W/2}" y="${H - 30}" text-anchor="middle" fill="rgba(255,255,255,0.4)"
          font-size="12" font-family="${BODY_FONT}" font-weight="400" letter-spacing="1">thetackleroom.com</text>`;

  svg += '</svg>';
  return Buffer.from(svg);
}

async function removeWhiteBg(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixels = Buffer.from(data);
  const total = width * height;
  const threshold = 245;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const minCh = (k) => { const i = k * channels; return Math.min(pixels[i], pixels[i+1], pixels[i+2]); };
  const isWhite = (k) => minCh(k) >= threshold;
  const seed = (sx, sy) => { const k = sy * width + sx; if (!visited[k] && isWhite(k)) { visited[k] = 1; queue[tail++] = k; } };
  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seed(0, y); seed(width - 1, y); }
  while (head < tail) {
    const k = queue[head++];
    pixels[k * channels + 3] = 0;
    const cx = k % width, cy = (k - cx) / width;
    if (cx > 0) seed(cx-1, cy); if (cx < width-1) seed(cx+1, cy);
    if (cy > 0) seed(cx, cy-1); if (cy < height-1) seed(cx, cy+1);
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

async function renderAd(ad, logoBuf, logoMeta) {
  const base = sharp({ create: { width: W, height: H, channels: 4, background: { r: 28, g: 28, b: 28, alpha: 255 } } });

  // Product — remove white bg, resize large, center below the strip
  const productRaw = await sharp(ad.product).png().toBuffer();
  const productNoBg = await removeWhiteBg(productRaw);
  const productTrimmed = await sharp(productNoBg).trim().ensureAlpha().png().toBuffer();
  const productResized = await sharp(productTrimmed)
    .resize({ width: 650, height: 650, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().png().toBuffer();
  const pm = await sharp(productResized).metadata();
  const px = Math.round((W - pm.width) / 2);
  const py = 260 + Math.round((700 - pm.height) / 2); // Center in the space below strip

  // Subtle glow behind product
  const glowSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g" cx="50%" cy="55%" r="30%">
      <stop offset="0%" stop-color="rgba(232,114,42,0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient></defs>
    <circle cx="${W/2}" cy="${H/2 + 60}" r="350" fill="url(#g)"/>
  </svg>`);

  const overlay = buildOverlay(ad);
  const composites = [
    { input: glowSvg, left: 0, top: 0 },
    { input: productResized, left: px, top: py },
    { input: overlay, left: 0, top: 0 },
  ];
  if (logoBuf) composites.push({ input: logoBuf, left: 50, top: H - 90 });

  return base.composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  console.log(`Rendering ${ads.length} benefit grid ads...`);
  let logoBuf = null, logoMeta = null;
  try {
    const logoRaw = await sharp(LOGO_PATH).ensureAlpha().png().toBuffer();
    const logoNoBg = await removeWhiteBg(logoRaw);
    // For dark bg, negate the logo to make it white
    logoBuf = await sharp(logoNoBg).trim().negate({ alpha: false })
      .resize({ width: 160, height: 55, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().png().toBuffer();
    logoMeta = await sharp(logoBuf).metadata();
  } catch (e) { console.log('Logo:', e.message); }

  const outDir = '/mnt/raid/Data/tmp/openclaw-builds/ad-batch-grids';
  mkdirSync(outDir, { recursive: true });

  for (const ad of ads) {
    const t0 = Date.now();
    const buf = await renderAd(ad, logoBuf, logoMeta);
    writeFileSync(`${outDir}/${ad.id}.png`, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
