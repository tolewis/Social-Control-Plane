/**
 * Shared types for all StrikeFrame primitives.
 */

import type { Rect, LayoutElement } from '../geometry/rect.js';

export type { Rect, LayoutElement };

export interface RenderHelpers {
  wrapText: (text: string, maxChars: number) => string[];
  escapeXml: (value?: string) => string;
  buildIconGlyphSvg?: (type: string, x: number, y: number, size: number, color: string) => string;
  buildStarRatingSvg?: (x: number, y: number, count: number, size: number, cfg: any) => string;
}

export interface PrimitiveResult {
  id: string;
  svg: Buffer | null;
  imageLayers: any[];
  elements: LayoutElement[];
  warnings: string[];
  _layoutOverrides?: Record<string, number>;
  _typographyOverrides?: Record<string, number>;
}

export interface VariantDescriptor {
  description: string;
  [key: string]: any;
}

export interface PrimitiveDefinition {
  id: string;
  configKey: string;
  variants: Record<string, VariantDescriptor>;
  resolve: (cfg: any, helpers: RenderHelpers) => any;
  build: (cfg: any, helpers: RenderHelpers) => PrimitiveResult | null;
}
