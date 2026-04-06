/**
 * Canonical rectangle model for StrikeFrame geometry system.
 * Every visual element exposes its position and size through this model.
 * All coordinates are in canvas pixels, origin top-left.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly area: number;
}

export interface Overflow {
  overLeft: number;
  overTop: number;
  overRight: number;
  overBottom: number;
}

export interface Collision {
  a: string;
  b: string;
  intersection: Rect;
}

export interface SafeZoneViolation {
  id: string;
  violation: Overflow;
  severity: number;
}

export interface OccupancyResult {
  totalOccupied: number;
  canvasArea: number;
  occupancyRatio: number;
  boundingBox: Rect | null;
  boundingBoxRatio?: number;
}

export interface LayoutElement {
  id: string;
  type: string;
  rect: Rect;
  fontSize?: number;
}

export interface DirectionalGaps {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AnchorPoint {
  x: number;
  y: number;
}

export const ANCHORS = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
] as const;

export function create(x: number, y: number, width: number, height: number): Rect {
  const left = x;
  const top = y;
  const right = x + width;
  const bottom = y + height;
  return Object.freeze({
    x, y, width, height,
    left, top, right, bottom,
    centerX: x + width / 2,
    centerY: y + height / 2,
    area: width * height,
  });
}

export function fromBounds(left: number, top: number, right: number, bottom: number): Rect {
  return create(left, top, right - left, bottom - top);
}

export function fromObject(obj: Record<string, number | undefined>): Rect {
  if (obj.width != null && obj.height != null) {
    return create(obj.x ?? obj.left ?? 0, obj.y ?? obj.top ?? 0, obj.width, obj.height);
  }
  if (obj.right != null && obj.bottom != null) {
    return fromBounds(obj.left ?? 0, obj.top ?? 0, obj.right, obj.bottom);
  }
  return create(0, 0, 0, 0);
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function intersection(a: Rect, b: Rect): Rect | null {
  if (!overlaps(a, b)) return null;
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return create(left, top, right - left, bottom - top);
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.left >= outer.left && inner.right <= outer.right &&
         inner.top >= outer.top && inner.bottom <= outer.bottom;
}

export function containsWithMargin(outer: Rect, inner: Rect, margin: number): boolean {
  return inner.left >= outer.left + margin &&
         inner.right <= outer.right - margin &&
         inner.top >= outer.top + margin &&
         inner.bottom <= outer.bottom - margin;
}

export function gaps(a: Rect, b: Rect): DirectionalGaps {
  return {
    top: a.top - b.bottom,
    bottom: b.top - a.bottom,
    left: a.left - b.right,
    right: b.left - a.right,
  };
}

export function verticalGap(above: Rect, below: Rect): number {
  return below.top - above.bottom;
}

export function horizontalGap(leftRect: Rect, rightRect: Rect): number {
  return rightRect.left - leftRect.right;
}

export function distance(a: Rect, b: Rect): number {
  const dx = Math.max(0, a.left - b.right, b.left - a.right);
  const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
  return Math.sqrt(dx * dx + dy * dy);
}

export function anchor(rect: Rect, anchorName: string): AnchorPoint {
  const parts = anchorName.split('-');
  if (parts.length === 1 && parts[0] === 'center') {
    return { x: rect.centerX, y: rect.centerY };
  }
  const vPart = parts[0];
  const hPart = parts[1] || 'center';
  let x: number, y: number;
  switch (vPart) {
    case 'top': y = rect.top; break;
    case 'center': y = rect.centerY; break;
    case 'bottom': y = rect.bottom; break;
    default: y = rect.top;
  }
  switch (hPart) {
    case 'left': x = rect.left; break;
    case 'center': x = rect.centerX; break;
    case 'right': x = rect.right; break;
    default: x = rect.left;
  }
  return { x, y };
}

export function expand(rect: Rect, amount: number): Rect {
  return create(rect.x - amount, rect.y - amount, rect.width + amount * 2, rect.height + amount * 2);
}

export function contract(rect: Rect, amount: number): Rect {
  return expand(rect, -amount);
}

export function expandSides(rect: Rect, sides: { top?: number; right?: number; bottom?: number; left?: number }): Rect {
  const t = sides.top ?? 0;
  const r = sides.right ?? 0;
  const b = sides.bottom ?? 0;
  const l = sides.left ?? 0;
  return create(rect.x - l, rect.y - t, rect.width + l + r, rect.height + t + b);
}

export function occupancy(inner: Rect, outer: Rect): number {
  if (outer.area === 0) return 0;
  return inner.area / outer.area;
}

export function coverageRatio(inner: Rect, outer: Rect): number {
  const inter = intersection(inner, outer);
  if (!inter || outer.area === 0) return 0;
  return inter.area / outer.area;
}

export function findCollisions(elements: LayoutElement[]): Collision[] {
  const collisions: Collision[] = [];
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];
      // Skip intra-primitive containment
      if (a.type === 'layout' && b.id.startsWith(a.id.split('.').slice(0, -1).join('.') + '.')) continue;
      if (b.type === 'layout' && a.id.startsWith(b.id.split('.').slice(0, -1).join('.') + '.')) continue;
      const aParts = a.id.split('.');
      const bParts = b.id.split('.');
      if (aParts.length >= 2 && bParts.length >= 2 && aParts[0] === bParts[0]) {
        if (a.type === 'layout' || b.type === 'layout') continue;
      }
      const inter = intersection(a.rect, b.rect);
      if (inter && inter.area > 0) {
        collisions.push({ a: a.id, b: b.id, intersection: inter });
      }
    }
  }
  return collisions;
}

export function findSafeZoneViolations(elements: LayoutElement[], safeZone: Rect): SafeZoneViolation[] {
  const violations: SafeZoneViolation[] = [];
  for (const el of elements) {
    if (!contains(safeZone, el.rect)) {
      const overLeft = Math.max(0, safeZone.left - el.rect.left);
      const overTop = Math.max(0, safeZone.top - el.rect.top);
      const overRight = Math.max(0, el.rect.right - safeZone.right);
      const overBottom = Math.max(0, el.rect.bottom - safeZone.bottom);
      violations.push({
        id: el.id,
        violation: { overLeft, overTop, overRight, overBottom },
        severity: Math.max(overLeft, overTop, overRight, overBottom),
      });
    }
  }
  return violations;
}

export function computeOccupancy(elements: LayoutElement[], canvas: Rect): OccupancyResult {
  if (elements.length === 0) {
    return { totalOccupied: 0, canvasArea: canvas.area, occupancyRatio: 0, boundingBox: null };
  }
  let minLeft = Infinity, minTop = Infinity, maxRight = -Infinity, maxBottom = -Infinity;
  let totalArea = 0;
  for (const el of elements) {
    const r = el.rect;
    if (r.left < minLeft) minLeft = r.left;
    if (r.top < minTop) minTop = r.top;
    if (r.right > maxRight) maxRight = r.right;
    if (r.bottom > maxBottom) maxBottom = r.bottom;
    totalArea += r.area;
  }
  const boundingBox = fromBounds(minLeft, minTop, maxRight, maxBottom);
  return {
    totalOccupied: totalArea,
    canvasArea: canvas.area,
    occupancyRatio: canvas.area > 0 ? totalArea / canvas.area : 0,
    boundingBox,
    boundingBoxRatio: canvas.area > 0 ? boundingBox.area / canvas.area : 0,
  };
}
