import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, '../assets');

/**
 * Load a brand asset as a base64 data URI for embedding in Satori templates.
 */
export function loadAssetDataUri(filename: string): string {
  const buf = readFileSync(resolve(ASSETS_DIR, filename));
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'png';
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/**
 * Load a brand asset as a raw Buffer.
 */
export function loadAssetBuffer(filename: string): Buffer {
  return readFileSync(resolve(ASSETS_DIR, filename));
}

/**
 * Load a font file for Satori.
 */
export function loadFont(filename: string): ArrayBuffer {
  const buf = readFileSync(resolve(ASSETS_DIR, filename));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
