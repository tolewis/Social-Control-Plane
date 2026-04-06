/**
 * ComparisonPanel primitive — us-vs-them comparison table.
 *
 * Variants control structural layout, not just copy/color swaps:
 *   - 'standard'     : Equal columns, centered divider, balanced emphasis
 *   - 'hero-right'   : Right column wider, stronger highlight, winner emphasis
 *   - 'compact'      : Tighter rows, smaller text, more rows visible
 *   - 'split-weight' : Left column narrower (pain column gets less visual weight)
 *
 * Config key: 'comparisonTable' (backward compatible with existing configs)
 */

import * as Rect from '../geometry/rect.js';
import { measureWidth } from '../geometry/text.js';
import type { LayoutElement } from '../geometry/rect.js';
import type { RenderHelpers, PrimitiveResult, VariantDescriptor } from './types.js';

const VARIANTS: Record<string, VariantDescriptor> = {
  'standard': {
    description: 'Equal columns, balanced emphasis',
    colRatio: 0.5,
    rowHeightScale: 1.0,
    headerScale: 1.0,
    bodyScale: 1.0,
    highlightPadding: 20,
    gutter: 40,
  },
  'hero-right': {
    description: 'Right column wider, stronger winner emphasis',
    colRatio: 0.42,
    rowHeightScale: 1.1,
    headerScale: 1.0,
    bodyScale: 1.05,
    highlightPadding: 28,
    gutter: 36,
  },
  'compact': {
    description: 'Tighter rows, more rows visible, smaller text',
    colRatio: 0.5,
    rowHeightScale: 0.82,
    headerScale: 0.9,
    bodyScale: 0.88,
    highlightPadding: 14,
    gutter: 32,
  },
  'split-weight': {
    description: 'Left column narrower, pain gets less visual weight',
    colRatio: 0.40,
    rowHeightScale: 1.0,
    headerScale: 1.0,
    bodyScale: 1.0,
    highlightPadding: 22,
    gutter: 44,
  },
};

/**
 * Resolve comparisonPanel geometry.
 * Returns the complete solved layout without rendering.
 */
function resolve(cfg: any, helpers: RenderHelpers): any {
  const ct = cfg.comparisonTable;
  if (!ct) return null;

  const variantName: string = ct.variant || 'standard';
  const variant = VARIANTS[variantName] || VARIANTS.standard;

  const startX: number = ct.startX || 60;
  const startY: number = ct.startY || 350;
  const rows: any[] = ct.rows || [];

  // Column geometry — variant-driven
  const availableWidth: number = cfg.width - startX * 2 - variant.gutter;
  const leftColWidth: number = ct.colWidth || Math.round(availableWidth * variant.colRatio);
  const rightColWidth: number = ct.colWidth || Math.round(availableWidth * (1 - variant.colRatio));
  const gutter: number = variant.gutter;

  const rowHeight: number = Math.round((ct.rowHeight || 60) * variant.rowHeightScale);
  const headerSize: number = Math.round((ct.headerSize || 24) * variant.headerScale);
  const bodySize: number = Math.round((ct.bodySize || 20) * variant.bodyScale);

  const highlightCol: string = ct.highlightCol || 'right';
  const leftCenter: number = startX + Math.round(leftColWidth / 2);
  const rightCenter: number = startX + leftColWidth + gutter + Math.round(rightColWidth / 2);
  const dividerX: number = startX + leftColWidth + Math.round(gutter / 2) - 1;

  const headerY: number = startY;
  const rowStartY: number = startY + 50;
  const tableHeight: number = rows.length * rowHeight + 80;
  const tableBottom: number = startY - 20 + tableHeight;

  // Icon geometry
  const iconSize: number = ct.iconSize || Math.round(bodySize * 1.6);
  const iconGap: number = ct.iconGap || Math.round(iconSize * 0.5);
  const textLeftX: number = startX + iconSize + iconGap;
  const textRightX: number = startX + leftColWidth + gutter + iconSize + iconGap;

  // Build element rects
  const elements: LayoutElement[] = [];

  // Table bounding box
  const tableRect = Rect.create(startX - 10, startY - 20, leftColWidth + gutter + rightColWidth + 20, tableHeight);
  elements.push({ id: 'comparisonPanel.table', type: 'layout', rect: tableRect });

  // Highlight column
  const hlX: number = highlightCol === 'right'
    ? startX + leftColWidth + gutter - variant.highlightPadding / 2
    : startX - 10;
  const hlW: number = (highlightCol === 'right' ? rightColWidth : leftColWidth) + variant.highlightPadding;
  elements.push({
    id: 'comparisonPanel.highlight',
    type: 'layout',
    rect: Rect.create(hlX, startY - 20, hlW, tableHeight),
  });

  // Headers
  const leftHeaderText: string = (ct.leftHeader || 'STATUS QUO').toUpperCase();
  const rightHeaderText: string = (ct.rightHeader || 'TACKLEROOM').toUpperCase();
  const leftHeaderWidth: number = measureWidth(leftHeaderText, headerSize, cfg.typography?.headlineFontFamily, { mode: 'upper', fontWeight: 700 });
  const rightHeaderWidth: number = measureWidth(rightHeaderText, headerSize, cfg.typography?.headlineFontFamily, { mode: 'upper', fontWeight: 700 });
  elements.push({ id: 'comparisonPanel.leftHeader', type: 'text', fontSize: headerSize, rect: Rect.create(leftCenter - leftHeaderWidth / 2, headerY - headerSize, leftHeaderWidth, headerSize) });
  elements.push({ id: 'comparisonPanel.rightHeader', type: 'text', fontSize: headerSize, rect: Rect.create(rightCenter - rightHeaderWidth / 2, headerY - headerSize, rightHeaderWidth, headerSize) });

  // Row elements
  rows.forEach((row: any, i: number) => {
    const ry: number = rowStartY + i * rowHeight + 30;
    const leftText: string = (row.left || '').replace(/^[✗✕✖×xX]\s*/u, '').replace(/^\s*/, '');
    const rightText: string = (row.right || '').replace(/^[✓✔✅]\s*/u, '').replace(/^\s*/, '');
    const leftWidth: number = measureWidth(leftText, bodySize, cfg.typography?.bodyFontFamily);
    const rightWidth: number = measureWidth(rightText, bodySize, cfg.typography?.bodyFontFamily, { fontWeight: 600 });
    elements.push({
      id: `comparisonPanel.row.${i}.left`,
      type: 'text', fontSize: bodySize,
      rect: Rect.create(textLeftX, ry - bodySize, leftWidth, bodySize),
    });
    elements.push({
      id: `comparisonPanel.row.${i}.right`,
      type: 'text', fontSize: bodySize,
      rect: Rect.create(textRightX, ry - bodySize, rightWidth, bodySize),
    });
  });

  return {
    variant: variantName,
    startX, startY, rows,
    leftColWidth, rightColWidth, gutter,
    rowHeight, headerSize, bodySize,
    highlightCol, leftCenter, rightCenter, dividerX,
    headerY, rowStartY, tableHeight, tableBottom,
    iconSize, iconGap, textLeftX, textRightX,
    leftHeaderText, rightHeaderText,
    elements,
    warnings: [
      ...(rows.length > 7 ? ['comparison_too_many_rows'] : []),
      ...(rows.length < 3 ? ['comparison_too_few_rows'] : []),
    ],
  };
}

/**
 * Build comparisonPanel SVG and geometry.
 */
function build(cfg: any, helpers: RenderHelpers): PrimitiveResult | null {
  const ct = cfg.comparisonTable;
  if (!ct) return null;

  const { escapeXml } = helpers;
  const solved = resolve(cfg, helpers);
  if (!solved) return null;

  const font: string = cfg.typography?.bodyFontFamily || 'Source Sans Pro, Arial, sans-serif';
  const headFont: string = cfg.typography?.headlineFontFamily || 'Montserrat, Arial, sans-serif';

  let nodes = '';

  // Highlight column background
  const hlEl = solved.elements.find((e: LayoutElement) => e.id === 'comparisonPanel.highlight');
  if (hlEl) {
    nodes += `<rect x="${hlEl.rect.x}" y="${hlEl.rect.y}" width="${hlEl.rect.width}" height="${solved.tableHeight}" rx="16" fill="rgba(232,93,58,0.08)" stroke="rgba(232,93,58,0.2)" stroke-width="1"/>`;
  }

  // Column headers
  const leftHeaderColor: string = ct.leftHeaderColor || ct.leftTextColor || 'rgba(255,255,255,0.5)';
  const leftBodyColor: string = ct.leftTextColor || 'rgba(255,255,255,0.5)';
  nodes += `<text x="${solved.leftCenter}" y="${solved.headerY}" text-anchor="middle" fill="${leftHeaderColor}" font-size="${solved.headerSize}" font-family="${headFont}" font-weight="700" letter-spacing="1">${escapeXml(solved.leftHeaderText)}</text>`;
  nodes += `<text x="${solved.rightCenter}" y="${solved.headerY}" text-anchor="middle" fill="rgba(232,93,58,0.92)" font-size="${solved.headerSize}" font-family="${headFont}" font-weight="700" letter-spacing="1">${escapeXml(solved.rightHeaderText)}</text>`;

  // Divider
  const dividerColor: string = ct.dividerColor || 'rgba(255,255,255,0.25)';
  const dividerWidth: number = ct.dividerWidth || 3;
  nodes += `<rect x="${solved.dividerX}" y="${solved.startY - 10}" width="${dividerWidth}" height="${solved.rows.length * solved.rowHeight + 60}" rx="1" fill="${dividerColor}"/>`;

  // Icon colors
  const badColor: string = ct.badColor || '#e05050';
  const goodColor: string = ct.goodColor || '#4ade80';

  // Rows
  solved.rows.forEach((row: any, i: number) => {
    const ry: number = solved.rowStartY + i * solved.rowHeight + 30;

    // Row separator
    if (i > 0) {
      nodes += `<rect x="${solved.startX}" y="${ry - Math.round(solved.rowHeight / 2) - 5}" width="${solved.leftColWidth + solved.gutter + solved.rightColWidth}" height="1" fill="rgba(255,255,255,0.06)"/>`;
    }

    const leftText: string = (row.left || '').replace(/^[✗✕✖×xX]\s*/u, '').replace(/^\s*/, '');
    const rightText: string = (row.right || '').replace(/^[✓✔✅]\s*/u, '').replace(/^\s*/, '');

    // Left column: red X + text
    nodes += `<text x="${solved.startX + Math.round(solved.iconSize / 2)}" y="${ry}" text-anchor="middle" fill="${badColor}" font-size="${solved.iconSize}" font-family="${headFont}" font-weight="900">\u2717</text>`;
    nodes += `<text x="${solved.textLeftX}" y="${ry}" text-anchor="start" fill="${leftBodyColor}" font-size="${solved.bodySize}" font-family="${font}" font-weight="400">${escapeXml(leftText)}</text>`;

    // Right column: green check + text
    nodes += `<text x="${solved.startX + solved.leftColWidth + solved.gutter + Math.round(solved.iconSize / 2)}" y="${ry}" text-anchor="middle" fill="${goodColor}" font-size="${solved.iconSize}" font-family="${headFont}" font-weight="900">\u2713</text>`;
    nodes += `<text x="${solved.textRightX}" y="${ry}" text-anchor="start" fill="#ffffff" font-size="${solved.bodySize}" font-family="${font}" font-weight="600">${escapeXml(rightText)}</text>`;
  });

  const svg = Buffer.from(`<svg width="${cfg.width}" height="${cfg.height}" xmlns="http://www.w3.org/2000/svg">${nodes}</svg>`);

  return {
    id: 'comparisonPanel',
    svg,
    imageLayers: [],
    elements: solved.elements,
    warnings: solved.warnings,
  };
}

export const id = 'comparisonPanel';
export const configKey = 'comparisonTable';
export const variants = VARIANTS;
export { resolve, build };
