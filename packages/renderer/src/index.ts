/**
 * @scp/renderer — StrikeFrame rendering engine for SCP.
 *
 * Public API for creative generation, quality scoring, and batch rendering.
 */

// Geometry
export { Rect, Text, SafeZone } from './geometry/index.js';
export type { LayoutElement, Collision, OccupancyResult } from './geometry/rect.js';
export type { TextBlockResult, MeasureWidthOpts } from './geometry/text.js';
export type { SafeZones, SafeZoneCheckResult, MobileReadabilityWarning } from './geometry/safezone.js';

// Primitives
import { getPrimitiveRegistry as _getPrimitiveRegistry, detectPrimitives, buildPrimitiveOutputs, resolvePrimitives } from './primitives/registry.js';
export { detectPrimitives, buildPrimitiveOutputs, resolvePrimitives };
export const getPrimitiveRegistry = _getPrimitiveRegistry;
export type { RenderHelpers, PrimitiveResult, PrimitiveDefinition } from './primitives/types.js';

// Critic
export { critique } from './critic/index.js';
export type { CritiqueResult, Finding, LayoutSidecar, SpacingCheck } from './critic/index.js';

// Render pipeline
import { PRESETS as _PRESETS } from './render.js';
export { render, normalizeConfig, buildLayoutSidecar, PRESETS } from './render.js';
export type { NormalizedConfig, RenderOptions, RenderResult } from './render.js';

// Revision system
export { applyRevisions } from './revise.js';
export type { RevisionAction, RevisionActionType, RevisionResult } from './revise.js';

// Variation engine
export { generateVariants } from './variations.js';
export type { BatchOptions, VariationRule } from './variations.js';

/**
 * Get the full registry of available primitives and presets.
 * This is what the /studio/registry endpoint returns.
 */
export function getRegistry() {
  const primitives = _getPrimitiveRegistry();
  return {
    primitives: Object.values(primitives).map(p => ({
      id: p.id,
      configKey: p.configKey,
      variants: Object.entries(p.variants).map(([name, v]) => ({
        name,
        description: (v as { description: string }).description,
      })),
    })),
    presets: Object.entries(_PRESETS).map(([name, dims]) => ({
      name,
      width: dims.width,
      height: dims.height,
    })),
  };
}
