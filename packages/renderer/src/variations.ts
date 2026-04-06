/**
 * Variation engine for batch rendering.
 *
 * Takes a base config + BatchOptions and produces N variant configs
 * with controlled parameter changes. Deterministic via seed.
 */

export interface VariationRule {
  /** Config path to vary (e.g., 'layout.headlineY', 'overlay.leftOpacity') */
  path: string;
  /** Variation type */
  type: 'jitter' | 'sweep' | 'rotate';
  /** For jitter: max ± deviation. For sweep: [min, max] range. */
  range?: number | [number, number];
  /** For rotate: array of values to cycle through */
  values?: unknown[];
}

export interface BatchOptions {
  /** Number of variants to generate (1-50, default 25) */
  count?: number;
  /** Explicit variation rules. If omitted, uses smart defaults. */
  variations?: VariationRule[];
  /** Seed for deterministic output. If omitted, uses Date.now(). */
  seed?: number;
}

// Simple seeded PRNG (mulberry32)
function createRng(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let v = Math.imul(t ^ (t >>> 15), 1 | t);
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Default variation rules applied when none are specified.
 * These produce meaningful visual diversity without breaking layouts.
 */
const DEFAULT_RULES: VariationRule[] = [
  { path: 'layout.headlineY', type: 'jitter', range: 30 },
  { path: 'overlay.leftOpacity', type: 'jitter', range: 0.1 },
  { path: 'overlay.midOpacity', type: 'jitter', range: 0.08 },
  { path: 'typography.headlineSize', type: 'jitter', range: 4 },
  { path: 'typography.subheadSize', type: 'jitter', range: 2 },
  { path: 'layout.personality', type: 'rotate', values: ['editorial-left', 'centered-hero', 'split-card'] },
];

/**
 * Generate N variant configs from a base config.
 * Each variant applies controlled parameter changes per the variation rules.
 */
export function generateVariants(
  baseConfig: Record<string, unknown>,
  options: BatchOptions = {},
): Record<string, unknown>[] {
  const count = Math.min(50, Math.max(1, options.count ?? 25));
  const rules = options.variations ?? DEFAULT_RULES;
  const seed = options.seed ?? Date.now();
  const rng = createRng(seed);

  const variants: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const variant = deepClone(baseConfig) as Record<string, unknown>;

    for (const rule of rules) {
      const baseValue = getNestedValue(baseConfig as Record<string, unknown>, rule.path);

      switch (rule.type) {
        case 'jitter': {
          if (typeof baseValue === 'number' && typeof rule.range === 'number') {
            const delta = (rng() * 2 - 1) * rule.range;
            setNestedValue(variant, rule.path, Math.round((baseValue + delta) * 100) / 100);
          }
          break;
        }
        case 'sweep': {
          if (Array.isArray(rule.range) && rule.range.length === 2) {
            const [min, max] = rule.range;
            const value = min + rng() * (max - min);
            setNestedValue(variant, rule.path, Math.round(value * 100) / 100);
          }
          break;
        }
        case 'rotate': {
          if (Array.isArray(rule.values) && rule.values.length > 0) {
            const idx = i % rule.values.length;
            setNestedValue(variant, rule.path, rule.values[idx]);
          }
          break;
        }
      }
    }

    // Tag the variant for traceability
    (variant as Record<string, unknown>)._variantIndex = i;
    (variant as Record<string, unknown>)._variantSeed = seed;

    variants.push(variant);
  }

  return variants;
}
