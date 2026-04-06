/**
 * Revision action system — translates human annotations into config mutations.
 *
 * Closed vocabulary of actions, each mapping to specific config parameter changes.
 * Designed to be unambiguous enough for a 7B model to parse correctly.
 */

/* ------------------------------------------------------------------ */
/*  Revision Action Types                                               */
/* ------------------------------------------------------------------ */

export type RevisionActionType =
  | 'resize'
  | 'reposition'
  | 'recolor'
  | 'adjust-contrast'
  | 'remove'
  | 'change-font'
  | 'crop';

export interface RevisionAction {
  /** Element ID from layout sidecar (e.g. 'headline', 'cta', 'subhead') */
  target: string;
  /** Action to take */
  action: RevisionActionType;
  /** Direction/intensity hint */
  direction?: 'smaller' | 'larger' | 'up' | 'down' | 'left' | 'right' | 'more' | 'less';
  /** Optional explicit value override */
  value?: number | string;
  /** Human reason (for audit trail) */
  reason?: string;
}

export interface RevisionResult {
  /** The config delta that was applied */
  delta: Record<string, unknown>;
  /** Any actions that couldn't be applied */
  skipped: Array<{ action: RevisionAction; reason: string }>;
}

/* ------------------------------------------------------------------ */
/*  Step sizes — how much each action changes a parameter               */
/* ------------------------------------------------------------------ */

const FONT_STEP = 6;        // px per resize action on text
const POSITION_STEP = 20;   // px per reposition action
const OPACITY_STEP = 0.08;  // per contrast action
const CTA_WIDTH_STEP = 20;
const CTA_HEIGHT_STEP = 6;

/* ------------------------------------------------------------------ */
/*  Revision compiler                                                   */
/* ------------------------------------------------------------------ */

/**
 * Apply revision actions to a raw config, returning the mutated config
 * and a delta describing what changed.
 */
export function applyRevisions(
  config: Record<string, unknown>,
  actions: RevisionAction[],
): { revisedConfig: Record<string, unknown>; result: RevisionResult } {

  // Deep clone config so we don't mutate the input
  const cfg = JSON.parse(JSON.stringify(config)) as Record<string, any>;
  const delta: Record<string, unknown> = {};
  const skipped: RevisionResult['skipped'] = [];

  // Ensure nested objects exist
  if (!cfg.text) cfg.text = {};
  if (!cfg.typography) cfg.typography = {};
  if (!cfg.layout) cfg.layout = {};
  if (!cfg.overlay) cfg.overlay = {};

  for (const action of actions) {
    try {
      const applied = applySingle(cfg, action, delta);
      if (!applied) {
        skipped.push({ action, reason: `No handler for ${action.action} on ${action.target}` });
      }
    } catch (err) {
      skipped.push({ action, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { revisedConfig: cfg, result: { delta, skipped } };
}

/* ------------------------------------------------------------------ */
/*  Individual action handlers                                          */
/* ------------------------------------------------------------------ */

function applySingle(
  cfg: Record<string, any>,
  action: RevisionAction,
  delta: Record<string, unknown>,
): boolean {
  const { target, direction } = action;

  switch (action.action) {
    case 'resize':
      return handleResize(cfg, target, direction, action.value, delta);
    case 'reposition':
      return handleReposition(cfg, target, direction, action.value, delta);
    case 'recolor':
      return handleRecolor(cfg, target, action.value, delta);
    case 'adjust-contrast':
      return handleContrast(cfg, target, direction, action.value, delta);
    case 'remove':
      return handleRemove(cfg, target, delta);
    case 'change-font':
      return handleChangeFont(cfg, target, action.value, delta);
    case 'crop':
      return handleCrop(cfg, target, direction, delta);
    default:
      return false;
  }
}

/* -- resize -------------------------------------------------------- */

function handleResize(
  cfg: Record<string, any>,
  target: string,
  direction: string | undefined,
  value: number | string | undefined,
  delta: Record<string, unknown>,
): boolean {
  const sign = direction === 'smaller' ? -1 : 1;
  const amount = typeof value === 'number' ? value : FONT_STEP;

  // Text elements → change font size
  if (target === 'headline') {
    const key = 'typography.headlineSize';
    const cur = cfg.typography.headlineSize ?? 56;
    cfg.typography.headlineSize = Math.max(24, Math.min(120, cur + sign * amount));
    delta[key] = cfg.typography.headlineSize;
    return true;
  }
  if (target === 'subhead') {
    const key = 'typography.subheadSize';
    const cur = cfg.typography.subheadSize ?? 28;
    cfg.typography.subheadSize = Math.max(14, Math.min(60, cur + sign * amount));
    delta[key] = cfg.typography.subheadSize;
    return true;
  }
  if (target === 'footer') {
    const key = 'typography.footerSize';
    const cur = cfg.typography.footerSize ?? 18;
    cfg.typography.footerSize = Math.max(10, Math.min(40, cur + sign * amount));
    delta[key] = cfg.typography.footerSize;
    return true;
  }
  if (target === 'cta') {
    // CTA resize adjusts button dimensions + font
    const curW = cfg.layout?.ctaWidth ?? 220;
    const curH = cfg.layout?.ctaHeight ?? 56;
    const curF = cfg.typography?.ctaSize ?? 18;
    if (!cfg.layout) cfg.layout = {};
    cfg.layout.ctaWidth = Math.max(120, Math.min(400, curW + sign * CTA_WIDTH_STEP));
    cfg.layout.ctaHeight = Math.max(36, Math.min(80, curH + sign * CTA_HEIGHT_STEP));
    cfg.typography.ctaSize = Math.max(12, Math.min(32, curF + sign * Math.round(FONT_STEP / 2)));
    delta['layout.ctaWidth'] = cfg.layout.ctaWidth;
    delta['layout.ctaHeight'] = cfg.layout.ctaHeight;
    delta['typography.ctaSize'] = cfg.typography.ctaSize;
    return true;
  }

  return false;
}

/* -- reposition ---------------------------------------------------- */

function handleReposition(
  cfg: Record<string, any>,
  target: string,
  direction: string | undefined,
  value: number | string | undefined,
  delta: Record<string, unknown>,
): boolean {
  const amount = typeof value === 'number' ? value : POSITION_STEP;
  if (!cfg.layout) cfg.layout = {};

  const yTargets: Record<string, string> = {
    headline: 'headlineY',
    subhead: 'subheadY',
    footer: 'footerY',
  };

  const layoutKey = yTargets[target];
  if (layoutKey) {
    const cur = cfg.layout[layoutKey] ?? 0;
    if (direction === 'up') {
      cfg.layout[layoutKey] = cur - amount;
    } else if (direction === 'down') {
      cfg.layout[layoutKey] = cur + amount;
    } else {
      return false;
    }
    delta[`layout.${layoutKey}`] = cfg.layout[layoutKey];
    return true;
  }

  return false;
}

/* -- recolor ------------------------------------------------------- */

function handleRecolor(
  cfg: Record<string, any>,
  target: string,
  value: number | string | undefined,
  delta: Record<string, unknown>,
): boolean {
  if (typeof value !== 'string') return false;

  const colorMap: Record<string, string> = {
    headline: 'headlineColor',
    subhead: 'bodyColor',
    footer: 'bodyColor',
    cta: 'ctaBg',
  };

  const themeKey = colorMap[target];
  if (themeKey) {
    if (!cfg.theme) cfg.theme = {};
    cfg.theme[themeKey] = value;
    delta[`theme.${themeKey}`] = value;
    return true;
  }

  return false;
}

/* -- adjust-contrast ----------------------------------------------- */

function handleContrast(
  cfg: Record<string, any>,
  target: string,
  direction: string | undefined,
  value: number | string | undefined,
  delta: Record<string, unknown>,
): boolean {
  const sign = direction === 'less' ? -1 : 1;
  const amount = typeof value === 'number' ? value : OPACITY_STEP;

  if (!cfg.overlay) cfg.overlay = {};

  // Global contrast affects all overlay panels
  if (target === 'overlay' || target === 'background') {
    const keys = ['leftOpacity', 'midOpacity', 'rightOpacity'] as const;
    for (const k of keys) {
      const cur = cfg.overlay[k] ?? 0.7;
      cfg.overlay[k] = Math.max(0.1, Math.min(1, cur + sign * amount));
      delta[`overlay.${k}`] = cfg.overlay[k];
    }
    return true;
  }

  // Vignette bottom
  if (target === 'vignette') {
    const cur = cfg.overlay.vignetteBottom ?? 0.4;
    cfg.overlay.vignetteBottom = Math.max(0, Math.min(1, cur + sign * amount));
    delta['overlay.vignetteBottom'] = cfg.overlay.vignetteBottom;
    return true;
  }

  return false;
}

/* -- remove -------------------------------------------------------- */

function handleRemove(
  cfg: Record<string, any>,
  target: string,
  delta: Record<string, unknown>,
): boolean {
  // Text elements → set to empty
  const textKeys = ['headline', 'subhead', 'cta', 'footer'] as const;
  if (textKeys.includes(target as any)) {
    if (!cfg.text) cfg.text = {};
    cfg.text[target] = '';
    delta[`text.${target}`] = '';
    return true;
  }

  // Badges
  if (target.startsWith('badge.') && Array.isArray(cfg.badges)) {
    const idx = parseInt(target.split('.')[1], 10) - 1;
    if (idx >= 0 && idx < cfg.badges.length) {
      cfg.badges.splice(idx, 1);
      delta[`badges.removed`] = idx;
      return true;
    }
  }

  return false;
}

/* -- change-font --------------------------------------------------- */

function handleChangeFont(
  cfg: Record<string, any>,
  target: string,
  value: number | string | undefined,
  delta: Record<string, unknown>,
): boolean {
  if (typeof value !== 'string') return false;
  if (!cfg.typography) cfg.typography = {};

  if (target === 'headline') {
    cfg.typography.headlineFontFamily = value;
    delta['typography.headlineFontFamily'] = value;
    return true;
  }
  if (target === 'body' || target === 'subhead' || target === 'footer') {
    cfg.typography.bodyFontFamily = value;
    delta['typography.bodyFontFamily'] = value;
    return true;
  }

  return false;
}

/* -- crop ---------------------------------------------------------- */

function handleCrop(
  cfg: Record<string, any>,
  target: string,
  direction: string | undefined,
  delta: Record<string, unknown>,
): boolean {
  if (target !== 'background') return false;

  const positions: Record<string, string> = {
    up: 'top', down: 'bottom', left: 'left', right: 'right',
  };
  if (direction && positions[direction]) {
    cfg.backgroundPosition = positions[direction];
    delta['backgroundPosition'] = cfg.backgroundPosition;
    return true;
  }

  return false;
}
