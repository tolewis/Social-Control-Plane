import type { TemplateName, TemplateDataMap } from './types.js';
import { waterTempsTemplate } from './water-temps.js';
import { speciesReportTemplate } from './species-report.js';
import { tideChartTemplate } from './tide-chart.js';
import type { ReactNode } from 'react';

/** Template render functions. Each takes typed data and returns Satori JSX. */
const templates: {
  [K in TemplateName]: (data: TemplateDataMap[K]) => ReactNode;
} = {
  'water-temps': waterTempsTemplate,
  'species-report': speciesReportTemplate,
  'tide-chart': tideChartTemplate,
};

/**
 * Look up a template by name and return its Satori JSX element.
 * Throws if the template name is unknown.
 */
export function buildTemplate<K extends TemplateName>(
  name: K,
  data: TemplateDataMap[K],
): ReactNode {
  const fn = templates[name];
  if (!fn) {
    throw new Error(`Unknown template: ${name}. Available: ${Object.keys(templates).join(', ')}`);
  }
  return fn(data);
}

export { type TemplateName, type TemplateDataMap } from './types.js';
export { type WaterTempsData, type WaterTempRegion } from './types.js';
export { type SpeciesReportData, type SpeciesEntry } from './types.js';
export { type TideChartData, type TideDay, type TideEvent } from './types.js';
