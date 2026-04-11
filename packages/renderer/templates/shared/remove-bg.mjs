/**
 * Shared AI background removal utility using rembg (U2Net)
 *
 * Usage from template scripts:
 *   import { removeBg } from '../shared/remove-bg.mjs';
 *   const noBgBuffer = await removeBg('/path/to/product.jpg');
 *
 * Requires: /mnt/raid/Data/tmp/openclaw-builds/.venv-rembg
 * Model: ~/.u2net/u2net.onnx (auto-downloaded on first use)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const PYTHON = '/mnt/raid/Data/tmp/openclaw-builds/.venv-rembg/bin/python3';

/**
 * Remove background from an image using rembg AI model.
 * @param {string} inputPath - Path to input image (any format Sharp/Pillow can read)
 * @returns {Promise<Buffer>} - PNG buffer with transparent background
 */
export async function removeBg(inputPath) {
  const outPath = join(tmpdir(), `rembg-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);

  const script = `
from rembg import remove
from PIL import Image
import sys
inp = Image.open(sys.argv[1])
out = remove(inp)
out.save(sys.argv[2])
`;

  try {
    await execFileAsync(PYTHON, ['-c', script, inputPath, outPath], { timeout: 60000 });
    const buf = readFileSync(outPath);
    unlinkSync(outPath);
    return buf;
  } catch (e) {
    try { unlinkSync(outPath); } catch {}
    throw new Error(`rembg failed on ${inputPath}: ${e.message}`);
  }
}

/**
 * Batch remove backgrounds from multiple images.
 * @param {string[]} inputPaths - Array of image paths
 * @returns {Promise<Map<string, Buffer>>} - Map of inputPath -> PNG buffer
 */
export async function removeBgBatch(inputPaths) {
  const results = new Map();
  for (const p of inputPaths) {
    results.set(p, await removeBg(p));
  }
  return results;
}
