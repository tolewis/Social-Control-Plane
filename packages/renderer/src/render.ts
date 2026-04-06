/**
 * StrikeFrame render pipeline — library module.
 *
 * Exports an async `render(config, options?)` function that returns
 * `{ image, layout, critique, warnings, config }`.
 * No file I/O — the caller handles reading configs and saving output.
 */

import sharp from 'sharp';
import * as Rect from './geometry/rect.js';
import * as Text from './geometry/text.js';
import * as SafeZone from './geometry/safezone.js';
import { buildPrimitiveOutputs, getPrimitiveRegistry } from './primitives/registry.js';
import { critique } from './critic/index.js';
import type { RenderHelpers, PrimitiveResult } from './primitives/types.js';
import type { CritiqueResult, LayoutSidecar, SpacingCheck } from './critic/index.js';
import type { LayoutElement } from './geometry/rect.js';

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------

export const PRESETS: Record<string, { width: number; height: number }> = {
  'landscape-banner': { width: 1600, height: 900 },
  'social-square': { width: 1080, height: 1080 },
  'social-portrait': { width: 1080, height: 1350 },
  'linkedin-landscape': { width: 1200, height: 627 },
  'google-landscape': { width: 1200, height: 628 },
  'google-portrait': { width: 960, height: 1200 },
  // Meta Ads export presets
  'meta-feed-square': { width: 1080, height: 1080 },
  'meta-feed-landscape': { width: 1200, height: 628 },
  'meta-story': { width: 1080, height: 1920 },
  'meta-carousel': { width: 1080, height: 1080 },
  'meta-reels-cover': { width: 1080, height: 1920 },
};

export interface LogoModeSpec {
  path: string;
  width: number;
  height: number;
  padding: number;
  background: { r: number; g: number; b: number; alpha: number };
}

const LOGO_MODE_DEFAULTS: Record<string, LogoModeSpec> = {
  'white-card-landscape': {
    path: '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/camera-strikeframe/tier1-ready/logo-landscape-1200x300-v2.png',
    width: 250, height: 66, padding: 8,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
  'transparent-full': {
    path: '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/brand-lifestyle/tier1-ready/TackleRoom 1.1.png',
    width: 220, height: 88, padding: 0,
    background: { r: 255, g: 255, b: 255, alpha: 0 },
  },
  'compact-square': {
    path: '/home/tlewis/Dropbox/Tim/TackleRoom/Creative/camera-strikeframe/tier1-ready/logo-square-1200x1200-v2.png',
    width: 132, height: 132, padding: 8,
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  },
};

const ICON_PATHS: Record<string, string> = {
  shield: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z',
  check: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z',
  wave: 'M2 12c1.5-2 3-3 4.5-1s3 1 4.5-1 3-3 4.5-1 3 1 4.5-1M2 17c1.5-2 3-3 4.5-1s3 1 4.5-1 3-3 4.5-1 3 1 4.5-1M2 7c1.5-2 3-3 4.5-1s3 1 4.5-1 3-3 4.5-1 3 1 4.5-1',
  anchor: 'M12 2a3 3 0 00-3 3c0 1.3.84 2.4 2 2.82V11H8v2h3v6.95A8 8 0 014 12H2a10 10 0 0010 10 10 10 0 0010-10h-2a8 8 0 01-7 7.95V13h3v-2h-3V7.82A3 3 0 0015 5a3 3 0 00-3-3zm0 2a1 1 0 110 2 1 1 0 010-2z',
  gear: 'M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z',
  arrow: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z',
  target: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-6a2 2 0 100 4 2 2 0 000-4z',
  fish: 'M12 20l-2-2c-3-3-8-6-8-10a4 4 0 018 0 4 4 0 018 0c0 4-5 7-8 10l1 1zM18 6a6 6 0 00-6 6c2.5-2.5 6-5 6-6z',
};

const PRESET_LAYOUT_ALIAS: Record<string, string> = {
  'google-landscape': 'linkedin-landscape',
  'google-portrait': 'social-portrait',
};

// ---------------------------------------------------------------------------
// 2. Helper functions (not exported)
// ---------------------------------------------------------------------------

function escapeXml(value = ''): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function presetDefault(preset: string, portraitValue: number, defaultValue: number): number {
  return preset === 'social-portrait' ? portraitValue : defaultValue;
}

function buildIconGlyphSvg(type: string, x: number, y: number, size: number, color: string): string {
  const pathData = ICON_PATHS[type] || ICON_PATHS.check;
  const scale = size / 24;
  const isStroke = type === 'wave';
  const fill = isStroke ? 'none' : color;
  const stroke = isStroke ? `stroke="${color}" stroke-width="2" stroke-linecap="round"` : '';
  return `<g transform="translate(${x},${y}) scale(${scale})"><path d="${pathData}" fill="${fill}" ${stroke}/></g>`;
}

function buildStarRatingSvg(x: number, y: number, stars: number, size: number, _cfg: any): string {
  const gap = Math.round(size * 0.25);
  const total = 5;
  const nodes: string[] = [];
  for (let i = 0; i < total; i++) {
    const sx = x + i * (size + gap);
    const color = i < stars ? '#FFD700' : 'rgba(255,255,255,0.2)';
    nodes.push(`<text x="${sx}" y="${y}" fill="${color}" font-size="${size}" font-family="Arial">\u2605</text>`);
  }
  return nodes.join('\n');
}

// ---------------------------------------------------------------------------
// 3. Config types & normalization (exported)
// ---------------------------------------------------------------------------

export interface NormalizedConfig {
  preset: string;
  template: string;
  width: number;
  height: number;
  backgroundPath: string | null;
  backgroundPosition: string | null;
  productPath: string | null;
  overlay: {
    leftOpacity: number; midOpacity: number; rightOpacity: number; vignetteBottom: number;
    leftColor: string; midColor: string; rightColor: string;
  };
  text: { headline: string; subhead: string; cta: string; footer: string };
  theme: Record<string, any>;
  typography: Record<string, any>;
  layout: Record<string, any>;
  productComposite: Record<string, any>;
  review: Record<string, any>;
  designIntent: any;
  constraintPolicy: any;
  productImage: any;
  logoPath: string | null;
  logoMode: string | null;
  logo: Record<string, any>;
  imageLayers: any[];
  shapes: any[];
  textLayers: any[];
  statBlocks: any[];
  dividers: any[];
  benefitStack: any;
  testimonial: any;
  splitReveal: any;
  offerFrame: any;
  comparisonTable: any;
  authorityBar: any;
  proofHero: any;
  badges: any[] | null;
  [key: string]: any;
}

export function normalizeConfig(raw: any): NormalizedConfig {
  const presetDims = PRESETS[raw.preset || 'landscape-banner'];
  if (!presetDims) throw new Error(`Unknown preset: ${raw.preset}`);

  const chosenPreset = PRESET_LAYOUT_ALIAS[raw.preset] || raw.preset || 'landscape-banner';

  const cfg: NormalizedConfig = {
    preset: chosenPreset,
    template: raw.template || 'banner',
    width: raw.width || presetDims.width,
    height: raw.height || presetDims.height,
    backgroundPath: raw.backgroundPath || null,
    backgroundPosition: raw.backgroundPosition || null,
    productPath: raw.productPath || null,
    overlay: Object.assign(
      { leftOpacity: 0.78, midOpacity: 0.32, rightOpacity: 0.08, vignetteBottom: 0.28, leftColor: '8,12,21', midColor: '12,20,35', rightColor: '18,32,52' },
      raw.overlay || {},
    ),
    text: Object.assign(
      { headline: 'Headline goes here', subhead: 'Subhead goes here', cta: 'LEARN MORE', footer: 'STRIKEFRAME' },
      raw.text || {},
    ),
    theme: Object.assign({
      headlineColor: '#ffffff', subheadColor: '#c8d8e8', footerColor: '#8fa8c0', ctaTextColor: '#ffffff',
      ctaFill: 'rgba(255,255,255,0.28)', ctaStroke: 'rgba(255,255,255,0.50)', gradientStart: '#0b2a40', gradientEnd: '#1f6b8f',
      badgeFill: 'rgba(255,255,255,0.16)', badgeStroke: 'rgba(255,255,255,0.24)', badgeTextColor: '#ffffff',
      productCircleFill: 'rgba(255,255,255,0.94)', productShadowColor: '0,0,0', textPanelFill: 'rgba(255,255,255,0.08)', textPanelStroke: 'rgba(255,255,255,0.16)',
    }, raw.theme || {}),
    typography: Object.assign({
      headlineFontFamily: 'Montserrat, Arial, sans-serif', bodyFontFamily: 'Source Sans Pro, Arial, sans-serif',
      headlineWeight: 700, subheadWeight: 400, ctaWeight: 700, footerWeight: 600,
      headlineSize: presetDefault(chosenPreset, 66, chosenPreset === 'linkedin-landscape' ? 58 : 78),
      subheadSize: presetDefault(chosenPreset, 30, chosenPreset === 'linkedin-landscape' ? 28 : 32),
      ctaSize: 28, footerSize: presetDefault(chosenPreset, 18, chosenPreset === 'linkedin-landscape' ? 18 : 21),
      subheadLineHeight: null,
      footerTracking: 3,
    }, raw.typography || {}),
    layout: Object.assign({
      personality: 'editorial-left', align: 'left', leftX: 120,
      headlineY: chosenPreset === 'social-portrait' ? 180 : (chosenPreset === 'linkedin-landscape' ? 140 : 168),
      subheadY: chosenPreset === 'social-portrait' ? 470 : (chosenPreset === 'linkedin-landscape' ? 320 : 392),
      ctaX: 132, ctaY: chosenPreset === 'social-portrait' ? 650 : (chosenPreset === 'linkedin-landscape' ? 466 : 560),
      footerY: chosenPreset === 'social-portrait' ? presetDims.height - 84 : (chosenPreset === 'linkedin-landscape' ? 565 : presetDims.height - 88),
      maxHeadlineChars: chosenPreset === 'social-portrait' ? 18 : (chosenPreset === 'linkedin-landscape' ? 24 : 22),
      maxSubheadChars: chosenPreset === 'social-portrait' ? 28 : (chosenPreset === 'linkedin-landscape' ? 46 : 42),
      ctaWidth: chosenPreset === 'linkedin-landscape' ? 300 : 274, ctaHeight: 64, ctaRectX: 96,
      ctaRectY: chosenPreset === 'social-portrait' ? 612 : (chosenPreset === 'linkedin-landscape' ? 428 : 522),
      ctaGroup: null,
      panelX: 80, panelY: chosenPreset === 'social-portrait' ? 110 : 90,
      panelWidth: chosenPreset === 'social-portrait' ? 840 : (chosenPreset === 'linkedin-landscape' ? 700 : 760),
      panelHeight: chosenPreset === 'social-portrait' ? 760 : (chosenPreset === 'linkedin-landscape' ? 390 : 600),
      minHeadlineCtaGap: 40,
    }, raw.layout || {}),
    productComposite: Object.assign({
      enabled: raw.template === 'product-composite',
      circleDiameter: chosenPreset === 'social-portrait' ? 360 : 300,
      circleX: chosenPreset === 'social-portrait' ? presetDims.width - 420 : presetDims.width - 380,
      circleY: chosenPreset === 'social-portrait' ? 260 : 180, shadowOpacity: 0.16,
      productWidth: chosenPreset === 'social-portrait' ? 260 : 230, productOffsetX: 35, productOffsetY: 35,
      badgeText: 'PRODUCT',
      badgeX: chosenPreset === 'social-portrait' ? presetDims.width - 360 : presetDims.width - 330,
      badgeY: chosenPreset === 'social-portrait' ? 180 : 120,
    }, raw.productComposite || {}),
    review: Object.assign({ enforcePanelFit: true }, raw.review || {}),
    designIntent: raw.designIntent || null,
    constraintPolicy: raw.constraintPolicy || null,
    productImage: raw.productImage || null,
    logoPath: raw.logoPath || null,
    logoMode: raw.logoMode || null,
    logo: Object.assign({
      enabled: !!raw.logoPath,
      width: 120, height: 120,
      x: null as number | null, y: null as number | null,
      opacity: 0.85,
    }, raw.logo || {}),
    imageLayers: Array.isArray(raw.imageLayers) ? raw.imageLayers : [],
    shapes: Array.isArray(raw.shapes) ? raw.shapes : [],
    textLayers: Array.isArray(raw.textLayers) ? raw.textLayers : [],
    statBlocks: Array.isArray(raw.statBlocks) ? raw.statBlocks : [],
    dividers: Array.isArray(raw.dividers) ? raw.dividers : [],
    benefitStack: raw.benefitStack || null,
    testimonial: raw.testimonial || null,
    splitReveal: raw.splitReveal || null,
    offerFrame: raw.offerFrame || null,
    comparisonTable: raw.comparisonTable || null,
    authorityBar: raw.authorityBar || null,
    proofHero: raw.proofHero || null,
    badges: Array.isArray(raw.badges) ? raw.badges : null,
  };

  // --- enforcePanelFit for split-card ---
  if (cfg.review.enforcePanelFit && cfg.layout.personality === 'split-card') {
    const panelPad = 40;
    const panelLeft = cfg.layout.panelX + panelPad;
    const panelTop = cfg.layout.panelY + panelPad;
    const estHeadlineTop = cfg.layout.headlineY - Math.round(cfg.typography.headlineSize * 0.82);
    if (estHeadlineTop < panelTop) cfg.layout.headlineY += (panelTop - estHeadlineTop);
    if (cfg.layout.ctaRectX < panelLeft) {
      const shift = panelLeft - cfg.layout.ctaRectX;
      cfg.layout.ctaRectX += shift;
      cfg.layout.ctaX += shift;
    }
    if (cfg.layout.leftX < panelLeft) cfg.layout.leftX = panelLeft;
    const headlineLines = wrapText(cfg.text.headline, cfg.layout.maxHeadlineChars);
    const subheadLines = wrapText(cfg.text.subhead, cfg.layout.maxSubheadChars);
    const estHeadlineW = Math.max(
      ...headlineLines.map((l: string) =>
        Text.measureWidth(l, cfg.typography.headlineSize, cfg.typography.headlineFontFamily, { fontWeight: cfg.typography.headlineWeight }),
      ),
    );
    const estSubheadW = Math.max(
      ...subheadLines.map((l: string) =>
        Text.measureWidth(l, cfg.typography.subheadSize, cfg.typography.bodyFontFamily),
      ),
    );
    const maxTextRight = cfg.layout.leftX + Math.max(estHeadlineW, estSubheadW, cfg.layout.ctaWidth);
    const requiredWidth = maxTextRight - cfg.layout.panelX + panelPad;
    const maxPanelWidth = cfg.width - cfg.layout.panelX - 40;
    if (requiredWidth > cfg.layout.panelWidth) cfg.layout.panelWidth = Math.min(requiredWidth, maxPanelWidth);
    const estimatedPanelBottom = cfg.layout.ctaRectY + cfg.layout.ctaHeight + 40;
    const requiredHeight = estimatedPanelBottom - cfg.layout.panelY;
    if (requiredHeight > cfg.layout.panelHeight) cfg.layout.panelHeight = requiredHeight;
  }

  // --- minHeadlineCtaGap enforcement ---
  {
    const minGap = cfg.layout.minHeadlineCtaGap;
    const headlineLines = wrapText(cfg.text.headline, cfg.layout.maxHeadlineChars);
    const headlineStep = presetDims.height >= 1350 ? 82 : (chosenPreset === 'linkedin-landscape' ? 68 : 88);
    const headlineEstHeight = Math.round(
      cfg.typography.headlineSize + ((Math.max(headlineLines.length, 1) - 1) * headlineStep),
    );
    const headlineTop = Math.round(cfg.layout.headlineY - cfg.typography.headlineSize * 0.82);
    const headlineBottom = headlineTop + headlineEstHeight;

    const gap = cfg.layout.ctaRectY - headlineBottom;
    if (gap < minGap) {
      const deficit = minGap - gap;
      const safeZoneBottom = cfg.height - 40 - cfg.layout.ctaHeight;
      const newCtaRectY = cfg.layout.ctaRectY + deficit;
      if (newCtaRectY <= safeZoneBottom) {
        cfg.layout.ctaRectY = newCtaRectY;
        cfg.layout.ctaY = newCtaRectY + Math.round(cfg.layout.ctaHeight / 2);
      } else {
        cfg.layout.headlineY -= deficit;
      }
    }
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// 4. SVG builders (not exported)
// ---------------------------------------------------------------------------

function buildOverlaySvg(cfg: NormalizedConfig): Buffer {
  const { width, height, overlay } = cfg;
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(${overlay.leftColor},${overlay.leftOpacity})"/>
          <stop offset="58%" stop-color="rgba(${overlay.midColor},${overlay.midOpacity})"/>
          <stop offset="100%" stop-color="rgba(${overlay.rightColor},${overlay.rightOpacity})"/>
        </linearGradient>
        <linearGradient id="vignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.08)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,${overlay.vignetteBottom})"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect width="100%" height="100%" fill="url(#vignette)"/>
    </svg>`);
}

function getPrimaryRegion(cfg: NormalizedConfig): { left: number; top: number; right: number; bottom: number } {
  return cfg.layout.personality === 'split-card'
    ? { left: cfg.layout.panelX, top: cfg.layout.panelY, right: cfg.layout.panelX + cfg.layout.panelWidth, bottom: cfg.layout.panelY + cfg.layout.panelHeight }
    : { left: 0, top: 0, right: cfg.width, bottom: cfg.height };
}

function getCtaGeometry(cfg: NormalizedConfig): { rectX: number; rectY: number; textX: number; textY: number; textAnchor: string } {
  const isCentered = cfg.layout.personality === 'centered-hero' || cfg.layout.align === 'center';
  const group = cfg.layout.ctaGroup;
  if (group) {
    const region = group.relativeTo === 'canvas'
      ? { left: 0, top: 0, right: cfg.width, bottom: cfg.height }
      : getPrimaryRegion(cfg);
    const padX = group.offsetX || 0;
    const padY = group.offsetY || 0;
    let rectX = region.left + padX;
    if (group.anchorX === 'center') rectX = Math.round((region.left + region.right - cfg.layout.ctaWidth) / 2) + padX;
    if (group.anchorX === 'right') rectX = region.right - cfg.layout.ctaWidth - padX;
    let rectY = region.top + padY;
    if (group.anchorY === 'middle') rectY = Math.round((region.top + region.bottom - cfg.layout.ctaHeight) / 2) + padY;
    if (group.anchorY === 'bottom') rectY = region.bottom - cfg.layout.ctaHeight - padY;
    const textX = rectX + (group.textAlign === 'center' || isCentered ? Math.round(cfg.layout.ctaWidth / 2) : (group.textInsetX || 24));
    const textY = rectY + Math.round(cfg.layout.ctaHeight / 2) + (group.textOffsetY || 0);
    return {
      rectX, rectY, textX, textY,
      textAnchor: (group.textAlign === 'center' || isCentered) ? 'middle' : ((group.textAlign === 'right') ? 'end' : 'start'),
    };
  }
  const rectX = isCentered ? Math.round((cfg.width - cfg.layout.ctaWidth) / 2) : cfg.layout.ctaRectX;
  return {
    rectX,
    rectY: cfg.layout.ctaRectY,
    textX: rectX + Math.round(cfg.layout.ctaWidth / 2),
    textY: cfg.layout.ctaRectY + Math.round(cfg.layout.ctaHeight / 2),
    textAnchor: 'middle',
  };
}

function buildPrimaryTextSvg(cfg: NormalizedConfig): Buffer {
  const { width, text, layout, theme, typography } = cfg;
  const headlineLines = wrapText(text.headline, layout.maxHeadlineChars);
  const subheadLines = wrapText(text.subhead, layout.maxSubheadChars);
  const headlineStep = cfg.preset === 'social-portrait' ? 82 : (cfg.preset === 'linkedin-landscape' ? 68 : 88);
  const subheadStep = typography.subheadLineHeight || (cfg.preset === 'linkedin-landscape' ? 34 : Math.round(typography.subheadSize * 1.22));
  const isCentered = layout.personality === 'centered-hero' || layout.align === 'center';
  const headlineAnchor = isCentered ? 'middle' : 'start';
  const headlineX = isCentered ? Math.round(width / 2) : layout.leftX;
  const subheadX = headlineX;
  const footerX = headlineX;
  const cta = getCtaGeometry(cfg);
  const panelEnabled = theme.textPanelFill && theme.textPanelFill !== 'none';
  let panel = '';
  if (layout.personality === 'split-card' && panelEnabled) {
    panel = `<rect x="${layout.panelX}" y="${layout.panelY}" width="${layout.panelWidth}" height="${layout.panelHeight}" rx="36" fill="${theme.textPanelFill}" stroke="${theme.textPanelStroke || 'none'}" />`;
  } else if (layout.showPanel && panelEnabled && layout.panelWidth && layout.panelHeight) {
    const panelX = layout.panelX != null ? layout.panelX : Math.round((cfg.width - layout.panelWidth) / 2);
    const panelY = layout.panelY != null ? layout.panelY : Math.round(layout.headlineY - 60);
    panel = `<rect x="${panelX}" y="${panelY}" width="${layout.panelWidth}" height="${layout.panelHeight}" rx="36" fill="${theme.textPanelFill}" stroke="${theme.textPanelStroke || 'none'}" />`;
  }
  const headlineTspans = headlineLines.map((line: string, i: number) => `<tspan x="${headlineX}" dy="${i === 0 ? 0 : headlineStep}">${escapeXml(line)}</tspan>`).join('');
  const subheadTspans = subheadLines.map((line: string, i: number) => `<tspan x="${subheadX}" dy="${i === 0 ? 0 : subheadStep}">${escapeXml(line)}</tspan>`).join('');
  return Buffer.from(`
    <svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">
      ${panel}
      <rect x="${cta.rectX}" y="${cta.rectY}" width="${layout.ctaWidth}" height="${layout.ctaHeight}" rx="${layout.ctaRadius || 29}" fill="${theme.ctaFill}" stroke="${theme.ctaStroke}" />
      <text x="${headlineX}" y="${layout.headlineY}" text-anchor="${headlineAnchor}" fill="${theme.headlineColor}" font-size="${typography.headlineSize}" font-family="${typography.headlineFontFamily}" font-weight="${typography.headlineWeight}">${headlineTspans}</text>
      <text x="${subheadX}" y="${layout.subheadY}" text-anchor="${headlineAnchor}" fill="${theme.subheadColor}" font-size="${typography.subheadSize}" font-family="${typography.bodyFontFamily}" font-weight="${typography.subheadWeight}">${subheadTspans}</text>
      <text x="${cta.textX}" y="${cta.textY}" dy="0.35em" text-anchor="${cta.textAnchor}" fill="${theme.ctaTextColor}" font-size="${typography.ctaSize}" font-family="${typography.bodyFontFamily}" font-weight="${typography.ctaWeight}">${escapeXml(text.cta).replace(/\u2605+/g, (m: string) => `<tspan fill="#FFD700">${m}</tspan>`)}</text>
      ${cfg.logo && cfg.logo.enabled ? '' : `<text x="${footerX}" y="${layout.footerY}" text-anchor="${headlineAnchor}" fill="${theme.footerColor}" font-size="${typography.footerSize}" font-family="${typography.bodyFontFamily}" font-weight="${typography.footerWeight}" letter-spacing="${typography.footerTracking}">${escapeXml(text.footer)}</text>`}
    </svg>`);
}

function buildBadgesSvg(cfg: NormalizedConfig): Buffer | null {
  if (!cfg.badges || !cfg.badges.length) return null;
  const nodes = cfg.badges.map((b: any) => {
    const fontSize = b.fontSize || 16;
    const text = String(b.text || '').trim();
    const textLen = text.length;
    const padX = b.paddingX || 24;
    const bWidth = b.width || Math.max(100, Math.round(textLen * fontSize * 0.62 + padX * 2));
    const bHeight = b.height || 36;
    const rx = b.radius || Math.round(bHeight / 2);
    const fill = b.fill || 'rgba(232,93,58,0.92)';
    const textColor = b.textColor || '#ffffff';
    const fontFamily = b.fontFamily || 'Montserrat, Arial, sans-serif';
    const fontWeight = b.fontWeight || 700;
    const textX = (b.x || 0) + Math.round(bWidth / 2);
    const textY = (b.y || 0) + Math.round(bHeight / 2);
    return `<rect x="${b.x || 0}" y="${b.y || 0}" width="${bWidth}" height="${bHeight}" rx="${rx}" fill="${fill}"/>` +
      `<text x="${textX}" y="${textY}" dy="0.35em" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-family="${fontFamily}" font-weight="${fontWeight}">${escapeXml(text)}</text>`;
  }).join('\n');
  return Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`);
}

function buildShapesSvg(cfg: NormalizedConfig): Buffer | null {
  if (!cfg.shapes.length) return null;
  const items = cfg.shapes.map((s: any) => {
    const fill = s.fill || 'rgba(255,255,255,0.15)';
    const stroke = s.stroke || 'none';
    const strokeWidth = s.strokeWidth || 0;
    const opacity = s.opacity == null ? 1 : s.opacity;
    if (s.type === 'ellipse') {
      const rx = (s.width || 100) / 2;
      const ry = (s.height || s.width || 100) / 2;
      return `<ellipse cx="${(s.x || 0) + rx}" cy="${(s.y || 0) + ry}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    }
    if (s.type === 'rectangle') {
      return `<rect x="${s.x || 0}" y="${s.y || 0}" width="${s.width || 100}" height="${s.height || 100}" rx="${s.radius || 0}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
    }
    return '';
  }).join('\n');
  return Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${items}</svg>`);
}

function buildTextLayersSvg(cfg: NormalizedConfig): Buffer | null {
  if (!cfg.textLayers.length) return null;
  const nodes = cfg.textLayers.map((t: any) => {
    const maxChars = t.maxChars || 26;
    const lines = wrapText(t.content || '', maxChars);
    const step = t.lineHeight || Math.round((t.fontSize || 28) * 1.15);
    const anchor = t.align === 'center' ? 'middle' : (t.align === 'right' ? 'end' : 'start');
    const x = t.x || 0;
    const y = t.y || 0;
    const tspans = lines.map((line: string, i: number) => `<tspan x="${x}" dy="${i === 0 ? 0 : step}">${escapeXml(line)}</tspan>`).join('');
    const shadow = t.shadow ? `<text x="${x + (t.shadow.dx || 2)}" y="${y + (t.shadow.dy || 2)}" text-anchor="${anchor}" fill="${t.shadow.color || 'rgba(0,0,0,0.35)'}" font-size="${t.fontSize || 28}" font-family="${t.fontFamily || cfg.typography.bodyFontFamily}" font-weight="${t.fontWeight || 600}">${tspans}</text>` : '';
    return `${shadow}<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${t.color || '#ffffff'}" font-size="${t.fontSize || 28}" font-family="${t.fontFamily || cfg.typography.bodyFontFamily}" font-weight="${t.fontWeight || 600}">${tspans}</text>`.replace(/\u2713/g, '<tspan fill="#4CAF50" font-weight="800">\u2713</tspan>');
  }).join('\n');
  return Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`);
}

function buildStatBlocksSvg(cfg: NormalizedConfig): Buffer | null {
  if (!cfg.statBlocks || !cfg.statBlocks.length) return null;
  const nodes = cfg.statBlocks.map((s: any) => {
    const x = s.x || 0;
    const y = s.y || 0;
    const valueSize = s.valueSize || 72;
    const labelSize = s.labelSize || 18;
    const valueColor = s.valueColor || '#ffffff';
    const labelColor = s.labelColor || 'rgba(255,255,255,0.6)';
    const valueWeight = s.valueWeight || 800;
    const labelWeight = s.labelWeight || 500;
    const valueFontFamily = s.valueFontFamily || cfg.typography.headlineFontFamily;
    const labelFontFamily = s.labelFontFamily || cfg.typography.bodyFontFamily;
    const anchor = s.align === 'center' ? 'middle' : (s.align === 'right' ? 'end' : 'start');
    const labelGap = s.labelGap || 8;
    const labelY = y + valueSize + labelGap;
    const labelTracking = s.labelTracking || 2;

    const accent = s.accent
      ? `<rect x="${s.accent.align === 'center' ? x - (s.accent.width || 40) / 2 : x}" y="${y - (s.accent.gap || 16) - (s.accent.height || 3)}" width="${s.accent.width || 40}" height="${s.accent.height || 3}" rx="${(s.accent.height || 3) / 2}" fill="${s.accent.color || 'rgba(255,255,255,0.3)'}"/>`
      : '';

    const bg = s.background
      ? `<rect x="${s.background.x || x - 20}" y="${s.background.y || y - 20}" width="${s.background.width || 200}" height="${s.background.height || valueSize + labelSize + labelGap + 40}" rx="${s.background.radius || 16}" fill="${s.background.fill || 'rgba(255,255,255,0.06)'}" stroke="${s.background.stroke || 'rgba(255,255,255,0.1)'}" stroke-width="${s.background.strokeWidth || 1}"/>`
      : '';

    return `${bg}${accent}<text x="${x}" y="${y + valueSize * 0.82}" text-anchor="${anchor}" fill="${valueColor}" font-size="${valueSize}" font-family="${valueFontFamily}" font-weight="${valueWeight}">${escapeXml(s.value)}</text><text x="${x}" y="${labelY + labelSize * 0.82}" text-anchor="${anchor}" fill="${labelColor}" font-size="${labelSize}" font-family="${labelFontFamily}" font-weight="${labelWeight}" letter-spacing="${labelTracking}">${escapeXml((s.label || '').toUpperCase())}</text>`;
  }).join('\n');
  return Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`);
}

function buildDividersSvg(cfg: NormalizedConfig): Buffer | null {
  if (!cfg.dividers || !cfg.dividers.length) return null;
  const nodes = cfg.dividers.map((d: any) => {
    if (d.type === 'vertical') {
      return `<rect x="${d.x || 0}" y="${d.y || 0}" width="${d.width || 1}" height="${d.height || 100}" rx="${(d.width || 1) / 2}" fill="${d.color || 'rgba(255,255,255,0.12)'}"/>`;
    }
    return `<rect x="${d.x || 0}" y="${d.y || 0}" width="${d.width || 100}" height="${d.height || 1}" rx="${(d.height || 1) / 2}" fill="${d.color || 'rgba(255,255,255,0.12)'}"/>`;
  }).join('\n');
  return Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`);
}

function buildCompositeSvg(cfg: NormalizedConfig): Buffer | null {
  const { productComposite, theme, typography } = cfg;
  if (!productComposite.enabled) return null;
  const d = productComposite.circleDiameter;
  const shadowFill = String(theme.productShadowColor).startsWith('rgb')
    ? theme.productShadowColor
    : `rgba(${theme.productShadowColor},${productComposite.shadowOpacity})`;
  const badgeLabel = escapeXml(productComposite.badgeText);
  const badgeWidth = Math.max(170, Math.round(badgeLabel.length * 11 + 48));
  const badgeTextX = productComposite.badgeX + Math.round(badgeWidth / 2);
  return Buffer.from(`
    <svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${productComposite.circleX + d / 2}" cy="${productComposite.circleY + d / 2 + 20}" r="${d / 2}" fill="${shadowFill}" />
      <circle cx="${productComposite.circleX + d / 2}" cy="${productComposite.circleY + d / 2}" r="${d / 2}" fill="${theme.productCircleFill}" />
      <rect x="${productComposite.badgeX}" y="${productComposite.badgeY}" width="${badgeWidth}" height="42" rx="21" fill="${theme.badgeFill}" stroke="${theme.badgeStroke}" />
      <text x="${badgeTextX}" y="${productComposite.badgeY + 28}" text-anchor="middle" fill="${theme.badgeTextColor}" font-size="20" font-family="${typography.bodyFontFamily}" font-weight="700">${badgeLabel}</text>
    </svg>`);
}

// ---------------------------------------------------------------------------
// 5. Image processing (not exported)
// ---------------------------------------------------------------------------

async function removeWhiteBackground(inputBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(inputBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixels = Buffer.from(data);
  const total = width * height;
  const minCh = (k: number): number => { const i = k * channels; return Math.min(pixels[i], pixels[i + 1], pixels[i + 2]); };

  // Analyze edge pixels to pick strategy
  const edgeBri: number[] = [];
  for (let x = 0; x < width; x++) {
    for (const y of [0, 1, height - 1, height - 2]) edgeBri.push(minCh(y * width + x));
  }
  for (let y = 2; y < height - 2; y++) {
    for (const x of [0, 1, width - 1, width - 2]) edgeBri.push(minCh(y * width + x));
  }
  edgeBri.sort((a, b) => a - b);
  const p50 = edgeBri[Math.floor(edgeBri.length * 0.5)];

  if (p50 >= 245) {
    // Clean white background — flood fill from edges
    const threshold = 240;
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0, tail = 0;
    const isWhite = (k: number): boolean => minCh(k) >= threshold;
    const seed = (sx: number, sy: number): void => {
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
  } else {
    // Gradient/gray background — soft brightness mask
    const threshold = Math.max(p50 - 5, 200);
    const feather = 30;
    for (let k = 0; k < total; k++) {
      const b = minCh(k);
      if (b >= threshold) {
        pixels[k * channels + 3] = 0;
      } else if (b >= threshold - feather) {
        pixels[k * channels + 3] = Math.round(255 * (threshold - b) / feather);
      }
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

function resolveLogoLayer(cfg: NormalizedConfig): Record<string, any> | null {
  if (!cfg.logoMode) return null;
  const mode = LOGO_MODE_DEFAULTS[cfg.logoMode];
  if (!mode) return null;
  const marginX = (cfg.logo && cfg.logo.x != null) ? cfg.logo.x : 60;
  const marginY = (cfg.logo && cfg.logo.y != null) ? cfg.logo.y : 40;
  const placement = (cfg.logo && cfg.logo.placement) || 'default';
  const corner = (cfg.logo && cfg.logo.corner) || 'top-left';
  return Object.assign({}, mode, cfg.logo || {}, { x: marginX, y: marginY, fit: (cfg.logo && cfg.logo.fit) || 'contain', placement, corner });
}

async function buildCornerAnchorLogo(cfg: NormalizedConfig, logoResolved: Record<string, any> | null): Promise<{
  panelBuf: Buffer; panelX: number; panelY: number; panelW: number; panelH: number;
  logoBuf: Buffer; logoX: number; logoY: number; logoW: number; logoH: number;
} | null> {
  if (!logoResolved || logoResolved.placement !== 'corner-anchor') return null;
  const logoW = logoResolved.width || 250;
  const logoH = logoResolved.height || 66;
  const clearSpace = logoResolved.clearSpace || Math.round(logoH * 0.2);
  const corner = logoResolved.corner || 'top-left';
  const pad = clearSpace;
  const bgColor = logoResolved.background || { r: 255, g: 255, b: 255, alpha: 1 };
  const radius = logoResolved.panelRadius || 0;

  const trimmedBuf = await sharp(logoResolved.path).trim().ensureAlpha().png().toBuffer();
  const logoBuf = await sharp(trimmedBuf)
    .resize({ width: logoW, height: logoH, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().png().toBuffer();
  const logoMeta = await sharp(logoBuf).metadata();
  const actualLogoW = logoMeta.width!;
  const actualLogoH = logoMeta.height!;
  const panelW = pad + actualLogoW + pad;
  const panelH = pad + actualLogoH + pad;
  let panelX = 0, panelY = 0;
  let lx = 0, ly = 0;

  if (corner === 'top-left') {
    panelX = 0; panelY = 0; lx = pad; ly = pad;
  } else if (corner === 'top-right') {
    panelX = cfg.width - panelW; panelY = 0; lx = panelX + pad; ly = pad;
  } else if (corner === 'bottom-left') {
    panelX = 0; panelY = cfg.height - panelH; lx = pad; ly = panelY + pad;
  } else if (corner === 'bottom-right') {
    panelX = cfg.width - panelW; panelY = cfg.height - panelH; lx = panelX + pad; ly = panelY + pad;
  }

  const r = radius || Math.round(Math.min(panelW, panelH) * 0.08);
  let panelPath: string;
  if (corner === 'top-left') {
    panelPath = `M0,0 H${panelW} V${panelH - r} Q${panelW},${panelH} ${panelW - r},${panelH} H0 Z`;
  } else if (corner === 'top-right') {
    panelPath = `M0,0 H${panelW} V${panelH} H${r} Q0,${panelH} 0,${panelH - r} V0 Z`;
  } else if (corner === 'bottom-left') {
    panelPath = `M0,0 V${panelH} H${panelW} V${r} Q${panelW},0 ${panelW - r},0 H0 Z`;
  } else {
    panelPath = `M${r},0 H${panelW} V${panelH} H0 V0 Q0,0 ${r},0 Z`;
  }

  const panelSvg = Buffer.from(`<svg width="${panelW}" height="${panelH}" xmlns="http://www.w3.org/2000/svg"><path d="${panelPath}" fill="rgba(${bgColor.r || 255},${bgColor.g || 255},${bgColor.b || 255},${bgColor.alpha != null ? bgColor.alpha : 1})"/></svg>`);

  return {
    panelBuf: panelSvg,
    panelX, panelY, panelW, panelH,
    logoBuf, logoX: lx, logoY: ly,
    logoW: actualLogoW, logoH: actualLogoH,
  };
}

async function buildFramedImageLayer(img: any): Promise<Buffer | null> {
  if (!img || !img.path) return null;
  const w = img.width || 400;
  const h = img.height || 400;
  const pad = img.padding || 20;
  const background = img.background || { r: 255, g: 255, b: 255, alpha: 1 };
  const fit = img.fit || 'contain';
  const radius = img.radius || 0;
  const stroke = img.stroke || null;
  const strokeWidth = img.strokeWidth || 0;
  const shadow = img.shadow || null;

  let resizedBuf = await sharp(img.path)
    .resize({ width: w - pad * 2, height: h - pad * 2, fit: fit as any, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png().toBuffer();
  const meta = await sharp(resizedBuf).metadata();

  if (radius > 0) {
    const innerRadius = Math.max(0, radius - pad);
    const mask = Buffer.from(`<svg width="${meta.width}" height="${meta.height}" xmlns="http://www.w3.org/2000/svg"><rect width="${meta.width}" height="${meta.height}" rx="${innerRadius}" ry="${innerRadius}" fill="#fff"/></svg>`);
    resizedBuf = await sharp(resizedBuf).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  }

  const layers: Array<{ input: Buffer; left?: number; top?: number; blend?: string }> = [];
  if (shadow) {
    const shadowSvg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${shadow.x || 0}" y="${shadow.y || 10}" width="${w - (shadow.insetX || 0)}" height="${h - (shadow.insetY || 0)}" rx="${radius}" fill="${shadow.color || 'rgba(0,0,0,0.18)'}"/></svg>`);
    layers.push({ input: shadowSvg, left: 0, top: 0 });
  }
  layers.push({ input: resizedBuf, left: Math.round((w - meta.width!) / 2), top: Math.round((h - meta.height!) / 2) });
  if (stroke && strokeWidth > 0) {
    const strokeSvg = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect x="${Math.round(strokeWidth / 2)}" y="${Math.round(strokeWidth / 2)}" width="${w - strokeWidth}" height="${h - strokeWidth}" rx="${Math.max(0, radius - Math.round(strokeWidth / 2))}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/></svg>`);
    layers.push({ input: strokeSvg, left: 0, top: 0 });
  }
  return sharp({ create: { width: w, height: h, channels: 4, background } })
    .composite(layers as sharp.OverlayOptions[])
    .png().toBuffer();
}

async function buildProductLayer(cfg: NormalizedConfig): Promise<Buffer | null> {
  if (!cfg.productComposite.enabled || !cfg.productPath) return null;
  const d = cfg.productComposite.circleDiameter;
  const r = d / 2;
  const inset = 20;
  const fitSize = d - inset * 2;
  let productBuf = await sharp(cfg.productPath)
    .resize({ width: fitSize, height: fitSize, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  productBuf = await removeWhiteBackground(productBuf);
  const prodMeta = await sharp(productBuf).metadata();
  const centered = await sharp({
    create: { width: d, height: d, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: productBuf,
      left: Math.round((d - prodMeta.width!) / 2),
      top: Math.round((d - prodMeta.height!) / 2),
    }])
    .png().toBuffer();
  const circleMask = Buffer.from(
    `<svg width="${d}" height="${d}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`,
  );
  const maskBuf = await sharp(circleMask).resize(d, d).png().toBuffer();
  return sharp(centered)
    .composite([{ input: maskBuf, blend: 'dest-in' }])
    .png().toBuffer();
}

// ---------------------------------------------------------------------------
// 6. Text block estimation
// ---------------------------------------------------------------------------

interface TextBlockEstimate {
  left: number; top: number; width: number; height: number;
  right: number; bottom: number; lines: number; maxChars: number;
  _measured: boolean; _lineRects: Text.LineRect[]; _maxLineWidth: number;
  [key: string]: any;
}

function estimateTextBlock(params: {
  lines: string[]; fontSize: number; lineStep: number; x: number; y: number;
  align?: string; maxChars?: number; fontFamily?: string; fontWeight?: number;
}): TextBlockEstimate {
  const block = Text.measureBlock({
    lines: params.lines, fontSize: params.fontSize, fontFamily: params.fontFamily,
    lineHeight: params.lineStep,
    x: params.x, y: params.y,
    align: (params.align || 'left') as 'left' | 'center' | 'right',
    fontWeight: params.fontWeight,
  });
  return {
    left: block.rect.left, top: block.rect.top,
    width: block.rect.width, height: block.rect.height,
    right: block.rect.right, bottom: block.rect.bottom,
    lines: params.lines.length, maxChars: params.maxChars || 24,
    _measured: true, _lineRects: block.lineRects, _maxLineWidth: block.maxLineWidth,
  };
}

// ---------------------------------------------------------------------------
// 7. Layout sidecar builder (exported)
// ---------------------------------------------------------------------------

export function buildLayoutSidecar(
  cfg: NormalizedConfig,
  primitiveElements: LayoutElement[] = [],
  resolvedImageLayers: any[] = [],
): LayoutSidecar {
  const canvas = Rect.create(0, 0, cfg.width, cfg.height);
  const elements: LayoutElement[] = [];

  // Image layers
  const allImageLayers = [...(Array.isArray(cfg.imageLayers) ? cfg.imageLayers : []), ...resolvedImageLayers];
  allImageLayers.forEach((img: any, i: number) => {
    elements.push({ id: `imageLayer.${i + 1}`, type: 'image', rect: Rect.create(img.x || 0, img.y || 0, img.width || 0, img.height || 0) });
  });

  // Primitive elements
  elements.push(...primitiveElements);

  // Text layers
  if (Array.isArray(cfg.textLayers)) {
    cfg.textLayers.forEach((t: any, i: number) => {
      const lines = wrapText(t.content || '', t.maxChars || 26);
      const fontSize = t.fontSize || 28;
      const fontFamily = t.fontFamily || cfg.typography.bodyFontFamily;
      const step = t.lineHeight || Math.round(fontSize * 1.15);
      const widthVal = Math.max(...lines.map((line: string) => Text.measureWidth(line, fontSize, fontFamily)));
      const heightVal = Math.max(1, lines.length) * step;
      elements.push({ id: `textLayer.${i + 1}`, type: 'text', fontSize, rect: Rect.create(t.x || 0, (t.y || 0) - fontSize, Math.round(widthVal), Math.round(heightVal)) });
    });
  }

  // Primary text elements
  const isCenteredLayout = cfg.layout.personality === 'centered-hero' || cfg.layout.align === 'center';
  const textAlign = isCenteredLayout ? 'center' : 'left';
  const textX = isCenteredLayout ? Math.round(cfg.width / 2) : cfg.layout.leftX;

  const headlineLines = wrapText(cfg.text.headline, cfg.layout.maxHeadlineChars);
  const headlineStep = cfg.height >= 1350 ? 82 : (cfg.preset === 'linkedin-landscape' ? 68 : 88);
  const headlineBlock = estimateTextBlock({
    lines: headlineLines, fontSize: cfg.typography.headlineSize, lineStep: headlineStep,
    x: textX, y: cfg.layout.headlineY, align: textAlign,
    fontFamily: cfg.typography.headlineFontFamily, fontWeight: cfg.typography.headlineWeight,
  });
  elements.push({ id: 'headline', type: 'text', fontSize: cfg.typography.headlineSize, rect: Rect.fromObject(headlineBlock) });

  const subheadLines = wrapText(cfg.text.subhead, cfg.layout.maxSubheadChars);
  const subheadStep = cfg.typography.subheadLineHeight || (cfg.preset === 'linkedin-landscape' ? 34 : Math.round(cfg.typography.subheadSize * 1.22));
  const subheadBlock = estimateTextBlock({
    lines: subheadLines, fontSize: cfg.typography.subheadSize, lineStep: subheadStep,
    x: textX, y: cfg.layout.subheadY, align: textAlign,
    fontFamily: cfg.typography.bodyFontFamily,
  });
  elements.push({ id: 'subhead', type: 'text', fontSize: cfg.typography.subheadSize, rect: Rect.fromObject(subheadBlock) });

  const ctaGeom = getCtaGeometry(cfg);
  const ctaRect = Rect.create(ctaGeom.rectX, ctaGeom.rectY, cfg.layout.ctaWidth, cfg.layout.ctaHeight);
  elements.push({ id: 'cta', type: 'cta', fontSize: cfg.typography.ctaSize, rect: ctaRect });

  const footerBlock = estimateTextBlock({
    lines: [cfg.text.footer], fontSize: cfg.typography.footerSize, lineStep: cfg.typography.footerSize,
    x: textX, y: cfg.layout.footerY, align: textAlign,
    fontFamily: cfg.typography.bodyFontFamily, fontWeight: cfg.typography.footerWeight,
  });
  elements.push({ id: 'footer', type: 'text', fontSize: cfg.typography.footerSize, rect: Rect.fromObject(footerBlock) });

  // Badge elements
  if (Array.isArray(cfg.badges)) {
    cfg.badges.forEach((b: any, i: number) => {
      const bw = b.width || Text.measureWidth(b.text || '', b.fontSize || 16, 'Montserrat') + 24;
      const bh = b.height || (b.fontSize || 16) + 16;
      elements.push({ id: `badge.${i + 1}`, type: 'badge', rect: Rect.create(b.x || 0, b.y || 0, bw, bh) });
    });
  }

  // Logo element
  const logoResolved = resolveLogoLayer(cfg);
  if (logoResolved) {
    elements.push({ id: 'logo', type: 'logo', rect: Rect.create(logoResolved.x || 0, logoResolved.y || 0, logoResolved.width || 0, logoResolved.height || 0) });
  }

  // Gap analysis
  const headlineTop = headlineBlock.top;
  const headlineBottom = headlineBlock.bottom;
  const ctaTop = ctaGeom.rectY;
  const ctaBottom = ctaTop + cfg.layout.ctaHeight;
  const minGap = cfg.layout.minHeadlineCtaGap != null ? cfg.layout.minHeadlineCtaGap : 40;
  const actualGap = ctaTop - headlineBottom;

  // Safe-zone analysis
  const zones = SafeZone.getSafeZones(cfg.width, cfg.height, cfg.preset);
  const safeZoneCheck = SafeZone.checkAll(elements, zones);
  const mobileWarnings = SafeZone.mobileReadabilityCheck(elements, cfg.width);

  // Collision detection
  const collisions = Rect.findCollisions(elements);

  // Occupancy metrics
  const occupancyMetrics = Rect.computeOccupancy(elements, canvas);

  // Spacing analysis
  const spacingChecks: SpacingCheck[] = [];
  const hlSubGap = Rect.verticalGap(Rect.fromObject(headlineBlock), Rect.fromObject(subheadBlock));
  spacingChecks.push({ pair: ['headline', 'subhead'], gap: hlSubGap, min: 24, pass: hlSubGap >= 24 });
  const subCtaGap = Rect.verticalGap(Rect.fromObject(subheadBlock), ctaRect);
  spacingChecks.push({ pair: ['subhead', 'cta'], gap: subCtaGap, min: 24, pass: subCtaGap >= 24 });
  const ctaFooterGap = Rect.verticalGap(ctaRect, Rect.fromObject(footerBlock));
  spacingChecks.push({ pair: ['cta', 'footer'], gap: ctaFooterGap, min: 20, pass: ctaFooterGap >= 20 });
  spacingChecks.push({ pair: ['headline', 'cta'], gap: actualGap, min: minGap, pass: actualGap >= minGap });

  return {
    version: '1.5.1',
    canvas: { width: cfg.width, height: cfg.height, area: canvas.area },
    elements,
    safeZones: { violations: safeZoneCheck.violations },
    collisions: collisions.map(c => ({ a: c.a, b: c.b })),
    spacing: spacingChecks,
    occupancy: {
      occupancyRatio: occupancyMetrics.occupancyRatio,
      boundingBox: occupancyMetrics.boundingBox ? { height: occupancyMetrics.boundingBox.height } : null,
    },
    mobileReadability: mobileWarnings,
  };
}

// ---------------------------------------------------------------------------
// 8. Main render function (exported)
// ---------------------------------------------------------------------------

export interface RenderOptions {
  /** Override output format. Default: 'jpeg' */
  format?: 'jpeg' | 'png' | 'webp';
  /** JPEG quality 1-100. Default: 90 */
  quality?: number;
}

export interface RenderResult {
  /** Rendered image as Buffer */
  image: Buffer;
  /** Layout geometry sidecar */
  layout: LayoutSidecar;
  /** Critic quality scores */
  critique: CritiqueResult;
  /** Warnings collected during render */
  warnings: string[];
  /** Normalized config that was used */
  config: NormalizedConfig;
}

export async function render(rawConfig: any, options?: RenderOptions): Promise<RenderResult> {
  const cfg = normalizeConfig(rawConfig);
  const warnings: string[] = [];
  const format = options?.format || 'jpeg';
  const quality = options?.quality || 90;

  // Build helpers for primitive system
  const helpers: RenderHelpers = { wrapText, escapeXml, buildIconGlyphSvg, buildStarRatingSvg };

  // Run primitives
  const primitiveOutputs = buildPrimitiveOutputs(cfg, helpers);
  const resolvedPrimitiveImageLayers: any[] = [];
  const primitiveElements: LayoutElement[] = [];
  const activePrimitiveIds = new Set<string>();

  for (const po of primitiveOutputs) {
    if (po.id) activePrimitiveIds.add(po.id);
    if (Array.isArray(po.imageLayers)) resolvedPrimitiveImageLayers.push(...po.imageLayers);
    if (Array.isArray(po.elements)) primitiveElements.push(...po.elements);
    if (Array.isArray(po.warnings)) warnings.push(...po.warnings);
  }

  // Apply actionHero layout/typography overrides
  for (const po of primitiveOutputs) {
    if (po._layoutOverrides) {
      for (const [k, v] of Object.entries(po._layoutOverrides)) {
        cfg.layout[k] = v;
      }
    }
    if (po._typographyOverrides) {
      for (const [k, v] of Object.entries(po._typographyOverrides)) {
        cfg.typography[k] = v;
      }
    }
  }

  // Build composites array
  const composites: sharp.OverlayOptions[] = [];

  // Overlay
  composites.push({ input: buildOverlaySvg(cfg) });

  // Shapes
  const shapes = buildShapesSvg(cfg);
  if (shapes) composites.push({ input: shapes });

  // Dividers
  const dividers = buildDividersSvg(cfg);
  if (dividers) composites.push({ input: dividers });

  // Rectangular product image
  if (cfg.productImage) {
    const rectProduct = await buildFramedImageLayer(cfg.productImage);
    if (rectProduct) composites.push({ input: rectProduct, left: cfg.productImage.x || 0, top: cfg.productImage.y || 0 });
  }

  // Logo layer (non-corner-anchor, non-legacy)
  const derivedLogoLayer = resolveLogoLayer(cfg);
  if (derivedLogoLayer && derivedLogoLayer.placement !== 'corner-anchor') {
    const layer = await buildFramedImageLayer(derivedLogoLayer);
    if (layer) composites.push({ input: layer, left: derivedLogoLayer.x || 0, top: derivedLogoLayer.y || 0 });
  }

  // Primitive SVGs
  for (const po of primitiveOutputs) {
    if (po.svg) composites.push({ input: po.svg });
  }

  // Config image layers
  if (Array.isArray(cfg.imageLayers)) {
    for (const img of cfg.imageLayers) {
      const layer = await buildFramedImageLayer(img);
      if (layer) composites.push({ input: layer, left: img.x || 0, top: img.y || 0 });
    }
  }

  // Primitive image layers
  for (const img of resolvedPrimitiveImageLayers) {
    const layer = await buildFramedImageLayer(img);
    if (layer) composites.push({ input: layer, left: img.x || 0, top: img.y || 0 });
  }

  // Primary text
  composites.push({ input: buildPrimaryTextSvg(cfg) });

  // Text layers
  const textLayersSvg = buildTextLayersSvg(cfg);
  if (textLayersSvg) composites.push({ input: textLayersSvg });

  // Stat blocks
  const statBlocksSvg = buildStatBlocksSvg(cfg);
  if (statBlocksSvg) composites.push({ input: statBlocksSvg });

  // Badges
  const badgesSvg = buildBadgesSvg(cfg);
  if (badgesSvg) composites.push({ input: badgesSvg });

  // Product composite circle + badge SVG
  const compositeSvg = buildCompositeSvg(cfg);
  if (compositeSvg) composites.push({ input: compositeSvg });

  // Product layer (circle-masked)
  const productLayer = await buildProductLayer(cfg);
  if (productLayer) composites.push({ input: productLayer, left: cfg.productComposite.circleX, top: cfg.productComposite.circleY });

  // Corner-anchor logo
  const logoResolved = resolveLogoLayer(cfg);
  const cornerAnchor = await buildCornerAnchorLogo(cfg, logoResolved);
  if (cornerAnchor) {
    composites.push({ input: cornerAnchor.panelBuf, left: cornerAnchor.panelX, top: cornerAnchor.panelY });
    composites.push({ input: cornerAnchor.logoBuf, left: cornerAnchor.logoX, top: cornerAnchor.logoY });
  }

  // Legacy logo layer
  if (!cornerAnchor && cfg.logo.enabled && cfg.logoPath) {
    const logoW = cfg.logo.width || 120;
    const logoH = cfg.logo.height || 120;
    const logoBuf = await sharp(cfg.logoPath)
      .resize({ width: logoW, height: logoH, fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().png().toBuffer();
    const logoMeta = await sharp(logoBuf).metadata();
    const isCentered = cfg.layout.personality === 'centered-hero' || cfg.layout.align === 'center';
    const logoX = cfg.logo.x != null ? cfg.logo.x : (isCentered ? Math.round((cfg.width - logoMeta.width!) / 2) : cfg.layout.leftX);
    const logoY = cfg.logo.y != null ? cfg.logo.y : Math.round(cfg.layout.footerY - logoMeta.height! / 2);
    // White outer glow
    const glowRadius = cfg.logo.glowRadius || 12;
    const glowOpacity = cfg.logo.glowOpacity || 0.7;
    const glowBuf = await sharp(logoBuf)
      .extractChannel(3)
      .toColourspace('b-w')
      .linear(glowOpacity * 2.5, 0)
      .blur(glowRadius)
      .toBuffer();
    const glowW = logoMeta.width!;
    const glowH = logoMeta.height!;
    const glowLayer = await sharp({
      create: { width: glowW, height: glowH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    })
      .composite([{ input: glowBuf, blend: 'dest-in' }])
      .png().toBuffer();
    const extendedGlow = await sharp({
      create: { width: cfg.width, height: cfg.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: glowLayer, left: logoX, top: logoY }])
      .blur(glowRadius)
      .png().toBuffer();
    composites.push({ input: extendedGlow });
    composites.push({ input: logoBuf, left: logoX, top: logoY });
  }

  // Build base image
  let base: sharp.Sharp;
  if (cfg.backgroundPath) {
    base = sharp(cfg.backgroundPath)
      .resize(cfg.width, cfg.height, { fit: 'cover', position: cfg.backgroundPosition || 'center' })
      .modulate({ brightness: 0.82, saturation: 1.05 });
  } else {
    base = sharp({
      create: { width: cfg.width, height: cfg.height, channels: 3, background: { r: 11, g: 42, b: 64 } },
    }).composite([{
      input: Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${cfg.theme.gradientStart}"/><stop offset="100%" stop-color="${cfg.theme.gradientEnd}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`),
    }]);
  }

  // Apply all composites and encode
  let pipeline = base.composite(composites);
  let imageBuffer: Buffer;
  if (format === 'png') {
    imageBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  } else if (format === 'webp') {
    imageBuffer = await pipeline.webp({ quality }).toBuffer();
  } else {
    imageBuffer = await pipeline.jpeg({ quality }).toBuffer();
  }

  // Build layout sidecar
  const layout = buildLayoutSidecar(cfg, primitiveElements, resolvedPrimitiveImageLayers);

  // Run critic
  const critiqueResult = critique(layout);

  // Collect sidecar warnings into output
  if (layout.safeZones?.violations) {
    for (const v of layout.safeZones.violations) {
      if ((v as any).type === 'hard') warnings.push(`${v.id} violates safe zone by ${v.severity}px`);
    }
  }

  return {
    image: imageBuffer,
    layout,
    critique: critiqueResult,
    warnings,
    config: cfg,
  };
}
