/**
 * LMNT "Comparison Chart" template — split panel us vs them
 * Reference: AdExamples-kb/11_comparison-chart-vs-sports-drinks.jpg
 *
 * Layout:
 * - Left panel dark (#1E1E1E): our product, brand logo top-left, green check bullets
 * - Right panel light (#F2F0ED): competitor/generic, "Typical X" header, red X bullets
 * - "VS" badge centered between panels
 * - Product images in upper half of each panel
 * - 4 comparison rows below
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

const W = 1080, H = 1080;
const HEAD_FONT = 'Montserrat, Helvetica Neue, Arial, sans-serif';
const BODY_FONT = 'Source Sans Pro, Helvetica, Arial, sans-serif';
const ACCENT = '#E8722A';
const GREEN = '#4CAF50';
const RED = '#E53935';
const BASE = '/mnt/raid/Data/tmp/openclaw-builds';

const ads = [
  {
    id: 'compare-01-epic-axis-vs-diy',
    product: `${BASE}/epic-axis-kit-nobg.png`,
    ourLabel: 'Epic Axis Kit',
    theirLabel: 'Typical\nDIY Rig',
    rows: [
      { us: '480lb Stainless Cable', them: 'Mono Leader' },
      { us: 'Pre-Rigged & Tested', them: 'Crimped In A Parking Lot' },
      { us: 'UV Double Skirts', them: 'Single Generic Skirt' },
      { us: '$84.99 Complete Kit', them: '$90+ In Loose Parts' },
    ],
  },
  {
    id: 'compare-02-jagahoo-vs-diy',
    product: `${BASE}/jagahoo-purple-nobg.png`,
    ourLabel: 'Jagahoo Kit',
    theirLabel: 'Typical\nDIY Build',
    rows: [
      { us: '480lb Stainless Cable', them: 'Aluminum Crimps On Mono' },
      { us: '3 Wahoo-Proven Colors', them: 'Whatever Was On Sale' },
      { us: '250lb Hi-Catch Leader', them: 'Bargain Fluorocarbon' },
      { us: 'Clip On & Go', them: '45 Min Rigging Session' },
    ],
  },
  {
    id: 'compare-03-chugger-vs-bare',
    product: `${BASE}/chugger-blue-nobg.png`,
    ourLabel: 'Bait Chugger',
    theirLabel: 'Typical\nBare Bait',
    rows: [
      { us: 'Bubble Trail Triggers Strikes', them: 'Silent Dead Drag' },
      { us: 'Dual Chugger Heads', them: 'No Action At All' },
      { us: '150lb Rigged Leader', them: 'DIY Rigging Required' },
      { us: '$29.99 Ready To Fish', them: 'Hook + Leader + Hope' },
    ],
  },
];

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildOverlay(ad) {
  const half = W / 2;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // ── Left panel background (dark) ──
  svg += `<rect x="0" y="0" width="${half}" height="${H}" fill="#1E1E1E"/>`;

  // ── Right panel background (warm light) ──
  svg += `<rect x="${half}" y="0" width="${half}" height="${H}" fill="#F2F0ED"/>`;

  // ── Our label (left, white text) ──
  svg += `<text x="${half/2}" y="70" text-anchor="middle" fill="white"
          font-size="32" font-family="${HEAD_FONT}" font-weight="800">${esc(ad.ourLabel)}</text>`;

  // ── Their label (right, dark text, supports newline) ──
  const theirLines = ad.theirLabel.split('\n');
  if (theirLines.length === 1) {
    svg += `<text x="${half + half/2}" y="70" text-anchor="middle" fill="#333"
            font-size="32" font-family="${HEAD_FONT}" font-weight="800">${esc(theirLines[0])}</text>`;
  } else {
    svg += `<text x="${half + half/2}" y="50" text-anchor="middle" fill="#333"
            font-size="32" font-family="${HEAD_FONT}" font-weight="800">
            <tspan x="${half + half/2}" dy="0">${esc(theirLines[0])}</tspan>
            <tspan x="${half + half/2}" dy="38">${esc(theirLines[1])}</tspan></text>`;
  }

  // ── VS badge (centered) ──
  const vsX = half, vsY = 340;
  svg += `<circle cx="${vsX}" cy="${vsY}" r="42" fill="${ACCENT}"/>`;
  svg += `<text x="${vsX}" y="${vsY + 14}" text-anchor="middle" fill="white"
          font-size="32" font-family="${HEAD_FONT}" font-weight="900">VS</text>`;

  // ── Comparison rows ──
  const rowStartY = 500;
  const rowH = 120;

  for (let i = 0; i < ad.rows.length; i++) {
    const r = ad.rows[i];
    const y = rowStartY + i * rowH;

    // Green check + our text (left panel)
    svg += `<circle cx="45" cy="${y}" r="14" fill="${GREEN}"/>`;
    svg += `<text x="44" y="${y + 6}" text-anchor="middle" fill="white" font-size="18" font-family="${HEAD_FONT}" font-weight="900">\u2713</text>`;
    svg += `<text x="72" y="${y + 7}" text-anchor="start" fill="white"
            font-size="22" font-family="${BODY_FONT}" font-weight="700">${esc(r.us)}</text>`;

    // Red X + their text (right panel)
    svg += `<circle cx="${half + 45}" cy="${y}" r="14" fill="${RED}"/>`;
    svg += `<text x="${half + 44}" y="${y + 6}" text-anchor="middle" fill="white" font-size="18" font-family="${HEAD_FONT}" font-weight="900">\u2717</text>`;
    svg += `<text x="${half + 72}" y="${y + 7}" text-anchor="start" fill="#444"
            font-size="22" font-family="${BODY_FONT}" font-weight="600">${esc(r.them)}</text>`;

    // Subtle divider under each row (except last)
    if (i < ad.rows.length - 1) {
      svg += `<line x1="30" y1="${y + rowH/2}" x2="${half - 20}" y2="${y + rowH/2}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
      svg += `<line x1="${half + 30}" y1="${y + rowH/2}" x2="${W - 20}" y2="${y + rowH/2}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`;
    }
  }

  // ── URL bottom center ──
  svg += `<text x="${W/2}" y="${H - 25}" text-anchor="middle" fill="rgba(255,255,255,0.3)"
          font-size="11" font-family="${BODY_FONT}" font-weight="400" letter-spacing="1">thetackleroom.com</text>`;

  svg += '</svg>';
  return Buffer.from(svg);
}

async function renderAd(ad) {
  const base = sharp({create:{width:W,height:H,channels:4,background:{r:30,g:30,b:30,alpha:255}}});

  // Product image — position in upper-left panel
  const productResized = await sharp(ad.product).trim()
    .resize({width:360,height:300,fit:'inside',background:{r:0,g:0,b:0,alpha:0}})
    .ensureAlpha().png().toBuffer();
  const pm = await sharp(productResized).metadata();
  const px = Math.round((W/2 - pm.width) / 2);
  const py = 120 + Math.round((280 - pm.height) / 2);

  // "Their" side — generic question mark or faded product silhouette
  // Use a simple gray placeholder shape to represent generic/DIY
  const theirSvg = Buffer.from(`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect x="40" y="20" width="120" height="160" rx="12" fill="rgba(0,0,0,0.08)" stroke="rgba(0,0,0,0.12)" stroke-width="2" stroke-dasharray="8,6"/>
    <text x="100" y="115" text-anchor="middle" fill="rgba(0,0,0,0.2)" font-size="64" font-family="${HEAD_FONT}" font-weight="900">?</text>
  </svg>`);
  const theirX = W/2 + Math.round((W/2 - 200) / 2);
  const theirY = 160;

  const overlay = buildOverlay(ad);
  const composites = [
    {input: overlay, left: 0, top: 0},
    {input: productResized, left: px, top: py},
    {input: theirSvg, left: theirX, top: theirY},
  ];

  return base.composite(composites).png({compressionLevel:9}).toBuffer();
}

async function main() {
  console.log(`Rendering ${ads.length} comparison chart ads...`);
  const outDir = `${BASE}/ad-batch-compare`;
  mkdirSync(outDir, {recursive:true});

  for (const ad of ads) {
    const t0 = Date.now();
    const buf = await renderAd(ad);
    writeFileSync(`${outDir}/${ad.id}.png`, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
