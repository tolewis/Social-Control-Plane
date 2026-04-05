#!/usr/bin/env tsx
/**
 * CLI for testing visual-engine templates.
 *
 * Usage:
 *   pnpm --filter @scp/visual-engine render water-temps --out test.png
 *   pnpm --filter @scp/visual-engine render water-temps --data '{"weekOf":"...","regions":[...]}'
 *   pnpm --filter @scp/visual-engine render water-temps --sample --out test.png
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateInfographic } from './index.js';
import type { TemplateName } from './templates/types.js';
import type { WaterTempsData, SpeciesReportData, TideChartData, CatchOfTheWeekData, ProductSpotlightData, TournamentResultsData } from './templates/types.js';

// ─── Sample data for quick testing ──────────────────────────────────────────

const SAMPLE_DATA: Record<string, unknown> = {
  'water-temps': {
    weekOf: 'Week of April 5, 2026',
    regions: [
      { name: 'Outer Banks, NC', tempFrom: 54, tempTo: 66, delta: 11.8, species: 'Kings + Cobia arrived' },
      { name: 'Mid-Atlantic', tempFrom: 50, tempTo: 55, delta: 5.1, species: 'Flounder + Bluefish in' },
      { name: 'Charleston, SC', tempFrom: 62, tempTo: 67, delta: 4.8, species: 'Cobia showing' },
      { name: 'Cape Fear, NC', tempFrom: 60, tempTo: 65, delta: 4.6, species: 'Cobia arrived' },
      { name: 'Hilton Head / Savannah', tempFrom: 63, tempTo: 68, delta: 4.3 },
      { name: 'Jacksonville, FL', tempFrom: 64, tempTo: 68, delta: 3.9 },
    ],
  } satisfies WaterTempsData,

  'species-report': {
    region: 'Outer Banks, NC',
    weekOf: 'Week of April 5, 2026',
    waterTemp: '66°F',
    species: [
      { name: 'King Mackerel', status: 'hot', where: 'Nearshore wrecks, 60-80ft', bait: 'Live pogies, slow trolled', note: 'Best bite at first light' },
      { name: 'Cobia', status: 'active', where: 'Buoys & channel edges', bait: 'Live eels, sight cast', note: 'Just showed up this week' },
      { name: 'Red Drum', status: 'active', where: 'Inlet flats, oyster bars', bait: 'Cut mullet, Carolina rig' },
      { name: 'Flounder', status: 'slow', where: 'Nearshore structure', bait: 'Bucktails w/ Gulp' },
      { name: 'Spanish Mackerel', status: 'off', note: 'Not here yet — water needs 68°F+' },
    ],
  } satisfies SpeciesReportData,

  'tide-chart': {
    location: 'Oregon Inlet, NC',
    dateRange: 'April 7–13, 2026',
    days: [
      { label: 'Mon 4/7', tides: [{ type: 'high', time: '6:14 AM', heightFt: 3.8 }, { type: 'low', time: '12:31 PM', heightFt: 0.4 }, { type: 'high', time: '6:42 PM', heightFt: 4.1 }], bestWindow: '5:30–7:30 AM', note: 'Incoming — best for reds' },
      { label: 'Tue 4/8', tides: [{ type: 'high', time: '7:02 AM', heightFt: 3.6 }, { type: 'low', time: '1:18 PM', heightFt: 0.6 }, { type: 'high', time: '7:28 PM', heightFt: 3.9 }], bestWindow: '6:15–8:15 AM' },
      { label: 'Wed 4/9', tides: [{ type: 'high', time: '7:48 AM', heightFt: 3.4 }, { type: 'low', time: '2:04 PM', heightFt: 0.8 }, { type: 'high', time: '8:12 PM', heightFt: 3.7 }], bestWindow: '7:00–9:00 AM', note: 'Neap tide — weaker movement' },
      { label: 'Thu 4/10', tides: [{ type: 'high', time: '8:33 AM', heightFt: 3.2 }, { type: 'low', time: '2:48 PM', heightFt: 1.0 }, { type: 'high', time: '8:55 PM', heightFt: 3.5 }], bestWindow: '7:45–9:45 AM' },
      { label: 'Fri 4/11', tides: [{ type: 'high', time: '9:18 AM', heightFt: 3.1 }, { type: 'low', time: '3:32 PM', heightFt: 1.1 }, { type: 'high', time: '9:38 PM', heightFt: 3.3 }], bestWindow: '8:30–10:30 AM' },
    ],
  } satisfies TideChartData,

  'catch-of-the-week': {
    angler: 'Captain Mike',
    species: 'King Mackerel',
    weight: '42 lbs',
    length: '48"',
    location: 'Oregon Inlet, NC',
    date: 'April 3, 2026',
    bait: 'Live pogy, slow trolled',
    quote: 'Biggest king I\'ve seen this early in the season',
  } satisfies CatchOfTheWeekData,

  'product-spotlight': {
    name: 'Shimano Saragosa SW 5000',
    category: 'Reel',
    price: '$349.99',
    inStock: true,
    specs: [
      { label: 'Gear Ratio', value: '5.7:1' },
      { label: 'Weight', value: '12.9 oz' },
      { label: 'Line Cap', value: '20lb / 210yd' },
      { label: 'Drag Max', value: '22 lbs' },
      { label: 'Bearings', value: '5+1' },
    ],
    pitch: 'Built for the salt. The Saragosa handles everything from king rigs to bottom fishing — bombproof drag, sealed body, and it still weighs under a pound.',
  } satisfies ProductSpotlightData,

  'tournament-results': {
    tournamentName: 'OBX King Classic',
    date: 'April 5, 2026',
    location: 'Oregon Inlet, NC',
    totalParticipants: '42 boats',
    leaderboard: [
      { rank: 1, name: 'Team Bite Me', species: 'King Mackerel', weight: '38.4 lbs', note: 'New record!' },
      { rank: 2, name: 'Reel Therapy', species: 'King Mackerel', weight: '34.1 lbs' },
      { rank: 3, name: 'Fish Whistle', species: 'King Mackerel', weight: '31.8 lbs' },
      { rank: 4, name: 'No Quarter', species: 'King Mackerel', weight: '29.2 lbs' },
      { rank: 5, name: 'Salt Life', species: 'King Mackerel', weight: '27.6 lbs' },
      { rank: 6, name: 'Lucky Strike', species: 'King Mackerel', weight: '25.3 lbs' },
    ],
  } satisfies TournamentResultsData,
};

// ─── Arg parsing ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

const hasFlag = (name: string) => args.includes(`--${name}`);

async function main() {
  const command = args[0];

  if (command !== 'render') {
    console.error('Usage: scp-render render <template-name> [--data JSON] [--sample] [--out path]');
    process.exit(1);
  }

  const templateName = args[1] as TemplateName;
  if (!templateName) {
    console.error('Missing template name. Available: water-temps, species-report');
    process.exit(1);
  }

  // Resolve data
  let data: unknown;
  const dataStr = flag('data');
  if (dataStr) {
    data = JSON.parse(dataStr);
  } else if (hasFlag('sample')) {
    data = SAMPLE_DATA[templateName];
    if (!data) {
      console.error(`No sample data for template: ${templateName}`);
      process.exit(1);
    }
  } else {
    // Default to sample data
    data = SAMPLE_DATA[templateName];
    if (!data) {
      console.error('Provide --data JSON or --sample. No default for this template.');
      process.exit(1);
    }
    console.log('No --data provided, using sample data.');
  }

  const outPath = flag('out') ?? `${templateName}.png`;
  const width = flag('width') ? parseInt(flag('width')!, 10) : undefined;
  const height = flag('height') ? parseInt(flag('height')!, 10) : undefined;

  console.log(`Rendering template: ${templateName}`);
  console.log(`Output: ${resolve(outPath)}`);

  const buf = await generateInfographic(templateName, data as any, { width, height });
  writeFileSync(outPath, buf);

  console.log(`Done. ${buf.length} bytes written.`);
}

main().catch((err) => {
  console.error('Render failed:', err);
  process.exit(1);
});
