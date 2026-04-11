/**
 * Shared utility: place product image on a white geometric shape
 * Eliminates need for background removal entirely.
 *
 * Shapes:
 *   'circle' — white circle/oval (for lures: Epic Axis, Jagahoo)
 *   'roundrect' — white rounded rectangle (for packaged products: Chugger)
 */

import { createRequire } from 'module';
const require = createRequire('/opt/scp/packages/renderer/package.json');
const sharp = require('sharp');

/**
 * @param {string} imagePath - Path to product image (any format)
 * @param {'circle'|'roundrect'} shape - Shape type
 * @param {number} outputW - Output width
 * @param {number} outputH - Output height
 * @param {number} [padding=30] - Padding between product and shape edge
 * @param {number} [shadowOpacity=0.08] - Drop shadow opacity
 * @returns {Promise<Buffer>} - PNG buffer with product on white shape, transparent outside
 */
export async function productOnShape(imagePath, shape, outputW, outputH, padding = 30, shadowOpacity = 0.08) {
  // Resize product to fit inside shape with padding
  const innerW = outputW - padding * 2;
  const innerH = outputH - padding * 2;
  const productResized = await sharp(imagePath)
    .resize({ width: innerW, height: innerH, fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 255 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })  // Force white bg on product
    .ensureAlpha()
    .png()
    .toBuffer();
  const pm = await sharp(productResized).metadata();

  // Build white shape SVG
  let shapeSvg;
  if (shape === 'circle') {
    const rx = outputW / 2;
    const ry = outputH / 2;
    shapeSvg = Buffer.from(`<svg width="${outputW}" height="${outputH}" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="${rx}" cy="${ry}" rx="${rx}" ry="${ry}" fill="white"/>
    </svg>`);
  } else {
    // roundrect
    const radius = Math.min(outputW, outputH) * 0.08;
    shapeSvg = Buffer.from(`<svg width="${outputW}" height="${outputH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${outputW}" height="${outputH}" rx="${radius}" ry="${radius}" fill="white"/>
    </svg>`);
  }

  // Drop shadow behind shape
  const shadowSvg = Buffer.from(`<svg width="${outputW + 20}" height="${outputH + 20}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="6"/>
    </filter></defs>
    ${shape === 'circle'
      ? `<ellipse cx="${(outputW+20)/2}" cy="${(outputH+20)/2+4}" rx="${outputW/2}" ry="${outputH/2}" fill="rgba(0,0,0,${shadowOpacity})" filter="url(#s)"/>`
      : `<rect x="10" y="14" width="${outputW}" height="${outputH}" rx="${Math.min(outputW,outputH)*0.08}" fill="rgba(0,0,0,${shadowOpacity})" filter="url(#s)"/>`
    }
  </svg>`);

  // Composite: transparent base → shadow → white shape → product centered
  const base = sharp({
    create: { width: outputW + 20, height: outputH + 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  });

  const productX = 10 + Math.round((outputW - pm.width) / 2);
  const productY = 10 + Math.round((outputH - pm.height) / 2);

  // Clip product to shape using a mask
  // First composite product onto white shape
  const shapeWithProduct = await sharp(shapeSvg)
    .composite([{ input: productResized, left: Math.round((outputW - pm.width) / 2), top: Math.round((outputH - pm.height) / 2) }])
    .png()
    .toBuffer();

  // Then composite shadow + clipped shape onto transparent base
  return base.composite([
    { input: shadowSvg, left: 0, top: 0 },
    { input: shapeWithProduct, left: 10, top: 10 },
  ]).png().toBuffer();
}
