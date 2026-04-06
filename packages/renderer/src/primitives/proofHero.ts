/**
 * ProofHero primitive — quote-led proof layout with stars, review screenshot, product image, and CTA.
 *
 * Variants:
 *   - 'quote-dominant' : Large quote, small product, proof-focused
 *   - 'review-dominant' : Review screenshot hero, quote secondary
 *   - 'balanced' : Equal weight quote and product
 */

import * as Rect from '../geometry/rect.js';
import type { LayoutElement } from '../geometry/rect.js';
import type { RenderHelpers, PrimitiveResult, VariantDescriptor } from './types.js';

const VARIANTS: Record<string, VariantDescriptor> = {
  'quote-dominant': { description: 'Large quote, small product, proof-focused' },
  'review-dominant': { description: 'Review screenshot hero, quote secondary' },
  'balanced': { description: 'Equal weight quote and product' },
};

function estimateTextWidth(text: string, fontSize: number): number {
  return Math.round(String(text || '').length * fontSize * 0.58);
}

interface QuoteLayout {
  quoteX: number;
  quoteY: number;
  lines: string[];
  quoteWidth: number;
  quoteHeight: number;
  quoteLineHeight: number;
  quoteMaxChars: number;
  quoteTop: number;
  quoteFontSize: number;
}

function resolveQuoteLayout(quote: string, p: any, helpers: RenderHelpers, canvasWidth: number): QuoteLayout {
  const { wrapText } = helpers;
  let fontSize: number = p.quoteSize || 64;
  const maxLines: number = p.maxQuoteLines || 3;
  const minChars: number = p.minQuoteMaxChars || 14;
  const maxCharsCap: number = p.maxQuoteMaxChars || 28;
  const quoteX: number = p.quoteX || 108;
  const maxWidth: number = p.maxQuoteWidth || Math.round(canvasWidth * 0.72);

  let bestChars: number = p.quoteMaxChars || minChars;
  let lines: string[] = wrapText(quote, bestChars);
  let bestWidth: number = Math.max(...lines.map(line => estimateTextWidth(line, fontSize)));

  const solveForFont = (): void => {
    bestChars = p.quoteMaxChars || minChars;
    lines = wrapText(quote, bestChars);
    bestWidth = Math.max(...lines.map(line => estimateTextWidth(line, fontSize)));
    for (let chars = bestChars; chars <= maxCharsCap; chars += 1) {
      const candidate = wrapText(quote, chars);
      const candidateWidth = Math.max(...candidate.map(line => estimateTextWidth(line, fontSize)));
      if (candidateWidth > maxWidth) break;
      if (candidate.length <= maxLines && candidateWidth >= bestWidth) {
        bestChars = chars;
        lines = candidate;
        bestWidth = candidateWidth;
      }
    }
  };

  solveForFont();
  const minQuoteSize: number = p.minQuoteSize || Math.max(54, fontSize - 10);
  while (lines.length > maxLines && fontSize > minQuoteSize) {
    fontSize -= 2;
    solveForFont();
  }

  const quoteLineHeight: number = p.quoteLineHeight || Math.round(fontSize * 1.08);
  const quoteWidth: number = Math.min(maxWidth, Math.max(...lines.map(line => estimateTextWidth(line, fontSize))));
  const quoteHeight: number = lines.length * quoteLineHeight;
  const quoteY: number = p.quoteY || 110;
  return { quoteX, quoteY, lines, quoteWidth, quoteHeight, quoteLineHeight, quoteMaxChars: bestChars, quoteTop: quoteY - fontSize, quoteFontSize: fontSize };
}

function resolve(cfg: any, helpers: RenderHelpers): any {
  const p = cfg.proofHero || {};
  const quote: string = p.quote || p.content?.quote || '';
  const reviewPath: string | null = p.reviewPath || p.assets?.reviewPath || null;
  const productPath: string | null = p.productPath || p.assets?.productPath || null;
  const ctaText: string | null = p.cta?.text || p.content?.cta || null;

  const quoteLayout = resolveQuoteLayout(quote, p, helpers, cfg.width);
  const starsSize: number = p.starsSize || 90;
  const starsRenderHeight: number = Math.round(starsSize * 1.2);
  const starsX: number = p.starsX || quoteLayout.quoteX + 130;
  const quoteToStarsGap: number = p.quoteToStarsGap || 26;
  const starsTop: number = Math.max((p.starsY ? p.starsY - starsSize : 0), quoteLayout.quoteTop + quoteLayout.quoteHeight + quoteToStarsGap);
  const starsY: number = starsTop + starsSize;

  const reviewX: number = p.reviewX || 118;
  const starsToReviewGap: number = p.starsToReviewGap || 42;
  const reviewY: number = Math.max(p.reviewY || 0, starsTop + starsRenderHeight + starsToReviewGap);
  const reviewWidth: number = p.reviewWidth || Math.round(cfg.width * 0.66);
  const reviewHeight: number = p.reviewHeight || 210;

  const ctaHeight: number = p.cta?.height || 74;
  const safeBottom: number = (cfg.constraintPolicy?.geometry?.minSafeZone || 40);
  const maxCtaTop: number = cfg.height - safeBottom - ctaHeight;

  const product: any | null = productPath ? {
    path: productPath,
    x: p.productX || (reviewX + reviewWidth - 120),
    y: Math.max(p.productY || 0, reviewY + reviewHeight + (p.reviewToProductGap || 18)),
    width: p.productWidth || 250,
    height: p.productHeight || 228,
    padding: 0,
    background: p.productBackground || { r: 255, g: 255, b: 255, alpha: 1 },
    fit: p.productFit || 'cover',
    radius: p.productRadius || 16,
    shadow: p.productShadow || { y: 12, color: 'rgba(0,0,0,0.18)' },
  } : null;

  if (product) {
    const desiredCtaTop = Math.max(
      reviewY + reviewHeight + (p.reviewToCtaGap || 120),
      product.y + product.height + (p.productToCtaGap || 26),
    );
    if (desiredCtaTop > maxCtaTop) {
      const shiftUp = desiredCtaTop - maxCtaTop;
      product.y = Math.max(reviewY + reviewHeight + 8, product.y - shiftUp);
    }
  }

  const minCtaTop: number = Math.max(
    reviewY + reviewHeight + (p.reviewToCtaGap || 120),
    product ? product.y + product.height + (p.productToCtaGap || 26) : 0,
  );
  const cta: any | null = ctaText ? {
    text: ctaText,
    x: p.cta?.x || 110,
    y: Math.max(Math.min(p.cta?.y || minCtaTop, cfg.height - 110), minCtaTop),
    width: p.cta?.width || 420,
    height: ctaHeight,
    radius: p.cta?.radius || 12,
    fill: p.cta?.fill || '#FFFFFF',
    textColor: p.cta?.textColor || '#111111',
    fontSize: p.cta?.fontSize || 24,
    fontWeight: p.cta?.fontWeight || 800,
    fontFamily: p.cta?.fontFamily || 'Montserrat, Arial, sans-serif',
  } : null;

  const review: any | null = reviewPath ? {
    path: reviewPath,
    x: reviewX,
    y: reviewY,
    width: reviewWidth,
    height: reviewHeight,
    padding: 0,
    background: p.reviewBackground || { r: 255, g: 255, b: 255, alpha: 1 },
    fit: p.reviewFit || 'contain',
    radius: p.reviewRadius || 18,
    stroke: p.reviewStroke || 'rgba(255,255,255,0.10)',
    strokeWidth: p.reviewStrokeWidth || 2,
    shadow: p.reviewShadow || { y: 10, color: 'rgba(0,0,0,0.22)' },
  } : null;

  const elements: LayoutElement[] = [
    { id: 'proofHero.quote', type: 'text', rect: Rect.create(quoteLayout.quoteX, quoteLayout.quoteTop, quoteLayout.quoteWidth, quoteLayout.quoteHeight) },
    { id: 'proofHero.stars', type: 'text', rect: Rect.create(starsX, starsTop, Math.round(starsSize * 4.2), starsRenderHeight) },
  ];
  if (review) elements.push({ id: 'proofHero.review', type: 'image', rect: Rect.create(review.x, review.y, review.width, review.height) });
  if (product) elements.push({ id: 'proofHero.product', type: 'image', rect: Rect.create(product.x, product.y, product.width, product.height) });
  if (cta) elements.push({ id: 'proofHero.cta', type: 'cta', rect: Rect.create(cta.x, cta.y, cta.width, cta.height) });

  return {
    quote,
    quoteLayout,
    starsX,
    starsY,
    starsSize,
    cta,
    review,
    product,
    elements,
    warnings: [
      ...(quoteLayout.lines.length > (p.maxQuoteLines || 3) ? ['quote_exceeds_line_target'] : []),
    ],
  };
}

function build(cfg: any, helpers: RenderHelpers): PrimitiveResult | null {
  if (!cfg.proofHero) return null;
  const { escapeXml } = helpers;
  const solved = resolve(cfg, helpers);
  const p = cfg.proofHero;
  const quoteTspans = solved.quoteLayout.lines
    .map((line: string, i: number) => `<tspan x="${solved.quoteLayout.quoteX}" dy="${i === 0 ? 0 : solved.quoteLayout.quoteLineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  const quoteMark = p.quoteMark !== false
    ? `<text x="${p.quoteMarkX || solved.quoteLayout.quoteX - 34}" y="${p.quoteMarkY || solved.quoteLayout.quoteY - 22}" fill="${p.quoteMarkColor || '#ffffff'}" font-size="${p.quoteMarkSize || 104}" font-family="Georgia, serif" font-weight="700">"</text>`
    : '';
  const closingQuote = p.quoteMark !== false
    ? `<text x="${p.quoteCloseX || (solved.quoteLayout.quoteX + solved.quoteLayout.quoteWidth + 10)}" y="${p.quoteCloseY || (solved.quoteLayout.quoteTop + solved.quoteLayout.quoteHeight - 4)}" fill="${p.quoteMarkColor || '#ffffff'}" font-size="${p.quoteMarkSize || 104}" font-family="Georgia, serif" font-weight="700">"</text>`
    : '';
  const starsNode = `<text x="${solved.starsX}" y="${solved.starsY}" fill="${p.starsColor || '#F4B63D'}" font-size="${solved.starsSize}" font-family="Arial, sans-serif" font-weight="700">${escapeXml(p.starsText || '\u2605\u2605\u2605\u2605\u2605')}</text>`;
  const eyebrow = p.eyebrow
    ? `<text x="${p.eyebrowX || solved.quoteLayout.quoteX}" y="${p.eyebrowY || 48}" fill="${p.eyebrowColor || 'rgba(255,255,255,0.72)'}" font-size="${p.eyebrowSize || 18}" font-family="${p.eyebrowFontFamily || 'Montserrat, Arial, sans-serif'}" font-weight="${p.eyebrowWeight || 700}" letter-spacing="${p.eyebrowTracking || 2}">${escapeXml(p.eyebrow)}</text>`
    : '';
  const ctaSvg = solved.cta ? `
    <rect x="${solved.cta.x}" y="${solved.cta.y}" width="${solved.cta.width}" height="${solved.cta.height}" rx="${solved.cta.radius}" fill="${solved.cta.fill}" />
    <text x="${solved.cta.x + Math.round(solved.cta.width / 2)}" y="${solved.cta.y + Math.round(solved.cta.height / 2) + 10}" text-anchor="middle" fill="${solved.cta.textColor}" font-size="${solved.cta.fontSize}" font-family="${solved.cta.fontFamily}" font-weight="${solved.cta.fontWeight}">${escapeXml(solved.cta.text)}</text>` : '';
  const svg = Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${eyebrow}${quoteMark}<text x="${solved.quoteLayout.quoteX}" y="${solved.quoteLayout.quoteY}" fill="${p.quoteColor || '#ffffff'}" font-size="${solved.quoteLayout.quoteFontSize}" font-family="${p.quoteFontFamily || 'Georgia, Times New Roman, serif'}" font-weight="${p.quoteWeight || 700}" ${p.quoteStyle ? `font-style="${p.quoteStyle}"` : ''}>${quoteTspans}</text>${closingQuote}${starsNode}${ctaSvg}</svg>`);
  const imageLayers = [solved.review, solved.product].filter(Boolean);
  return { id: 'proofHero', svg, imageLayers, elements: solved.elements, warnings: solved.warnings };
}

export const id = 'proofHero';
export const configKey = 'proofHero';
export const variants = VARIANTS;
export { resolve, build };
