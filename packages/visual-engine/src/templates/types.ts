/** Data shape for a single region row in the water-temps infographic. */
export interface WaterTempRegion {
  /** Region name, e.g. "Outer Banks, NC" */
  name: string;
  /** Previous week temp in °F */
  tempFrom: number;
  /** Current temp in °F */
  tempTo: number;
  /** Week-over-week delta in °F (positive = warming) */
  delta: number;
  /** Species note, e.g. "Kings + Cobia arrived" */
  species?: string;
}

/** Input data for the water-temps template. */
export interface WaterTempsData {
  /** Week label, e.g. "Week of April 5, 2026" */
  weekOf: string;
  /** Ordered list of regions (top = biggest mover) */
  regions: WaterTempRegion[];
  /** Optional brand name override. Default: "THE TACKLE ROOM" */
  brandName?: string;
  /** Optional tagline. Default: "16 saltwater regions | Free weekly forecast" */
  tagline?: string;
  /** Optional source URL text. Default: "tackleroomsupply.com/forecast" */
  sourceUrl?: string;
  /** Optional logo filename in assets/. Default: "logo.png" */
  logoFile?: string;
}

/** Registry of all template names → their data types. */
export interface TemplateDataMap {
  'water-temps': WaterTempsData;
}

export type TemplateName = keyof TemplateDataMap;
