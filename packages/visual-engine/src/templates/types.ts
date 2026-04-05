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
  'catch-of-the-week': CatchOfTheWeekData;
  'product-spotlight': ProductSpotlightData;
  'tournament-results': TournamentResultsData;
  'article-ad': ArticleAdData;
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

// ─── Catch of the Week ──────────────────────────────────────────────────────

/** Input data for the catch-of-the-week template. */
export interface CatchOfTheWeekData {
  /** Angler name, e.g. "Captain Mike" */
  angler: string;
  /** Species caught, e.g. "King Mackerel" */
  species: string;
  /** Weight, e.g. "42 lbs" */
  weight?: string;
  /** Length, e.g. "48 inches" */
  length?: string;
  /** Location, e.g. "Oregon Inlet, NC" */
  location: string;
  /** Date, e.g. "April 3, 2026" */
  date: string;
  /** Bait/technique, e.g. "Live pogy, slow trolled" */
  bait?: string;
  /** Fun quote or context */
  quote?: string;
  /** Optional brand overrides */
  brandName?: string;
  tagline?: string;
  logoFile?: string;
}

// ─── Product Spotlight ──────────────────────────────────────────────────────

/** A single product spec/feature bullet. */
export interface ProductSpec {
  label: string;
  value: string;
}

/** Input data for the product-spotlight template. */
export interface ProductSpotlightData {
  /** Product name, e.g. "Shimano Saragosa SW" */
  name: string;
  /** Category tag, e.g. "REEL" or "ROD" or "BAIT" */
  category: string;
  /** Price, e.g. "$349.99" */
  price?: string;
  /** Key specs */
  specs: ProductSpec[];
  /** Why we carry it / sales pitch, 1-2 sentences */
  pitch?: string;
  /** In stock status */
  inStock?: boolean;
  /** Optional brand overrides */
  brandName?: string;
  tagline?: string;
  logoFile?: string;
}

// ─── Tournament Results ─────────────────────────────────────────────────────

/** A single leaderboard entry. */
export interface TournamentEntry {
  /** Rank, e.g. 1, 2, 3 */
  rank: number;
  /** Angler/team name */
  name: string;
  /** Species, e.g. "King Mackerel" */
  species?: string;
  /** Weight, e.g. "38.4 lbs" */
  weight: string;
  /** Optional note, e.g. "New record" */
  note?: string;
}

/** Input data for the tournament-results template. */
export interface TournamentResultsData {
  /** Tournament name, e.g. "OBX King Classic" */
  tournamentName: string;
  /** Date/year, e.g. "April 5, 2026" */
  date: string;
  /** Location */
  location?: string;
  /** Leaderboard entries, ordered by rank */
  leaderboard: TournamentEntry[];
  /** Total boats/anglers, e.g. "42 boats" */
  totalParticipants?: string;
  /** Optional brand overrides */
  brandName?: string;
  tagline?: string;
  logoFile?: string;
}

// ─── Article Ad ─────────────────────────────────────────────────────────────

/** A key takeaway or bullet point from the article. */
export interface ArticleTakeaway {
  text: string;
}

/** Input data for the article-ad template. */
export interface ArticleAdData {
  /** Article title / headline */
  title: string;
  /** Category/topic tag, e.g. "RIGGING GUIDE" or "GEAR REVIEW" */
  category: string;
  /** 1-2 sentence hook/summary */
  hook: string;
  /** Key takeaways (3-4 bullet points) */
  takeaways?: ArticleTakeaway[];
  /** CTA text, e.g. "Read the full guide →" */
  cta?: string;
  /** URL to display (not a link — just visual), e.g. "tackleroomsupply.com/guides/king-rigs" */
  url?: string;
  /** Reading time estimate, e.g. "5 min read" */
  readTime?: string;
  /** Optional brand overrides */
  brandName?: string;
  tagline?: string;
  logoFile?: string;
}
