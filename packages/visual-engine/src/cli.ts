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
import type { WaterTempsData, SpeciesReportData } from './templates/types.js';

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
