/**
 * Testimonial template — final version with palettes + mirror
 * Dark bg (A), Blue bg (B), product left/right mirror
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');
import { writeFileSync, mkdirSync } from 'fs';
import { productOnShape } from './product-on-shape.mjs';

const W = 1080, H = 1080;
const HF = 'Montserrat, Helvetica Neue, Arial, sans-serif';
const BF = 'Source Sans Pro, Helvetica, Arial, sans-serif';
const ACCENT = '#E8722A';
const BLUE = '#001EC3';
const BASE = '/mnt/raid/Data/tmp/openclaw-builds';
const LOGO_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png';
const DB = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/lures/ad-templates/testimonial';

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else { cur = cur ? cur + ' ' + w : w; }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

const PALETTES = {
  dark:  { bg:{r:26,g:26,b:26}, quoteColor:'white', starBg:'transparent' },
  blue:  { bg:{r:0,g:30,b:195}, quoteColor:'white', starBg:'transparent' },
};

function buildOverlay(ad) {
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // ═══ PULL-QUOTE ═══
  const quoteSize = 68;
  const quoteLineH = quoteSize * 1.3;
  const quoteStartY = 110;

  for (let i = 0; i < ad.quoteLines.length; i++) {
    const line = ad.quoteLines[i];
    const y = quoteStartY + i * quoteLineH;
    svg += `<text x="${W/2}" y="${y}" text-anchor="middle" xml:space="preserve" font-size="${quoteSize}" font-family="Georgia, Times New Roman, serif" font-weight="700" font-style="italic" letter-spacing="-0.5">`;
    for (const seg of line) {
      svg += `<tspan fill="${seg.accent ? ACCENT : 'white'}">${esc(seg.text)}</tspan>`;
    }
    svg += `</text>`;
  }

  // ═══ 5 GOLD STARS ═══
  const quoteBottom = quoteStartY + ad.quoteLines.length * quoteLineH;
  const starsY = quoteBottom + 55;
  const starSize = 52;
  const starGap = 60;
  const starsX = W/2 - (starGap * 2);
  for (let i = 0; i < 5; i++) {
    svg += `<text x="${starsX + i*starGap}" y="${starsY}" text-anchor="middle" font-size="${starSize}" fill="#F5A623">\u2605</text>`;
  }

  // ═══ REVIEW CARD ═══
  const cardMargin = 65;
  const cardX = cardMargin;
  const cardY = starsY + 55;
  const cardW = W - cardMargin * 2;
  const cardH = H - cardY - 40;

  // Card shadow
  svg += `<rect x="${cardX+4}" y="${cardY+4}" width="${cardW}" height="${cardH}" rx="16" fill="rgba(0,0,0,0.15)"/>`;
  // Card
  svg += `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="16" fill="white"/>`;

  // Reviewer header
  const headerY = cardY + 45;
  const avatarX = cardX + 45;
  const initial = ad.reviewerName.charAt(0).toUpperCase();
  svg += `<circle cx="${avatarX}" cy="${headerY}" r="26" fill="${BLUE}"/>`;
  svg += `<text x="${avatarX}" y="${headerY+9}" text-anchor="middle" fill="white" font-size="24" font-family="${HF}" font-weight="800">${initial}</text>`;
  svg += `<text x="${avatarX+42}" y="${headerY-4}" font-size="24" font-family="${HF}" font-weight="800" fill="#1A1A1A">${esc(ad.reviewerName)}</text>`;
  svg += `<circle cx="${avatarX+42}" cy="${headerY+22}" r="9" fill="#4CAF50"/>`;
  svg += `<text x="${avatarX+42}" y="${headerY+26}" text-anchor="middle" fill="white" font-size="12" font-family="${HF}" font-weight="900">\u2713</text>`;
  svg += `<text x="${avatarX+58}" y="${headerY+27}" font-size="16" font-family="${BF}" font-weight="600" fill="#4CAF50">Verified Buyer</text>`;

  // Review body
  const bodyX = cardX + 35;
  const bodyStartY = headerY + 60;
  const bodyFontSize = 24;
  const bodyLineH = 34;
  const bodyMaxChars = 40;
  const bodyLines = wrapText(ad.reviewBody, bodyMaxChars);
  const maxLines = Math.floor((cardY + cardH - bodyStartY - 30) / bodyLineH);
  for (let i = 0; i < Math.min(bodyLines.length, maxLines); i++) {
    svg += `<text x="${bodyX}" y="${bodyStartY + i*bodyLineH}" font-size="${bodyFontSize}" font-family="${BF}" font-weight="400" fill="#333">${esc(bodyLines[i])}</text>`;
  }
  if (bodyLines.length > maxLines) {
    svg += `<text x="${bodyX}" y="${bodyStartY + maxLines*bodyLineH}" font-size="${bodyFontSize}" font-family="${BF}" font-weight="600" fill="${BLUE}">...Read more</text>`;
  }

  svg += '</svg>';
  return Buffer.from(svg);
}

const ads = [
  {
    id: 'testimonial-01-game-changer',
    productPath: `${BASE}/epic-axis-kit-product.jpg`,
    quoteLines: [
      [{text: '\u201C', accent: false}, {text: 'Game changer', accent: true}],
      [{text: 'for me.\u201D', accent: false}],
    ],
    reviewerName: 'Brian D.',
    reviewBody: "I had tried all the different ways to planer fish. None of them worked well enough to keep me using a planer to get my baits down in the water. Then I tried the Bridle that Tackle Room makes. Game changer for me. The wind-on bridle works fantastic.",
  },
  {
    id: 'testimonial-02-outstanding',
    productPath: `${BASE}/epic-axis-kit-product.jpg`,
    quoteLines: [
      [{text: '\u201CNone of them have the', accent: false}],
      [{text: 'quality ', accent: true}, {text: 'like the', accent: false}],
      [{text: 'Tackle Room.\u201D', accent: false}],
    ],
    reviewerName: 'Brian D.',
    reviewBody: "I have been buying offshore fishing tackle online for several years from some of the Big Guys, like Tackle Direct, Melton\u2019s, Bass Pro. However none of them have the customer service and quality fishing tackle that has been tested in the field like the Tackle Room. The gear and the customer service are off the charts.",
  },
  {
    id: 'testimonial-03-captain',
    productPath: `${BASE}/jagahoo-purple.jpg`,
    quoteLines: [
      [{text: '\u201CThe knowledge of the', accent: false}],
      [{text: 'staff is', accent: false}, {text: ' second to none.', accent: true}],
      [{text: '\u201D', accent: false}],
    ],
    reviewerName: 'Capt. Bo Toepfer',
    reviewBody: "The Tackle Room is a top notch professional tackle supply company. The order process is easy, the shipping is the fastest I have experienced, and the knowledge of the staff is second to none. It saves me time and money allowing me more time on the water!",
  },
];

async function main() {
  mkdirSync(DB, {recursive:true});

  const logoBuf = await sharp(LOGO_PATH).trim()
    .resize({width:140,height:50,fit:'inside',background:{r:0,g:0,b:0,alpha:0}})
    .ensureAlpha().png().toBuffer();
  const logoMeta = await sharp(logoBuf).metadata();

  let count = 0;

  for (const [palName, pal] of Object.entries(PALETTES)) {
    for (const mirror of [false, true]) {
      const suffix = palName === 'dark' && !mirror ? '' : `-${palName}${mirror ? '-mirror' : ''}`;
      console.log(`--- testimonial ${palName}${mirror ? ' mirror' : ''} ---`);

      for (const ad of ads) {
        const t0 = Date.now();
        const base = sharp({create:{width:W,height:H,channels:4,background:{...pal.bg,alpha:255}}});

        const productBuf = await productOnShape(ad.productPath, 'roundrect', 220, 200, 15, 0.10);
        const pm = await sharp(productBuf).metadata();

        const overlay = buildOverlay(ad);

        // Product position — bottom-right normal, bottom-left mirrored
        const productX = mirror ? 15 : W - pm.width - 15;
        const productY = H - pm.height - 15;

        // Logo on card — opposite side from product
        const logoX = mirror ? (W - 65 - logoMeta.width - 20) : (65 + 25);
        const logoY = H - 40 - logoMeta.height - 15;

        const buf = await base.composite([
          {input:overlay,left:0,top:0},
          {input:productBuf,left:productX,top:productY},
          {input:logoBuf,left:logoX,top:logoY},
        ]).png({compressionLevel:9}).toBuffer();

        const filename = `${ad.id}${suffix}.png`;
        writeFileSync(`${DB}/${filename}`, buf);
        console.log(`  ${filename}  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
        count++;
      }
    }
  }

  console.log(`\nDone. ${count} testimonial variants.`);
}

main().catch(err => { console.error(err); process.exit(1); });
