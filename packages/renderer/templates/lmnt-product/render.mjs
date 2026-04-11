/**
 * LMNT-style ad render v2 — TackleRoom Epic Axis Wahoo Kit
 * Improvements over v1:
 *   - Full kit product image (lure + weight + cable + leader)
 *   - Larger/bolder stat numbers (68px)
 *   - Wider orange accent bars
 *   - Curved arrow paths instead of dashed lines
 *   - Tighter composition with product more dominant
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');
import { writeFileSync } from 'fs';

const W = 1080;
const H = 1080;
const OUTPUT = '/mnt/raid/Data/tmp/openclaw-builds/lure-ad-test-E.png';

// ── Colors ──
const BG = { r: 246, g: 245, b: 243 };         // #F6F5F3 warm stone
const HEADLINE_COLOR = '#1A1A1A';
const STAT_VALUE_COLOR = '#001EC3';              // TackleRoom royal blue
const STAT_LABEL_COLOR = '#888888';
const ACCENT_COLOR = '#E8722A';                  // TackleRoom orange
const WORDMARK_COLOR = 'rgba(0,30,195,0.35)';
const URL_COLOR = '#AAAAAA';

// ── Fonts ──
const HEAD_FONT = 'Montserrat, Helvetica Neue, Arial, sans-serif';
const BODY_FONT = 'Source Sans Pro, Helvetica, Arial, sans-serif';

// ── Product image — full kit from Shopify CDN ──
const PRODUCT_PATH = '/mnt/raid/Data/tmp/openclaw-builds/epic-axis-kit-product.jpg';
const LOGO_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png';

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildTextOverlay() {
  // ── Layout constants ──
  const headlineY = 90;
  const headlineSize = 52;
  const headlineLineH = 60;

  // Stat positions — radiating from center, pushed outward
  const stats = [
    { value: '480lb',  label: 'STAINLESS CABLE',    x: 145, y: 300, arrow: 'tl' },
    { value: '5',      label: 'UV COLOR PATTERNS',  x: 935, y: 300, arrow: 'tr' },
    { value: '32oz',   label: 'TROLLING WEIGHT',    x: 145, y: 830, arrow: 'bl' },
    { value: '$84.99', label: 'PRE-RIGGED & READY', x: 935, y: 830, arrow: 'br' },
  ];

  const statValueSize = 76;
  const statLabelSize = 18;   // Larger — readable at thumbnail
  const statLabelGap = 10;
  const accentW = 52;         // Wider orange bars
  const accentH = 4;
  const accentGapBelow = 10;  // Gap below label before orange bar

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // ── Subtle radial glow behind product area ──
  svg += `
    <defs>
      <radialGradient id="glow" cx="50%" cy="52%" r="28%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.6)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <circle cx="${W/2}" cy="${H/2 + 20}" r="300" fill="url(#glow)"/>`;

  // ── Headline — scroll-stopping contrarian hook ──
  // Line 1: plain dark text. Line 2: orange accent on the key phrase.
  svg += `
    <text x="${W/2}" y="${headlineY}" text-anchor="middle"
          font-size="${headlineSize}" font-family="${HEAD_FONT}" font-weight="900" letter-spacing="-1">
      <tspan x="${W/2}" dy="0" fill="${HEADLINE_COLOR}">A wahoo hits at 60 mph.</tspan>
      <tspan x="${W/2}" dy="${headlineLineH}" fill="${ACCENT_COLOR}">Is your hardware ready?</tspan>
    </text>`;

  // Orange accent underline beneath the second line
  const underY = headlineY + headlineLineH + 12;
  const underW = 280;
  svg += `<rect x="${(W - underW)/2}" y="${underY}" width="${underW}" height="${5}" rx="2.5" fill="${ACCENT_COLOR}" opacity="0.5"/>`;

  // ── Stat blocks — value, label, then orange accent bar underneath ──
  for (const s of stats) {
    // Value (large bold number)
    const valY = s.y + statValueSize * 0.75;
    svg += `<text x="${s.x}" y="${valY}" text-anchor="middle" fill="${STAT_VALUE_COLOR}"
            font-size="${statValueSize}" font-family="${HEAD_FONT}" font-weight="800" letter-spacing="-1">${escapeXml(s.value)}</text>`;

    // Label (larger uppercase below value)
    const labelY = valY + statLabelGap + statLabelSize;
    svg += `<text x="${s.x}" y="${labelY}" text-anchor="middle" fill="${STAT_LABEL_COLOR}"
            font-size="${statLabelSize}" font-family="${BODY_FONT}" font-weight="700" letter-spacing="2">${escapeXml(s.label)}</text>`;

    // Orange accent bar UNDER the label
    const barY = labelY + accentGapBelow;
    svg += `<rect x="${s.x - accentW/2}" y="${barY}" width="${accentW}" height="${accentH}" rx="2" fill="${ACCENT_COLOR}"/>`;
  }

  // ── Curved arrows pointing from stats toward product ──
  const arrowColor = 'rgba(0,30,195,0.22)';  // More visible
  const arrowWidth = 2;

  // Top-left → product center
  svg += `<path d="M 200 ${stats[0].y + 55} Q 280 420 380 440" stroke="${arrowColor}" stroke-width="${arrowWidth}" fill="none" stroke-linecap="round"/>`;
  // Arrowhead
  svg += `<polygon points="378,434 384,444 374,444" fill="${arrowColor}"/>`;

  // Top-right → product center
  svg += `<path d="M 880 ${stats[1].y + 55} Q 800 420 700 440" stroke="${arrowColor}" stroke-width="${arrowWidth}" fill="none" stroke-linecap="round"/>`;
  svg += `<polygon points="702,434 696,444 706,444" fill="${arrowColor}"/>`;

  // Bottom-left → product center
  svg += `<path d="M 200 ${stats[2].y - 20} Q 280 700 380 660" stroke="${arrowColor}" stroke-width="${arrowWidth}" fill="none" stroke-linecap="round"/>`;
  svg += `<polygon points="378,666 384,656 374,656" fill="${arrowColor}"/>`;

  // Bottom-right → product center
  svg += `<path d="M 880 ${stats[3].y - 20} Q 800 700 700 660" stroke="${arrowColor}" stroke-width="${arrowWidth}" fill="none" stroke-linecap="round"/>`;
  svg += `<polygon points="702,666 696,656 706,656" fill="${arrowColor}"/>`;

  // ── URL under logo (logo image is composited separately) ──
  svg += `<text x="${W/2}" y="1010" text-anchor="middle" fill="${URL_COLOR}"
          font-size="11" font-family="${BODY_FONT}" font-weight="400" letter-spacing="1">thetackleroom.com</text>`;

  svg += '</svg>';
  return Buffer.from(svg);
}

// ── Remove white background from product image ──
async function removeWhiteBg(inputBuffer) {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixels = Buffer.from(data);
  const total = width * height;

  const threshold = 245; // More conservative — preserve light blue cable
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0, tail = 0;

  const minCh = (k) => {
    const i = k * channels;
    return Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
  };
  const isWhite = (k) => minCh(k) >= threshold;
  const seed = (sx, sy) => {
    const k = sy * width + sx;
    if (!visited[k] && isWhite(k)) { visited[k] = 1; queue[tail++] = k; }
  };

  for (let x = 0; x < width; x++) { seed(x, 0); seed(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seed(0, y); seed(width - 1, y); }

  while (head < tail) {
    const k = queue[head++];
    pixels[k * channels + 3] = 0;
    const cx = k % width, cy = (k - cx) / width;
    if (cx > 0) seed(cx - 1, cy);
    if (cx < width - 1) seed(cx + 1, cy);
    if (cy > 0) seed(cx, cy - 1);
    if (cy < height - 1) seed(cx, cy + 1);
  }

  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

async function main() {
  console.log('Building LMNT-style ad v2...');

  // 1. Create warm stone base
  const base = sharp({
    create: { width: W, height: H, channels: 4, background: { ...BG, alpha: 255 } },
  });

  // 2. Prepare full-kit product image — remove white bg, resize larger
  const productRaw = await sharp(PRODUCT_PATH).png().toBuffer();
  const productNoBg = await removeWhiteBg(productRaw);
  const productTrimmed = await sharp(productNoBg).trim().ensureAlpha().png().toBuffer();
  const productResized = await sharp(productTrimmed)
    .resize({ width: 520, height: 560, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer();
  const productMeta = await sharp(productResized).metadata();
  const productX = Math.round((W - productMeta.width) / 2);
  const productY = Math.round((H - productMeta.height) / 2) + 15;

  // 3. Prepare wide horizontal logo (TackleRoom 1.1 wordmark)
  let logoBuf, logoX, logoY;
  try {
    // Remove white background from logo, then resize to fit bottom area
    const logoRaw = await sharp(LOGO_PATH).ensureAlpha().png().toBuffer();
    const logoNoBg = await removeWhiteBg(logoRaw);
    logoBuf = await sharp(logoNoBg)
      .trim()
      .resize({ width: 300, height: 100, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .png()
      .toBuffer();
    const logoMeta = await sharp(logoBuf).metadata();
    logoX = Math.round((W - logoMeta.width) / 2);
    logoY = 910;
  } catch(e) {
    logoBuf = null;
    console.log('Logo error:', e.message);
  }

  // 4. Subtle product shadow
  const shadowSize = Math.max(productMeta.width, productMeta.height) + 80;
  const shadowSvg = Buffer.from(`<svg width="${shadowSize}" height="${shadowSize}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="ps" cx="50%" cy="55%" r="45%">
        <stop offset="0%" stop-color="rgba(0,0,0,0.08)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient>
    </defs>
    <ellipse cx="${shadowSize/2}" cy="${shadowSize*0.55}" rx="${shadowSize*0.38}" ry="${shadowSize*0.10}" fill="url(#ps)"/>
  </svg>`);
  const shadowX = Math.round((W - shadowSize) / 2);
  const shadowY = productY + Math.round(productMeta.height * 0.3);

  // 5. Build text overlay
  const textOverlay = buildTextOverlay();

  // 6. Composite
  const composites = [
    { input: shadowSvg, left: shadowX, top: shadowY },
    { input: productResized, left: productX, top: productY },
    { input: textOverlay, left: 0, top: 0 },
  ];
  if (logoBuf) {
    composites.push({ input: logoBuf, left: logoX, top: logoY });
  }

  const result = await base.composite(composites).png({ compressionLevel: 9 }).toBuffer();

  writeFileSync(OUTPUT, result);
  console.log(`Saved: ${OUTPUT} (${(result.length / 1024).toFixed(0)} KB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
