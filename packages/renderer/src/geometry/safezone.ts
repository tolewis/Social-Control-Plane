/**
 * Safe-zone model for StrikeFrame geometry system.
 * Three zone types: canvas (platform crop), text (readability), CTA (tappable).
 */

import * as Rect from './rect.js';
import type { LayoutElement } from './rect.js';

export interface ZoneInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeZonePreset {
  canvas: ZoneInsets;
  text: ZoneInsets;
  cta: ZoneInsets;
}

export interface SafeZones {
  canvas: Rect.Rect;
  canvasSafe: Rect.Rect;
  textSafe: Rect.Rect;
  ctaSafe: Rect.Rect;
}

export interface SafeZoneViolation {
  id: string;
  zone: 'canvas' | 'text' | 'cta';
  type: 'hard' | 'soft';
  overflow: Rect.Overflow;
  severity: number;
}

export interface SafeZoneCheckResult {
  violations: SafeZoneViolation[];
  summary: {
    total: number;
    hard: number;
    soft: number;
    pass: boolean;
    worstSeverity: number;
  };
}

export interface MobileReadabilityWarning {
  id: string;
  canvasSize?: number;
  mobileSize?: number;
  canvasHeight?: number;
  mobileHeight?: number;
  minRequired: number;
  message: string;
}

export const PRESET_SAFE_ZONES: Record<string, SafeZonePreset> = {
  'social-square': {
    canvas: { top: 40, right: 40, bottom: 40, left: 40 },
    text:   { top: 60, right: 60, bottom: 80, left: 60 },
    cta:    { top: 200, right: 60, bottom: 40, left: 60 },
  },
  'social-portrait': {
    canvas: { top: 40, right: 40, bottom: 40, left: 40 },
    text:   { top: 60, right: 60, bottom: 100, left: 60 },
    cta:    { top: 300, right: 60, bottom: 40, left: 60 },
  },
  'landscape-banner': {
    canvas: { top: 40, right: 40, bottom: 40, left: 40 },
    text:   { top: 60, right: 80, bottom: 80, left: 80 },
    cta:    { top: 200, right: 80, bottom: 40, left: 80 },
  },
  'linkedin-landscape': {
    canvas: { top: 30, right: 30, bottom: 30, left: 30 },
    text:   { top: 40, right: 50, bottom: 60, left: 50 },
    cta:    { top: 150, right: 50, bottom: 30, left: 50 },
  },
  'google-landscape': {
    canvas: { top: 30, right: 30, bottom: 30, left: 30 },
    text:   { top: 40, right: 50, bottom: 60, left: 50 },
    cta:    { top: 150, right: 50, bottom: 30, left: 50 },
  },
  'google-portrait': {
    canvas: { top: 40, right: 40, bottom: 40, left: 40 },
    text:   { top: 60, right: 60, bottom: 80, left: 60 },
    cta:    { top: 250, right: 60, bottom: 40, left: 60 },
  },
};

const DEFAULT_SAFE_ZONE: SafeZonePreset = {
  canvas: { top: 40, right: 40, bottom: 40, left: 40 },
  text:   { top: 60, right: 60, bottom: 80, left: 60 },
  cta:    { top: 200, right: 60, bottom: 40, left: 60 },
};

export function getSafeZones(width: number, height: number, preset?: string): SafeZones {
  const base = (preset && PRESET_SAFE_ZONES[preset]) || DEFAULT_SAFE_ZONE;

  return {
    canvas: Rect.create(0, 0, width, height),
    canvasSafe: Rect.create(
      base.canvas.left, base.canvas.top,
      width - base.canvas.left - base.canvas.right,
      height - base.canvas.top - base.canvas.bottom,
    ),
    textSafe: Rect.create(
      base.text.left, base.text.top,
      width - base.text.left - base.text.right,
      height - base.text.top - base.text.bottom,
    ),
    ctaSafe: Rect.create(
      base.cta.left, base.cta.top,
      width - base.cta.left - base.cta.right,
      height - base.cta.top - base.cta.bottom,
    ),
  };
}

export function checkAll(elements: LayoutElement[], zones: SafeZones): SafeZoneCheckResult {
  const violations: SafeZoneViolation[] = [];

  for (const el of elements) {
    if (!Rect.contains(zones.canvasSafe, el.rect)) {
      violations.push({
        id: el.id, zone: 'canvas', type: 'hard',
        overflow: {
          overLeft: Math.max(0, zones.canvasSafe.left - el.rect.left),
          overTop: Math.max(0, zones.canvasSafe.top - el.rect.top),
          overRight: Math.max(0, el.rect.right - zones.canvasSafe.right),
          overBottom: Math.max(0, el.rect.bottom - zones.canvasSafe.bottom),
        },
        severity: Math.max(
          Math.max(0, zones.canvasSafe.left - el.rect.left),
          Math.max(0, zones.canvasSafe.top - el.rect.top),
          Math.max(0, el.rect.right - zones.canvasSafe.right),
          Math.max(0, el.rect.bottom - zones.canvasSafe.bottom),
        ),
      });
    }

    if (el.type === 'text' && !Rect.contains(zones.textSafe, el.rect)) {
      violations.push({
        id: el.id, zone: 'text', type: 'soft',
        overflow: {
          overLeft: Math.max(0, zones.textSafe.left - el.rect.left),
          overTop: Math.max(0, zones.textSafe.top - el.rect.top),
          overRight: Math.max(0, el.rect.right - zones.textSafe.right),
          overBottom: Math.max(0, el.rect.bottom - zones.textSafe.bottom),
        },
        severity: Math.max(
          Math.max(0, zones.textSafe.left - el.rect.left),
          Math.max(0, zones.textSafe.top - el.rect.top),
          Math.max(0, el.rect.right - zones.textSafe.right),
          Math.max(0, el.rect.bottom - zones.textSafe.bottom),
        ),
      });
    }

    if (el.type === 'cta' && !Rect.contains(zones.ctaSafe, el.rect)) {
      violations.push({
        id: el.id, zone: 'cta', type: 'hard',
        overflow: {
          overLeft: Math.max(0, zones.ctaSafe.left - el.rect.left),
          overTop: Math.max(0, zones.ctaSafe.top - el.rect.top),
          overRight: Math.max(0, el.rect.right - zones.ctaSafe.right),
          overBottom: Math.max(0, el.rect.bottom - zones.ctaSafe.bottom),
        },
        severity: Math.max(
          Math.max(0, zones.ctaSafe.left - el.rect.left),
          Math.max(0, zones.ctaSafe.top - el.rect.top),
          Math.max(0, el.rect.right - zones.ctaSafe.right),
          Math.max(0, el.rect.bottom - zones.ctaSafe.bottom),
        ),
      });
    }
  }

  const hardViolations = violations.filter(v => v.type === 'hard');
  const softViolations = violations.filter(v => v.type === 'soft');

  return {
    violations,
    summary: {
      total: violations.length,
      hard: hardViolations.length,
      soft: softViolations.length,
      pass: hardViolations.length === 0,
      worstSeverity: violations.length > 0 ? Math.max(...violations.map(v => v.severity)) : 0,
    },
  };
}

export function mobileReadabilityCheck(
  elements: LayoutElement[],
  canvasWidth: number,
  minMobileFontSize = 11,
): MobileReadabilityWarning[] {
  const scale = 375 / canvasWidth;
  const warnings: MobileReadabilityWarning[] = [];

  for (const el of elements) {
    if (el.type === 'text' && el.fontSize) {
      const mobileSize = Math.round(el.fontSize * scale * 10) / 10;
      if (mobileSize < minMobileFontSize) {
        warnings.push({
          id: el.id,
          canvasSize: el.fontSize,
          mobileSize,
          minRequired: minMobileFontSize,
          message: `${el.id} renders at ${mobileSize}px on mobile (min ${minMobileFontSize}px)`,
        });
      }
    }
    if (el.type === 'cta') {
      const mobileHeight = Math.round(el.rect.height * scale);
      if (mobileHeight < 44) {
        warnings.push({
          id: el.id,
          canvasHeight: el.rect.height,
          mobileHeight,
          minRequired: 44,
          message: `${el.id} tap target is ${mobileHeight}px on mobile (Apple minimum 44px)`,
        });
      }
    }
  }
  return warnings;
}
