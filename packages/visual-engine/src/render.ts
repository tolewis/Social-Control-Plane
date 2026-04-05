import satori from 'satori';
import sharp from 'sharp';
import { loadFont } from './assets.js';
import type { ReactNode } from 'react';

// ─── Font loading ───────────────────────────────────────────────────────────
// Satori needs font data to render text. We bundle Inter (variable weight)
// for headlines and body. Users can drop .ttf/.woff files in assets/ and
// register them here.

interface FontEntry {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700 | 800 | 900;
  style: 'normal' | 'italic';
}

let fontCache: FontEntry[] | null = null;

function getFonts(): FontEntry[] {
  if (fontCache) return fontCache;

  // Try loading bundled fonts; fall back gracefully if not yet installed
  const fonts: FontEntry[] = [];

  const tryLoad = (file: string, name: string, weight: FontEntry['weight']) => {
    try {
      fonts.push({ name, data: loadFont(file), weight, style: 'normal' });
    } catch {
      // Font file not found — will be populated during setup
    }
  };

  tryLoad('Inter-Regular.ttf', 'Inter', 400);
  tryLoad('Inter-Bold.ttf', 'Inter', 700);
  tryLoad('Inter-ExtraBold.ttf', 'Inter', 800);
  tryLoad('Inter-Black.ttf', 'Inter', 900);

  fontCache = fonts;
  return fonts;
}

// ─── Render pipeline ────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Width in pixels. Default: 1080 */
  width?: number;
  /** Height in pixels. Default: 1350 (IG portrait) */
  height?: number;
  /** Output format. Default: 'png' */
  format?: 'png' | 'jpeg' | 'webp';
  /** JPEG/WebP quality 1-100. Default: 90 */
  quality?: number;
}

const DEFAULTS: Required<RenderOptions> = {
  width: 1080,
  height: 1350,
  format: 'png',
  quality: 90,
};

/**
 * Render a Satori JSX element tree to a rasterized image buffer.
 *
 * Pipeline: JSX → Satori → SVG string → sharp → PNG/JPEG/WebP buffer
 */
export async function render(
  element: ReactNode,
  opts?: RenderOptions,
): Promise<Buffer> {
  const { width, height, format, quality } = { ...DEFAULTS, ...opts };

  const fonts = getFonts();
  if (fonts.length === 0) {
    throw new Error(
      'No fonts loaded. Place .ttf files (e.g. Inter-Bold.ttf) in packages/visual-engine/assets/',
    );
  }

  // 1. Satori: JSX → SVG
  const svg = await satori(element as ReactNode, {
    width,
    height,
    fonts,
  });

  // 2. sharp: SVG → raster
  let pipeline = sharp(Buffer.from(svg));

  switch (format) {
    case 'jpeg':
      pipeline = pipeline.jpeg({ quality });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'png':
    default:
      pipeline = pipeline.png();
      break;
  }

  return pipeline.toBuffer();
}

/**
 * Convenience: render and return as a data URI.
 */
export async function renderToDataUri(
  element: ReactNode,
  opts?: RenderOptions,
): Promise<string> {
  const format = opts?.format ?? 'png';
  const buf = await render(element, opts);
  const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}
