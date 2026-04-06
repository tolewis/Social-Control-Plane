/**
 * BenefitStack primitive — vertical list of icon + benefit pairs.
 *
 * Variants:
 *   - 'standard'   : Evenly spaced rows, left-aligned
 *   - 'compact'    : Tighter spacing, smaller icons, more items visible
 *   - 'card'       : Each benefit in a subtle card/pill background
 */

import * as Rect from '../geometry/rect.js';
import { measureWidth } from '../geometry/text.js';
import type { LayoutElement } from '../geometry/rect.js';
import type { RenderHelpers, PrimitiveResult, VariantDescriptor } from './types.js';

const VARIANTS: Record<string, VariantDescriptor> = {
  'standard': {
    description: 'Evenly spaced rows, left-aligned',
    spacingScale: 1.0,
    iconScale: 1.0,
    textScale: 1.0,
  },
  'compact': {
    description: 'Tighter spacing, smaller icons',
    spacingScale: 0.75,
    iconScale: 0.85,
    textScale: 0.9,
  },
  'card': {
    description: 'Each benefit in a subtle card background',
    spacingScale: 1.15,
    iconScale: 1.0,
    textScale: 1.0,
    showCards: true,
  },
};

function resolve(cfg: any, helpers: RenderHelpers): any {
  const bs = cfg.benefitStack;
  if (!bs || !bs.items || !bs.items.length) return null;

  const variantName: string = bs.variant || 'standard';
  const variant = VARIANTS[variantName] || VARIANTS.standard;

  const startX: number = bs.startX || cfg.layout?.leftX || 80;
  const startY: number = bs.startY || 580;
  const spacing: number = Math.round((bs.spacing || 90) * variant.spacingScale);
  const iconSize: number = Math.round((bs.iconSize || 36) * variant.iconScale);
  const textSize: number = Math.round((bs.textSize || 28) * variant.textScale);
  const textMaxChars: number = bs.textMaxChars || 32;
  const textFont: string = bs.fontFamily || cfg.typography?.bodyFontFamily || 'Source Sans Pro, Arial, sans-serif';
  const textX: number = startX + iconSize + 16;

  const elements: LayoutElement[] = [];
  const { wrapText } = helpers;

  bs.items.forEach((item: any, i: number) => {
    const iy: number = startY + i * spacing;
    const lines: string[] = wrapText(item.label || '', textMaxChars);
    const lineStep: number = Math.round(textSize * 1.2);
    const textWidth: number = Math.max(...lines.map((l: string) => measureWidth(l, textSize, textFont, { fontWeight: 600 })));
    const textHeight: number = lines.length * lineStep;

    elements.push({ id: `benefitStack.icon.${i}`, type: 'layout', rect: Rect.create(startX, iy - Math.round(iconSize / 2), iconSize, iconSize) });
    elements.push({ id: `benefitStack.text.${i}`, type: 'text', fontSize: textSize, rect: Rect.create(textX, iy - textSize, textWidth, textHeight) });
  });

  const totalHeight: number = (bs.items.length - 1) * spacing + textSize;
  elements.push({ id: 'benefitStack.bounds', type: 'layout', rect: Rect.create(startX, startY - Math.round((bs.iconSize || 36) / 2), cfg.width - startX * 2, totalHeight + iconSize) });

  return {
    variant: variantName,
    startX, startY, spacing, iconSize, textSize, textMaxChars, textFont, textX,
    elements,
    warnings: [
      ...(bs.items.length > 5 ? ['benefit_stack_too_many_items'] : []),
    ],
  };
}

function build(cfg: any, helpers: RenderHelpers): PrimitiveResult | null {
  const bs = cfg.benefitStack;
  if (!bs || !bs.items || !bs.items.length) return null;

  const { escapeXml, wrapText } = helpers;
  const solved = resolve(cfg, helpers);
  if (!solved) return null;

  // Import icon builder from render.js context — passed via helpers
  const buildIconGlyphSvg = helpers.buildIconGlyphSvg;

  const iconColor: string = bs.iconColor || '#63b3ed';
  const textColor: string = bs.textColor || '#ffffff';

  const nodes: string = bs.items.map((item: any, i: number) => {
    const iy: number = solved.startY + i * solved.spacing;
    const iconCenterY: number = iy - Math.round(solved.iconSize / 2);
    let icon = '';
    if (buildIconGlyphSvg) {
      icon = buildIconGlyphSvg(item.icon || 'check', solved.startX, iconCenterY, solved.iconSize, item.color || iconColor);
    }
    const lines: string[] = wrapText(item.label || '', solved.textMaxChars);
    const lineStep: number = Math.round(solved.textSize * 1.2);
    const tspans: string = lines.map((line: string, li: number) => `<tspan x="${solved.textX}" dy="${li === 0 ? 0 : lineStep}">${escapeXml(line)}</tspan>`).join('');
    return `${icon}<text x="${solved.textX}" y="${iy}" fill="${textColor}" font-size="${solved.textSize}" font-family="${solved.textFont}" font-weight="600">${tspans}</text>`;
  }).join('\n');

  return {
    id: 'benefitStack',
    svg: Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`),
    imageLayers: [],
    elements: solved.elements,
    warnings: solved.warnings,
  };
}

export const id = 'benefitStack';
export const configKey = 'benefitStack';
export const variants = VARIANTS;
export { resolve, build };
