/**
 * ActionHero primitive — action-image-first ad with bold headline and CTA.
 *
 * This primitive doesn't generate SVG — the base banner renderer handles
 * headline/CTA/badge rendering. Instead it provides:
 *   1. Variant-driven layout parameter adjustments
 *   2. Geometry export for all action-hero specific elements
 *
 * Variants control structural positioning:
 *   - 'bottom-heavy'  : Headline + CTA near bottom (hero image fills top 70%)
 *   - 'center-band'   : Headline centered vertically, CTA below
 *   - 'split-action'  : Headline upper-right, CTA bottom-left (diagonal flow)
 *   - 'compact-strip' : Tighter headline + CTA strip at very bottom
 */

import * as Rect from '../geometry/rect.js';
import { measureWidth } from '../geometry/text.js';
import type { LayoutElement } from '../geometry/rect.js';
import type { RenderHelpers, PrimitiveResult, VariantDescriptor } from './types.js';

const VARIANTS: Record<string, VariantDescriptor> = {
  'bottom-heavy': {
    description: 'Headline + CTA near bottom, hero image fills top',
    headlineYRatio: 0.72,
    ctaYOffset: 120,
    headlineScale: 1.0,
    badgePosition: 'top-right',
  },
  'center-band': {
    description: 'Headline centered vertically, CTA below',
    headlineYRatio: 0.55,
    ctaYOffset: 140,
    headlineScale: 1.1,
    badgePosition: 'top-right',
  },
  'split-action': {
    description: 'Headline upper, CTA bottom — diagonal reading flow',
    headlineYRatio: 0.45,
    ctaYOffset: 300,
    headlineScale: 1.05,
    badgePosition: 'bottom-left',
  },
  'compact-strip': {
    description: 'Tight headline + CTA strip at very bottom',
    headlineYRatio: 0.82,
    ctaYOffset: 90,
    headlineScale: 0.9,
    badgePosition: 'top-right',
  },
};

function resolve(cfg: any, helpers: RenderHelpers): any {
  const ah = cfg.actionHero;
  if (!ah) return null;

  const variantName: string = ah.variant || 'bottom-heavy';
  const variant = VARIANTS[variantName] || VARIANTS['bottom-heavy'];

  const headlineSize: number = Math.round((cfg.typography?.headlineSize || 72) * variant.headlineScale);
  const headlineY: number = Math.round(cfg.height * variant.headlineYRatio);
  const ctaY: number = headlineY + variant.ctaYOffset;

  const elements: LayoutElement[] = [];

  // These are informational — the actual headline/CTA is rendered by the base
  // banner renderer. We export geometry for critic scoring.
  if (cfg.text?.headline) {
    const { wrapText } = helpers;
    const lines: string[] = wrapText(cfg.text.headline, cfg.layout?.maxHeadlineChars || 18);
    const headlineWidth: number = Math.max(...lines.map((l: string) =>
      measureWidth(l, headlineSize, cfg.typography?.headlineFontFamily, { fontWeight: 700 }),
    ));
    const headlineHeight: number = lines.length * Math.round(headlineSize * 1.2);
    elements.push({
      id: 'actionHero.headline', type: 'text', fontSize: headlineSize,
      rect: Rect.create(cfg.layout?.leftX || 60, headlineY - headlineSize, headlineWidth, headlineHeight),
    });
  }

  if (cfg.text?.cta) {
    const ctaWidth: number = cfg.layout?.ctaWidth || 420;
    const ctaHeight: number = cfg.layout?.ctaHeight || 56;
    elements.push({
      id: 'actionHero.cta', type: 'cta', fontSize: cfg.typography?.ctaSize || 22,
      rect: Rect.create(cfg.layout?.ctaRectX || 60, ctaY, ctaWidth, ctaHeight),
    });
  }

  return {
    variant: variantName,
    headlineY,
    headlineSize,
    ctaY,
    elements,
    // Layout overrides the generator should apply to the main config
    layoutOverrides: {
      headlineY,
      ctaRectY: ctaY,
      ctaY: ctaY + Math.round((cfg.layout?.ctaHeight || 56) / 2),
    },
    typographyOverrides: {
      headlineSize,
    },
    warnings: [],
  };
}

function build(cfg: any, helpers: RenderHelpers): PrimitiveResult | null {
  const ah = cfg.actionHero;
  if (!ah) return null;

  const solved = resolve(cfg, helpers);
  if (!solved) return null;

  // ActionHero doesn't render its own SVG — the base banner renderer
  // handles headline/CTA/badge drawing. We only export geometry.
  return {
    id: 'actionHero',
    svg: null,
    imageLayers: [],
    elements: solved.elements,
    warnings: solved.warnings,
    // Expose overrides so the generator can apply them
    _layoutOverrides: solved.layoutOverrides,
    _typographyOverrides: solved.typographyOverrides,
  };
}

export const id = 'actionHero';
export const configKey = 'actionHero';
export const variants = VARIANTS;
export { resolve, build };
