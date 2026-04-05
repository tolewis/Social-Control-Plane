export { render, renderToDataUri, type RenderOptions } from './render.js';
export { buildTemplate } from './templates/index.js';
export { loadAssetDataUri, loadAssetBuffer, loadFont } from './assets.js';

export type {
  TemplateName,
  TemplateDataMap,
  WaterTempsData,
  WaterTempRegion,
  SpeciesReportData,
  SpeciesEntry,
} from './templates/types.js';

import { buildTemplate } from './templates/index.js';
import { render, type RenderOptions } from './render.js';
import type { TemplateName, TemplateDataMap } from './templates/types.js';

/**
 * High-level: generate an infographic image from a template name + data.
 * Returns a PNG buffer by default.
 */
export async function generateInfographic<K extends TemplateName>(
  templateName: K,
  data: TemplateDataMap[K],
  opts?: RenderOptions,
): Promise<Buffer> {
  const element = buildTemplate(templateName, data);
  return render(element, opts);
}
