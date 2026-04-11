/**
 * LMNT "Contrarian Hook" template — dark bg, massive headline, accent block
 * Reference: AdExamples-kb/08_contrarian-hook-sports-drink-lying.jpg
 *
 * Layout:
 * - Dark charcoal background
 * - MASSIVE white headline, left-aligned, stacked (2-3 words per line)
 * - Product image lower-right, partially overlapping an accent color block
 * - Brand logo + tagline bottom-left
 * - Orange accent block (diagonal/angular) on right side
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');
import { writeFileSync, mkdirSync } from 'fs';

const W = 1080;
const H = 1080;

// ── Colors ──
const BG_COLOR = '#1E1E1E';
const HEADLINE_COLOR = '#FFFFFF';
const ACCENT_COLOR = '#E8722A';       // TackleRoom orange
const TAGLINE_COLOR = 'rgba(255,255,255,0.6)';
const HEAD_FONT = 'Montserrat, Helvetica Neue, Arial, sans-serif';
const BODY_FONT = 'Source Sans Pro, Helvetica, Arial, sans-serif';
const LOGO_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png';

// ── Ad variants ──
const ads = [
  {
    id: 'hook-01-wahoo-rigs',
    product: '/mnt/raid/Data/tmp/openclaw-builds/epic-axis-kit-product.jpg',
    lines: ['The guys', 'catching', 'wahoo aren\u2019t', 'building', 'their own', 'rigs.'],
    tagline: 'Pre-Rigged Wahoo Lure Kits',
  },
  {
    id: 'hook-02-hardware-failing',
    product: '/mnt/raid/Data/tmp/openclaw-builds/epic-axis-kit-product.jpg',
    lines: ['Your', 'wahoo rig', 'is failing', 'you.'],
    tagline: 'Stainless Steel. 480lb Cable. Rigged.',
  },
  {
    id: 'hook-03-stop-rigging',
    product: '/mnt/raid/Data/tmp/openclaw-builds/jagahoo-purple.jpg',
    lines: ['Stop', 'rigging', 'in the', 'dark.'],
    tagline: 'Jagahoo Wahoo Kit — Clip On & Go',
  },
  {
    id: 'hook-04-chugger-record',
    product: '/mnt/raid/Data/tmp/openclaw-builds/chugger-blue.jpg',
    lines: ['A chugger', 'caught the', 'world', 'record.'],
    tagline: 'Billfish Bait Chugger — $29.99',
  },
];

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    if (cx > 0) seed(cx - 1, cy); if (cx < width - 1) seed(cx + 1, cy);
    if (cy > 0) seed(cx, cy - 1); if (cy < height - 1) seed(cx, cy + 1);
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

function buildOverlay(ad) {
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // ── Orange accent block — angular shape on right side ──
  // Diagonal polygon from mid-right to bottom-right, like LMNT's green block
  svg += `<polygon points="580,580 ${W},380 ${W},${H} 480,${H}" fill="${ACCENT_COLOR}"/>`;

  // ── Massive headline — left-aligned, stacked ──
  const startY = 110;
  const lineH = 105;
  const fontSize = 92;
  const leftX = 65;

  for (let i = 0; i < ad.lines.length; i++) {
    const y = startY + (i * lineH);
    // Only render lines that fit above the accent block area
    if (y < 750) {
      svg += `<text x="${leftX}" y="${y}" text-anchor="start" fill="${HEADLINE_COLOR}"
              font-size="${fontSize}" font-family="${HEAD_FONT}" font-weight="900" letter-spacing="-2">${escapeXml(ad.lines[i])}</text>`;
    }
  }

  // ── Brand tagline bottom-left ──
  svg += `<text x="${leftX}" y="${H - 55}" text-anchor="start" fill="${TAGLINE_COLOR}"
          font-size="18" font-family="${BODY_FONT}" font-weight="600" letter-spacing="1">${escapeXml(ad.tagline)}</text>`;

  svg += '</svg>';
  return Buffer.from(svg);
}

async function renderAd(ad, logoBuf, logoMeta) {
  // Dark charcoal base
  const bgRgb = { r: 30, g: 30, b: 30 };
  const base = sharp({
    create: { width: W, height: H, channels: 4, background: { ...bgRgb, alpha: 255 } },
  });

  // Product image — remove white bg, resize, position lower-right
  const productRaw = await sharp(ad.product).png().toBuffer();
  const productNoBg = await removeWhiteBg(productRaw);
  const productTrimmed = await sharp(productNoBg).trim().ensureAlpha().png().toBuffer();
  const productResized = await sharp(productTrimmed)
    .resize({ width: 420, height: 450, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().png().toBuffer();
  const pm = await sharp(productResized).metadata();
  // Position: right side, lower portion (over the accent block)
  const px = W - pm.width - 80;
  const py = H - pm.height - 120;

  const overlay = buildOverlay(ad);

  const composites = [
    { input: overlay, left: 0, top: 0 },
    { input: productResized, left: px, top: py },
  ];

  // Logo bottom-left
  if (logoBuf) {
    composites.push({ input: logoBuf, left: 65, top: H - 120 });
  }

  return base.composite(composites).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  console.log(`Rendering ${ads.length} contrarian hook ads...`);

  // Prepare logo (need to invert/lighten for dark bg — use the logo as-is, it has white text areas)
  let logoBuf = null, logoMeta = null;
  try {
    const logoRaw = await sharp(LOGO_PATH).ensureAlpha().png().toBuffer();
    const logoNoBg = await removeWhiteBg(logoRaw);
    logoBuf = await sharp(logoNoBg).trim()
      .resize({ width: 180, height: 60, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().png().toBuffer();
    logoMeta = await sharp(logoBuf).metadata();
  } catch (e) {
    console.log('Logo skipped:', e.message);
  }

  const outDir = '/mnt/raid/Data/tmp/openclaw-builds/ad-batch-hooks';
  mkdirSync(outDir, { recursive: true });

  for (const ad of ads) {
    const t0 = Date.now();
    const buf = await renderAd(ad, logoBuf, logoMeta);
    const path = `${outDir}/${ad.id}.png`;
    writeFileSync(path, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }

  console.log(`\nDone. ${ads.length} ads in ${outDir}/`);
}

main().catch(err => { console.error(err); process.exit(1); });
