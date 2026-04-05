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
  'species-report': SpeciesReportData;
  'tide-chart': TideChartData;
}

export type TemplateName = keyof TemplateDataMap;

// ─── Species Report ─────────────────────────────────────────────────────────

/** A single species entry in the report. */
export interface SpeciesEntry {
  /** Species name, e.g. "King Mackerel" */
  name: string;
  /** Activity level: hot, active, slow, or off */
  status: 'hot' | 'active' | 'slow' | 'off';
  /** Where they're being caught, e.g. "Nearshore wrecks, 60-80ft" */
  where?: string;
  /** What's working, e.g. "Live pogies, slow trolled" */
  bait?: string;
  /** Optional extra note */
  note?: string;
}

/** Input data for the species-report template. */
export interface SpeciesReportData {
  /** Region/location, e.g. "Outer Banks, NC" */
  region: string;
  /** Date label, e.g. "Week of April 5, 2026" */
  weekOf: string;
  /** Water temp if available */
  waterTemp?: string;
  /** Species entries, ordered by activity */
  species: SpeciesEntry[];
  /** Optional brand overrides */
  brandName?: string;
  tagline?: string;
  sourceUrl?: string;
  logoFile?: string;
}

// ─── Tide Chart ─────────────────────────────────────────────────────────────

/** A single tide event (high or low). */
export interface TideEvent {
  /** "high" or "low" */
  type: 'high' | 'low';
  /** Time string, e.g. "6:14 AM" */
  time: string;
  /** Height in feet, e.g. 4.2 */
  heightFt: number;
}

/** A single day's tide data. */
export interface TideDay {
  /** Day label, e.g. "Mon 4/7" */
  label: string;
  /** Tide events for the day */
  tides: TideEvent[];
  /** Best fishing window, e.g. "5:30–7:30 AM" */
  bestWindow?: string;
  /** Optional note, e.g. "Incoming — best for reds" */
  note?: string;
}

/** Input data for the tide-chart template. */
export interface TideChartData {
  /** Location, e.g. "Oregon Inlet, NC" */
  location: string;
  /** Date range, e.g. "April 7–13, 2026" */
  dateRange: string;
  /** Days of tide data */
  days: TideDay[];
  /** Optional brand overrides */
  brandName?: string;
  tagline?: string;
  sourceUrl?: string;
  logoFile?: string;
}
