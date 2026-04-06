/**
 * Primitive registry for StrikeFrame.
 *
 * Each primitive exports:
 *   id       — unique name (e.g. 'proofHero', 'comparisonPanel')
 *   configKey — the config key that activates this primitive (e.g. 'proofHero', 'comparisonTable')
 *   variants — optional map of named variant modes
 *   resolve  — compute geometry and validate (cfg, helpers) -> solved state
 *   build    — generate SVG + image layers (cfg, helpers) -> { svg, imageLayers, elements, warnings }
 *
 * Lifecycle: detect -> resolve -> build -> export geometry
 */

import type { PrimitiveDefinition, PrimitiveResult, RenderHelpers } from './types.js';

import * as proofHero from './proofHero.js';
import * as comparisonPanel from './comparisonPanel.js';
import * as offerFrame from './offerFrame.js';
import * as benefitStack from './benefitStack.js';
import * as testimonial from './testimonial.js';
import * as splitReveal from './splitReveal.js';
import * as authorityBar from './authorityBar.js';
import * as actionHero from './actionHero.js';

const REGISTRY: Record<string, PrimitiveDefinition> = {};

function register(primitive: PrimitiveDefinition): void {
  if (!primitive.id) throw new Error('Primitive must have an id');
  REGISTRY[primitive.id] = primitive;
}

register(proofHero as PrimitiveDefinition);
register(comparisonPanel as PrimitiveDefinition);
register(offerFrame as PrimitiveDefinition);
register(benefitStack as PrimitiveDefinition);
register(testimonial as PrimitiveDefinition);
register(splitReveal as PrimitiveDefinition);
register(authorityBar as PrimitiveDefinition);
register(actionHero as PrimitiveDefinition);

export function getPrimitiveRegistry(): Record<string, PrimitiveDefinition> {
  return { ...REGISTRY };
}

/**
 * Detect which primitives should activate for a given config.
 * Returns array of primitive objects that match.
 */
export function detectPrimitives(cfg: any): PrimitiveDefinition[] {
  const active: PrimitiveDefinition[] = [];
  for (const primitive of Object.values(REGISTRY)) {
    const key = primitive.configKey || primitive.id;
    if (cfg[key]) active.push(primitive);
  }
  return active;
}

/**
 * Build all active primitives for a config.
 * Runs the full lifecycle: detect -> resolve -> build -> collect outputs.
 *
 * Returns array of { id, svg, imageLayers, elements, warnings, solved }.
 */
export function buildPrimitiveOutputs(cfg: any, helpers: RenderHelpers): PrimitiveResult[] {
  const outputs: PrimitiveResult[] = [];
  const active = detectPrimitives(cfg);
  for (const primitive of active) {
    if (typeof primitive.build !== 'function') continue;
    const result = primitive.build(cfg, helpers);
    if (result) {
      result.id = result.id || primitive.id;
      outputs.push(result);
    }
  }
  return outputs;
}

/**
 * Resolve all active primitives without building.
 * Useful for geometry-only analysis.
 */
export function resolvePrimitives(cfg: any, helpers: RenderHelpers): Array<{ id: string; solved: any }> {
  const results: Array<{ id: string; solved: any }> = [];
  const active = detectPrimitives(cfg);
  for (const primitive of active) {
    if (typeof primitive.resolve !== 'function') continue;
    const solved = primitive.resolve(cfg, helpers);
    if (solved) results.push({ id: primitive.id, solved });
  }
  return results;
}
