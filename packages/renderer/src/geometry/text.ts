/**
 * Text measurement for StrikeFrame geometry system.
 * Uses per-font average character width ratios derived from published font metrics.
 */

import * as Rect from './rect.js';

export interface FontMetric {
  upper: number;
  mixed: number;
  narrow: number;
  lineHeight: number;
  capHeight: number;
  ascender: number;
  descender: number;
}

export interface MeasureWidthOpts {
  mode?: 'upper' | 'mixed' | 'narrow';
  letterSpacing?: number;
  fontWeight?: number;
}

export interface LineRect {
  text: string;
  rect: Rect.Rect;
  width: number;
}

export interface TextBlockResult {
  rect: Rect.Rect;
  lines: string[];
  lineRects: LineRect[];
  maxLineWidth: number;
  totalHeight: number;
  lineCount: number;
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  baseline: number;
}

export interface MeasureBlockParams {
  lines: string[];
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  x: number;
  y: number;
  align?: 'left' | 'center' | 'right';
  fontWeight?: number;
  letterSpacing?: number;
}

const FONT_METRICS: Record<string, FontMetric> = {
  'montserrat': { upper: 0.68, mixed: 0.58, narrow: 0.52, lineHeight: 1.2, capHeight: 0.72, ascender: 0.93, descender: 0.25 },
  'source sans pro': { upper: 0.62, mixed: 0.53, narrow: 0.48, lineHeight: 1.2, capHeight: 0.66, ascender: 0.93, descender: 0.29 },
  'source sans 3': { upper: 0.62, mixed: 0.53, narrow: 0.48, lineHeight: 1.2, capHeight: 0.66, ascender: 0.93, descender: 0.29 },
  'georgia': { upper: 0.64, mixed: 0.55, narrow: 0.50, lineHeight: 1.2, capHeight: 0.68, ascender: 0.91, descender: 0.24 },
  'arial': { upper: 0.63, mixed: 0.55, narrow: 0.49, lineHeight: 1.15, capHeight: 0.72, ascender: 0.91, descender: 0.21 },
  'times new roman': { upper: 0.60, mixed: 0.50, narrow: 0.45, lineHeight: 1.15, capHeight: 0.66, ascender: 0.89, descender: 0.22 },
  '_default': { upper: 0.62, mixed: 0.55, narrow: 0.48, lineHeight: 1.2, capHeight: 0.70, ascender: 0.92, descender: 0.24 },
};

const SPECIAL_WIDTHS: Record<string, number> = {
  '\u2605': 1.0,   // ★ star
  '\u2713': 0.7,   // ✓ checkmark
  '\u2717': 0.7,   // ✗ cross mark
  '\u2022': 0.4,   // bullet
  '\u2014': 0.8,   // em dash
  '\u2013': 0.5,   // en dash
  ' ': 0.27,
};

export function getFontMetrics(fontFamily?: string): FontMetric {
  if (!fontFamily) return FONT_METRICS['_default'];
  const primary = fontFamily.split(',')[0].trim().replace(/['"]/g, '').toLowerCase();
  return FONT_METRICS[primary] || FONT_METRICS['_default'];
}

export function classifyText(text: string): 'upper' | 'mixed' | 'narrow' {
  if (!text || text.length === 0) return 'mixed';
  let upperCount = 0;
  let digitPunctCount = 0;
  let alphaCount = 0;
  for (const ch of text) {
    if (ch >= 'A' && ch <= 'Z') { upperCount++; alphaCount++; }
    else if (ch >= 'a' && ch <= 'z') { alphaCount++; }
    else if ((ch >= '0' && ch <= '9') || ch === '$' || ch === '.' || ch === ',' || ch === '%') { digitPunctCount++; }
  }
  if (alphaCount > 0 && upperCount / alphaCount > 0.7) return 'upper';
  if (digitPunctCount > alphaCount) return 'narrow';
  return 'mixed';
}

export function measureWidth(text: string, fontSize: number, fontFamily?: string, opts: MeasureWidthOpts = {}): number {
  if (!text || text.length === 0) return 0;
  const metrics = getFontMetrics(fontFamily);
  const mode = opts.mode || classifyText(text);
  const baseRatio = metrics[mode] || metrics.mixed;

  let width = 0;
  for (const ch of text) {
    if (SPECIAL_WIDTHS[ch] != null) {
      width += SPECIAL_WIDTHS[ch] * fontSize;
    } else {
      width += baseRatio * fontSize;
    }
  }

  if (opts.fontWeight && opts.fontWeight >= 700) {
    width *= 1.04;
  }
  if (opts.letterSpacing) {
    width += opts.letterSpacing * text.length;
  }

  return Math.round(width);
}

export function measureBlock(params: MeasureBlockParams): TextBlockResult {
  const { lines, fontSize, fontFamily, x, y, align = 'left', fontWeight, letterSpacing } = params;
  const metrics = getFontMetrics(fontFamily);
  const lineHeightPx = params.lineHeight || Math.round(fontSize * metrics.lineHeight);
  const measureOpts: MeasureWidthOpts = { fontWeight, letterSpacing };

  const lineWidths = lines.map(line => measureWidth(line, fontSize, fontFamily, measureOpts));
  const maxLineWidth = Math.max(0, ...lineWidths);

  const firstLineTop = Math.round(fontSize * metrics.capHeight);
  const totalHeight = lines.length <= 1 ? firstLineTop : firstLineTop + (lines.length - 1) * lineHeightPx;

  const blockTop = Math.round(y - firstLineTop);
  let blockLeft: number;
  switch (align) {
    case 'center': blockLeft = Math.round(x - maxLineWidth / 2); break;
    case 'right': blockLeft = Math.round(x - maxLineWidth); break;
    default: blockLeft = x;
  }

  const rect = Rect.create(blockLeft, blockTop, maxLineWidth, totalHeight);

  const lineRects: LineRect[] = lines.map((line, i) => {
    const w = lineWidths[i];
    const lineY = blockTop + (i === 0 ? 0 : firstLineTop + (i - 1) * lineHeightPx + (lineHeightPx - firstLineTop));
    let lineX: number;
    switch (align) {
      case 'center': lineX = Math.round(x - w / 2); break;
      case 'right': lineX = Math.round(x - w); break;
      default: lineX = x;
    }
    return {
      text: line,
      rect: Rect.create(lineX, lineY, w, i === 0 ? firstLineTop : lineHeightPx),
      width: w,
    };
  });

  return {
    rect, lines, lineRects, maxLineWidth, totalHeight,
    lineCount: lines.length,
    fontSize,
    lineHeight: lineHeightPx,
    fontFamily: fontFamily || '_default',
    baseline: y,
  };
}

export function quickWidth(text: string, fontSize: number, fontFamily?: string): number {
  return measureWidth(text, fontSize, fontFamily);
}

export function charsForWidth(targetWidth: number, fontSize: number, fontFamily?: string, mode?: 'upper' | 'mixed' | 'narrow'): number {
  const metrics = getFontMetrics(fontFamily);
  const ratio = metrics[mode || 'mixed'];
  const charWidth = ratio * fontSize;
  return Math.floor(targetWidth / charWidth);
}
