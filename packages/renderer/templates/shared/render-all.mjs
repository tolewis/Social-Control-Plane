/**
 * Master re-render: all 4 templates using product-on-shape (no bg removal)
 * Circle for lures (Epic Axis, Jagahoo), roundrect for chuggers
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');
import { writeFileSync, mkdirSync } from 'fs';
import { productOnShape } from './product-on-shape.mjs';

const W = 1080, H = 1080;
const HEAD_FONT = 'Montserrat, Helvetica Neue, Arial, sans-serif';
const BODY_FONT = 'Source Sans Pro, Helvetica, Arial, sans-serif';
const ACCENT = '#E8722A';
const STAT_VALUE_COLOR = '#001EC3';
const GREEN = '#4CAF50';
const RED = '#E53935';
const BASE = '/mnt/raid/Data/tmp/openclaw-builds';
const LOGO_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png';

// Product paths (original, with white bg — no removal needed)
const P = {
  axis: `${BASE}/epic-axis-kit-product.jpg`,
  jagPurple: `${BASE}/jagahoo-purple.jpg`,
  jagOrange: `${BASE}/jagahoo-orange.jpg`,
  chugDetail: `${BASE}/chugger-detail1.png`,
  chugBlue: `${BASE}/chugger-blue.jpg`,
  chugTable: `${BASE}/chugger-table.png`,
};

// Shape mapping
const SHAPE = {
  axis: 'roundrect', jagPurple: 'roundrect', jagOrange: 'roundrect',
  chugDetail: 'roundrect', chugBlue: 'roundrect', chugTable: 'roundrect',
};

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function prepareLogo(mode) {
  const raw = await sharp(LOGO_PATH).trim().ensureAlpha().png().toBuffer();
  if (mode === 'warm') {
    return sharp(raw).resize({width:200,height:70,fit:'inside',background:{r:0,g:0,b:0,alpha:0}}).ensureAlpha().png().toBuffer();
  } else {
    return sharp(raw).negate({alpha:false}).resize({width:140,height:50,fit:'inside',background:{r:0,g:0,b:0,alpha:0}}).ensureAlpha().png().toBuffer();
  }
}

// ═══════════════════════════════════════════
// TEMPLATE 1: LMNT Product (warm bg)
// ═══════════════════════════════════════════

function buildLmntSvg(ad) {
  const positions = [{x:145,y:300},{x:935,y:300},{x:145,y:830},{x:935,y:830}];
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<text x="${W/2}" y="90" text-anchor="middle" font-size="52" font-family="${HEAD_FONT}" font-weight="900" letter-spacing="-1">`;
  svg += `<tspan x="${W/2}" dy="0" fill="#1A1A1A">${esc(ad.headL1)}</tspan>`;
  svg += `<tspan x="${W/2}" dy="60" fill="${ACCENT}">${esc(ad.headL2)}</tspan></text>`;
  svg += `<rect x="${(W-280)/2}" y="162" width="280" height="5" rx="2.5" fill="${ACCENT}" opacity="0.5"/>`;
  for (let i=0;i<4;i++) {
    const s=ad.stats[i], p=positions[i], valY=p.y+76*0.75;
    svg += `<text x="${p.x}" y="${valY}" text-anchor="middle" fill="${STAT_VALUE_COLOR}" font-size="76" font-family="${HEAD_FONT}" font-weight="800" letter-spacing="-1">${esc(s.v)}</text>`;
    const labelY=valY+10+18;
    svg += `<text x="${p.x}" y="${labelY}" text-anchor="middle" fill="#888" font-size="18" font-family="${BODY_FONT}" font-weight="700" letter-spacing="2">${esc(s.l)}</text>`;
    svg += `<rect x="${p.x-26}" y="${labelY+10}" width="52" height="4" rx="2" fill="${ACCENT}"/>`;
  }
  const ac='rgba(0,30,195,0.22)';
  svg += `<path d="M 200 355 Q 280 420 380 440" stroke="${ac}" stroke-width="2" fill="none"/>`;
  svg += `<polygon points="378,434 384,444 374,444" fill="${ac}"/>`;
  svg += `<path d="M 880 355 Q 800 420 700 440" stroke="${ac}" stroke-width="2" fill="none"/>`;
  svg += `<polygon points="702,434 696,444 706,444" fill="${ac}"/>`;
  svg += `<path d="M 200 810 Q 280 700 380 660" stroke="${ac}" stroke-width="2" fill="none"/>`;
  svg += `<polygon points="378,666 384,656 374,656" fill="${ac}"/>`;
  svg += `<path d="M 880 810 Q 800 700 700 660" stroke="${ac}" stroke-width="2" fill="none"/>`;
  svg += `<polygon points="702,666 696,656 706,656" fill="${ac}"/>`;
  svg += `<text x="${W/2}" y="1010" text-anchor="middle" fill="#AAA" font-size="11" font-family="${BODY_FONT}" letter-spacing="1">thetackleroom.com</text>`;
  svg += '</svg>';
  return Buffer.from(svg);
}

async function renderLmnt(ad, logoBuf) {
  const base = sharp({create:{width:W,height:H,channels:4,background:{r:246,g:245,b:243,alpha:255}}});
  const productBuf = await productOnShape(ad.productPath, ad.shape, 520, 520, 25, 0.06);
  const pm = await sharp(productBuf).metadata();
  const px = Math.round((W-pm.width)/2), py = Math.round((H-pm.height)/2)+15;
  const overlay = buildLmntSvg(ad);
  const logoMeta = await sharp(logoBuf).metadata();
  return base.composite([
    {input:productBuf,left:px,top:py},
    {input:overlay,left:0,top:0},
    {input:logoBuf,left:Math.round((W-logoMeta.width)/2),top:935},
  ]).png({compressionLevel:9}).toBuffer();
}

// ═══════════════════════════════════════════
// TEMPLATE 2: Contrarian Hook (dark bg)
// ═══════════════════════════════════════════

function buildHookSvg(ad) {
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  // Orange accent block — diagonal polygon on right side
  svg += `<polygon points="580,580 ${W},380 ${W},${H} 480,${H}" fill="${ACCENT}"/>`;
  const startY=110, lineH=105, fontSize=92;
  for (let i=0;i<ad.lines.length && (startY+i*lineH)<750;i++) {
    svg += `<text x="65" y="${startY+i*lineH}" text-anchor="start" fill="#1A1A1A" font-size="${fontSize}" font-family="${HEAD_FONT}" font-weight="900" letter-spacing="-2">${esc(ad.lines[i])}</text>`;
  }
  // Tagline bottom-right (away from logo in bottom-left)
  svg += `<text x="${W-65}" y="${H-35}" text-anchor="end" fill="rgba(0,0,0,0.45)" font-size="16" font-family="${BODY_FONT}" font-weight="600" letter-spacing="1">${esc(ad.tagline)}</text>`;
  svg += '</svg>';
  return Buffer.from(svg);
}

async function renderHook(ad, logoBuf) {
  const base = sharp({create:{width:W,height:H,channels:4,background:{r:246,g:245,b:243,alpha:255}}});
  const productBuf = await productOnShape(ad.productPath, ad.shape, 480, 450, 20, 0.08);
  const pm = await sharp(productBuf).metadata();
  const px = W-pm.width-40, py = H-pm.height-110;
  const overlay = buildHookSvg(ad);
  const composites = [{input:overlay,left:0,top:0},{input:productBuf,left:px,top:py}];
  if (logoBuf) {
    composites.push({input:logoBuf,left:55,top:H-90});
  }
  return base.composite(composites).png({compressionLevel:9}).toBuffer();
}

// ═══════════════════════════════════════════
// TEMPLATE 3: Benefit Grid (dark bg)
// ═══════════════════════════════════════════

function buildGridSvg(ad) {
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  // Two-line headline: L1 white, L2 orange (scroll-stop color transition)
  const headSize = 52;
  svg += `<text x="${W/2}" y="75" text-anchor="middle" font-size="${headSize}" font-family="${HEAD_FONT}" font-weight="900" letter-spacing="1">`;
  svg += `<tspan x="${W/2}" dy="0" fill="#1A1A1A">${esc(ad.headL1)}</tspan>`;
  svg += `<tspan x="${W/2}" dy="62" fill="${ACCENT}">${esc(ad.headL2)}</tspan>`;
  svg += `</text>`;
  // Orange underline accent below L2
  svg += `<rect x="${(W-240)/2}" y="150" width="240" height="4" rx="2" fill="${ACCENT}" opacity="0.6"/>`;
  const stripY=165, stripH=100, stripPad=30, stripW=W-stripPad*2, colW=stripW/ad.benefits.length;
  svg += `<rect x="${stripPad}" y="${stripY}" width="${stripW}" height="${stripH}" rx="6" fill="#001EC3"/>`;
  for (let i=0;i<ad.benefits.length;i++) {
    const cx=stripPad+(i*colW)+colW/2, lines=ad.benefits[i].split('\n');
    if (lines.length===1) {
      svg += `<text x="${cx}" y="${stripY+stripH/2+9}" text-anchor="middle" fill="white" font-size="24" font-family="${HEAD_FONT}" font-weight="800">${esc(lines[0])}</text>`;
    } else {
      svg += `<text x="${cx}" y="${stripY+stripH/2-8}" text-anchor="middle" fill="white" font-size="24" font-family="${HEAD_FONT}" font-weight="800">${esc(lines[0])}</text>`;
      svg += `<text x="${cx}" y="${stripY+stripH/2+22}" text-anchor="middle" fill="white" font-size="24" font-family="${HEAD_FONT}" font-weight="800">${esc(lines[1])}</text>`;
    }
    if (i<ad.benefits.length-1) {
      const dx=stripPad+((i+1)*colW);
      svg += `<line x1="${dx}" y1="${stripY+15}" x2="${dx}" y2="${stripY+stripH-15}" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`;
    }
  }
  svg += `<text x="${W/2}" y="${H-30}" text-anchor="middle" fill="rgba(0,0,0,0.3)" font-size="12" font-family="${BODY_FONT}" letter-spacing="1">thetackleroom.com</text>`;
  svg += '</svg>';
  return Buffer.from(svg);
}

async function renderGrid(ad, logoBuf) {
  const base = sharp({create:{width:W,height:H,channels:4,background:{r:246,g:245,b:243,alpha:255}}});
  const productBuf = await productOnShape(ad.productPath, ad.shape, 580, 580, 25, 0.10);
  const pm = await sharp(productBuf).metadata();
  const px = Math.round((W-pm.width)/2), py = 300+Math.round((640-pm.height)/2);
  const overlay = buildGridSvg(ad);
  const composites = [{input:productBuf,left:px,top:py},{input:overlay,left:0,top:0}];
  if (logoBuf) composites.push({input:logoBuf,left:40,top:H-85});
  return base.composite(composites).png({compressionLevel:9}).toBuffer();
}

// ═══════════════════════════════════════════
// TEMPLATE 4: Comparison Chart (split panel)
// ═══════════════════════════════════════════

function buildCompareSvg(ad) {
  const half=W/2;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect x="0" y="0" width="${half}" height="${H}" fill="#001EC3"/>`;
  svg += `<rect x="${half}" y="0" width="${half}" height="${H}" fill="#F2F0ED"/>`;
  svg += `<text x="${half/2}" y="70" text-anchor="middle" fill="white" font-size="32" font-family="${HEAD_FONT}" font-weight="800">${esc(ad.ourLabel)}</text>`;
  const tl=ad.theirLabel.split('\n');
  if (tl.length===1) {
    svg += `<text x="${half+half/2}" y="70" text-anchor="middle" fill="#333" font-size="32" font-family="${HEAD_FONT}" font-weight="800">${esc(tl[0])}</text>`;
  } else {
    svg += `<text x="${half+half/2}" y="50" text-anchor="middle" fill="#333" font-size="32" font-family="${HEAD_FONT}" font-weight="800"><tspan x="${half+half/2}" dy="0">${esc(tl[0])}</tspan><tspan x="${half+half/2}" dy="38">${esc(tl[1])}</tspan></text>`;
  }
  svg += `<circle cx="${half}" cy="340" r="42" fill="${ACCENT}"/>`;
  svg += `<text x="${half}" y="354" text-anchor="middle" fill="white" font-size="32" font-family="${HEAD_FONT}" font-weight="900">VS</text>`;
  const rowStartY=500, rowH=120;
  for (let i=0;i<ad.rows.length;i++) {
    const r=ad.rows[i], y=rowStartY+i*rowH;
    svg += `<circle cx="45" cy="${y}" r="14" fill="${GREEN}"/>`;
    svg += `<text x="44" y="${y+6}" text-anchor="middle" fill="white" font-size="18" font-family="${HEAD_FONT}" font-weight="900">\u2713</text>`;
    svg += `<text x="72" y="${y+7}" text-anchor="start" fill="white" font-size="22" font-family="${BODY_FONT}" font-weight="700">${esc(r.us)}</text>`;
    svg += `<circle cx="${half+45}" cy="${y}" r="14" fill="${RED}"/>`;
    svg += `<text x="${half+44}" y="${y+6}" text-anchor="middle" fill="white" font-size="18" font-family="${HEAD_FONT}" font-weight="900">\u2717</text>`;
    svg += `<text x="${half+72}" y="${y+7}" text-anchor="start" fill="#444" font-size="22" font-family="${BODY_FONT}" font-weight="600">${esc(r.them)}</text>`;
    if (i<ad.rows.length-1) {
      svg += `<line x1="30" y1="${y+rowH/2}" x2="${half-20}" y2="${y+rowH/2}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
      svg += `<line x1="${half+30}" y1="${y+rowH/2}" x2="${W-20}" y2="${y+rowH/2}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`;
    }
  }
  svg += `<text x="${half/2}" y="${H-25}" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="11" font-family="${BODY_FONT}" letter-spacing="1">thetackleroom.com</text>`;
  svg += '</svg>';
  return Buffer.from(svg);
}

const MANGLED_PATH = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/lures/ad-templates/comparison-chart/mangled.png';

async function renderCompare(ad, logoBuf) {
  const base = sharp({create:{width:W,height:H,channels:4,background:{r:246,g:245,b:243,alpha:255}}});
  // Our product — left panel
  const productBuf = await productOnShape(ad.productPath, ad.shape, 340, 280, 20, 0.10);
  const pm = await sharp(productBuf).metadata();
  const px = Math.round((W/2-pm.width)/2), py = 120+Math.round((280-pm.height)/2);
  // Mangled lure — right panel
  const mangledBuf = await productOnShape(MANGLED_PATH, 'roundrect', 340, 280, 20, 0.06);
  const mm = await sharp(mangledBuf).metadata();
  const mx = W/2 + Math.round((W/2-mm.width)/2), my = 120+Math.round((280-mm.height)/2);
  const overlay = buildCompareSvg(ad);
  const composites = [
    {input:overlay,left:0,top:0},
    {input:productBuf,left:px,top:py},
    {input:mangledBuf,left:mx,top:my},
  ];
  // Logo bottom-left on the blue panel
  if (logoBuf) {
    const lm = await sharp(logoBuf).metadata();
    composites.push({input:logoBuf,left:30,top:H-lm.height-20});
  }
  return base.composite(composites).png({compressionLevel:9}).toBuffer();
}

// ═══════════════════════════════════════════
// AD DEFINITIONS
// ═══════════════════════════════════════════

const lmntAds = [
  {id:'1A-epic-axis-identity',productPath:P.axis,shape:'roundrect',headL1:'A wahoo hits at 60 mph.',headL2:'Is your hardware ready?',stats:[{v:'480lb',l:'STAINLESS CABLE'},{v:'5',l:'UV COLOR PATTERNS'},{v:'32oz',l:'TROLLING WEIGHT'},{v:'$84.99',l:'PRE-RIGGED & READY'}]},
  {id:'1B-epic-axis-education',productPath:P.axis,shape:'roundrect',headL1:'Chrome corrodes. Paint chips.',headL2:'Stainless steel doesn\u2019t.',stats:[{v:'480lb',l:'CABLE STIFF RIG'},{v:'UV',l:'DOUBLE SKIRT TECH'},{v:'25ft',l:'SHOCK LEADER'},{v:'8\u201318kt',l:'TROLLING SPEED'}]},
  {id:'1C-epic-axis-authority',productPath:P.axis,shape:'roundrect',headL1:'26 wahoo in one day.',headL2:'All on pre-rigged kits.',stats:[{v:'60mph',l:'WAHOO STRIKE SPEED'},{v:'5',l:'PROVEN COLORS'},{v:'480lb',l:'STAINLESS CABLE'},{v:'$84.99',l:'COMPLETE KIT'}]},
  {id:'1D-epic-axis-comparison',productPath:P.axis,shape:'roundrect',headL1:'Stop rigging at 5 AM.',headL2:'Start fishing instead.',stats:[{v:'0',l:'ASSEMBLY REQUIRED'},{v:'5',l:'COLOR OPTIONS'},{v:'480lb',l:'CABLE STRENGTH'},{v:'1',l:'BOX. FULL SPREAD.'}]},
  {id:'2A-jagahoo-identity',productPath:P.jagPurple,shape:'roundrect',headL1:'Three colors. Two weights.',headL2:'One kit. Full confidence.',stats:[{v:'480lb',l:'STAINLESS CABLE'},{v:'3',l:'WAHOO-PROVEN COLORS'},{v:'250lb',l:'SHOCK LEADER'},{v:'$67.99',l:'RIGGED & READY'}]},
  {id:'2B-jagahoo-education',productPath:P.jagPurple,shape:'roundrect',headL1:'At 80 feet, red disappears.',headL2:'Black and purple don\u2019t.',stats:[{v:'80ft',l:'COLOR DEPTH LIMIT'},{v:'3',l:'DEEP-WATER COLORS'},{v:'480lb',l:'STAINLESS CABLE'},{v:'16/24oz',l:'WEIGHT OPTIONS'}]},
  {id:'2C-jagahoo-value',productPath:P.jagOrange,shape:'roundrect',headL1:'Lure. Cable. Leader. Weight.',headL2:'One box. Done.',stats:[{v:'4',l:'COMPONENTS INCLUDED'},{v:'480lb',l:'CABLE RIG'},{v:'250lb',l:'HI-CATCH LEADER'},{v:'$67.99',l:'COMPLETE KIT'}]},
  {id:'3A-chugger-authority',productPath:P.chugDetail,shape:'roundrect',headL1:'More world records than',headL2:'any lure ever made.',stats:[{v:'2',l:'CHUGGER HEADS'},{v:'8',l:'COLOR OPTIONS'},{v:'150lb',l:'RIGGED LEADER'},{v:'$29.99',l:'PER LURE'}]},
  {id:'3B-chugger-education',productPath:P.chugBlue,shape:'roundrect',headL1:'Dead bait doesn\u2019t swim.',headL2:'A chugger fixes that.',stats:[{v:'2',l:'HEAD STYLES'},{v:'8/0',l:'MUSTAD HOOK'},{v:'12ft',l:'150LB LEADER'},{v:'$29.99',l:'RIGGED READY'}]},
  {id:'3C-chugger-spread',productPath:P.chugTable,shape:'roundrect',headL1:'The cheapest lure in your spread',headL2:'catches the biggest fish.',stats:[{v:'$29.99',l:'SPREAD UPGRADE'},{v:'8',l:'COLOR OPTIONS'},{v:'2',l:'CHUGGER HEADS'},{v:'1,402lb',l:'WORLD RECORD MARLIN'}]},
];

const hookAds = [
  {id:'hook-01-wahoo-rigs',productPath:P.axis,shape:'roundrect',lines:['The guys','catching','wahoo aren\u2019t','building','their own','rigs.'],tagline:'Pre-Rigged Wahoo Lure Kits'},
  {id:'hook-02-hardware-failing',productPath:P.axis,shape:'roundrect',lines:['Your','wahoo rig','is failing','you.'],tagline:'Stainless Steel. 480lb Cable. Rigged.'},
  {id:'hook-03-stop-rigging',productPath:P.jagPurple,shape:'roundrect',lines:['Stop','rigging','in the','dark.'],tagline:'Jagahoo Wahoo Kit \u2014 Clip On & Go'},
  {id:'hook-04-chugger-record',productPath:P.chugBlue,shape:'roundrect',lines:['A chugger','caught the','world','record.'],tagline:'Billfish Bait Chugger \u2014 $29.99'},
];

const gridAds = [
  {id:'grid-01-epic-axis-system',productPath:P.axis,shape:'roundrect',headL1:'ONE BOX.',headL2:'FULL WAHOO SPREAD.',benefits:['Stainless\nSteel','Pre-\nRigged','480lb\nCable','UV\nSkirts','32oz\nWeight']},
  {id:'grid-02-jagahoo-system',productPath:P.jagPurple,shape:'roundrect',headL1:'CLIP ON.',headL2:'GO CATCH WAHOO.',benefits:['3 Wahoo\nColors','480lb\nCable','250lb\nLeader','16/24oz\nWeight','Rigged\n& Ready']},
  {id:'grid-03-chugger-system',productPath:P.chugTable,shape:'roundrect',headL1:'8 COLORS. $29.99.',headL2:'RIGGED.',benefits:['Dual\nHeads','8\nColors','150lb\nLeader','8/0\nMustad','Bait\nSpring']},
  {id:'grid-04-spread-builder',productPath:P.axis,shape:'roundrect',headL1:'STOP ASSEMBLING.',headL2:'START FISHING.',benefits:['Lure\nKit','Cable\nRig','Shock\nLeader','Trolling\nWeight','Ready\nTo Fish']},
];

const compareAds = [
  {id:'compare-01-epic-axis-vs-diy',productPath:P.axis,shape:'roundrect',ourLabel:'Epic Axis Kit',theirLabel:'Typical\nDIY Rig',rows:[{us:'480lb Stainless Cable',them:'Mono Leader'},{us:'Pre-Rigged & Tested',them:'Crimped In A Parking Lot'},{us:'UV Double Skirts',them:'Single Generic Skirt'},{us:'$84.99 Complete Kit',them:'$90+ In Loose Parts'}]},
  {id:'compare-02-jagahoo-vs-diy',productPath:P.jagPurple,shape:'roundrect',ourLabel:'Jagahoo Kit',theirLabel:'Typical\nDIY Build',rows:[{us:'480lb Stainless Cable',them:'Aluminum Crimps On Mono'},{us:'3 Wahoo-Proven Colors',them:'Whatever Was On Sale'},{us:'250lb Hi-Catch Leader',them:'Bargain Fluorocarbon'},{us:'Clip On & Go',them:'45 Min Rigging Session'}]},
  {id:'compare-03-chugger-vs-bare',productPath:P.chugBlue,shape:'roundrect',ourLabel:'Bait Chugger',theirLabel:'Typical\nBare Bait',rows:[{us:'Bubble Trail Triggers Strikes',them:'Silent Dead Drag'},{us:'Dual Chugger Heads',them:'No Action At All'},{us:'150lb Rigged Leader',them:'DIY Rigging Required'},{us:'$29.99 Ready To Fish',them:'Hook + Leader + Hope'}]},
];

async function main() {
  const warmLogo = await prepareLogo('warm');
  const darkLogo = await prepareLogo('dark');
  const DB = '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/lures/ad-templates';

  // LMNT Product
  console.log('--- LMNT Product (10) ---');
  mkdirSync(`${DB}/lmnt-product`, {recursive:true});
  for (const ad of lmntAds) {
    const t0=Date.now();
    const buf = await renderLmnt(ad, warmLogo);
    writeFileSync(`${DB}/lmnt-product/${ad.id}.png`, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }

  // Contrarian Hook (now on warm bg — use warm logo)
  console.log('--- Contrarian Hook (4) ---');
  mkdirSync(`${DB}/contrarian-hook`, {recursive:true});
  for (const ad of hookAds) {
    const t0=Date.now();
    const buf = await renderHook(ad, warmLogo);
    writeFileSync(`${DB}/contrarian-hook/${ad.id}.png`, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }

  // Benefit Grid (now on warm bg — use warm logo)
  console.log('--- Benefit Grid (4) ---');
  mkdirSync(`${DB}/benefit-grid`, {recursive:true});
  for (const ad of gridAds) {
    const t0=Date.now();
    const buf = await renderGrid(ad, warmLogo);
    writeFileSync(`${DB}/benefit-grid/${ad.id}.png`, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }

  // Comparison Chart (blue left panel needs white logo)
  const compareLogo = await prepareLogo('dark');
  console.log('--- Comparison Chart (3) ---');
  mkdirSync(`${DB}/comparison-chart`, {recursive:true});
  for (const ad of compareAds) {
    const t0=Date.now();
    const buf = await renderCompare(ad, compareLogo);
    writeFileSync(`${DB}/comparison-chart/${ad.id}.png`, buf);
    console.log(`  ${ad.id}.png  (${(buf.length/1024).toFixed(0)} KB, ${Date.now()-t0}ms)`);
  }

  console.log(`\nDone. 21 ads in ${DB}/`);
}

main().catch(err => { console.error(err); process.exit(1); });
