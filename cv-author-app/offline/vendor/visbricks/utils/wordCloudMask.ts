import type { Bounds } from "../types";
import { invertMatrix, multiplyMatrix, transformPoint, type Matrix } from "../stores/canvas/coordinates";

export type WordCloudMask = {
  width: number;
  height: number;
  rows: string;
  coverage: number;
  bounds: Bounds;
};

export function encodeWordCloudMask(mask: ArrayLike<number>, width: number, height: number) {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const runs: string[] = [];
    let start = -1;
    for (let x = 0; x <= width; x += 1) {
      const allowed = x < width && Number(mask[y * width + x]) > 0;
      if (allowed && start < 0) start = x;
      if (!allowed && start >= 0) {
        runs.push(`${start}-${x}`);
        start = -1;
      }
    }
    rows.push(runs.join(","));
  }
  return rows.join(";");
}

export function decodeWordCloudMask(rows: string, width: number, height: number) {
  const mask = new Uint8Array(width * height);
  rows.split(";").slice(0, height).forEach((row, y) => {
    row.split(",").forEach((run) => {
      if (!run) return;
      const [rawStart, rawEnd] = run.split("-").map(Number);
      const start = Math.max(0, Math.min(width, Math.floor(rawStart ?? 0)));
      const end = Math.max(start, Math.min(width, Math.ceil(rawEnd ?? start)));
      for (let x = start; x < end; x += 1) mask[y * width + x] = 1;
    });
  });
  return mask;
}

function domMatrix(matrix: DOMMatrix): Matrix {
  return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
}

function geometryContains(element: SVGGraphicsElement, point: { x: number; y: number }) {
  const geometry = element as SVGGraphicsElement & {
    isPointInFill?: (point: DOMPoint) => boolean;
    isPointInStroke?: (point: DOMPoint) => boolean;
  };
  if (typeof DOMPoint === "undefined") return false;
  const localPoint = new DOMPoint(point.x, point.y);
  try {
    if (geometry.isPointInFill?.(localPoint)) return true;
  } catch {
    // Some SVG elements expose the method but do not implement fill hit testing.
  }
  try {
    if (geometry.isPointInStroke?.(localPoint)) return true;
  } catch {
    // Fall through when stroke hit testing is unavailable.
  }
  return false;
}

function geometryBoundsInScope(element: SVGGraphicsElement, relative: Matrix) {
  try {
    const box = element.getBBox();
    const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
    const stroke = style?.stroke ?? element.getAttribute("stroke") ?? "none";
    const strokeWidth = stroke === "none" ? 0 : Math.max(0, Number.parseFloat(style?.strokeWidth
      ?? element.getAttribute("stroke-width") ?? "0") || 0);
    const padding = strokeWidth / 2;
    const corners = [
      transformPoint(relative, { x: box.x - padding, y: box.y - padding }),
      transformPoint(relative, { x: box.x + box.width + padding, y: box.y - padding }),
      transformPoint(relative, { x: box.x - padding, y: box.y + box.height + padding }),
      transformPoint(relative, { x: box.x + box.width + padding, y: box.y + box.height + padding }),
    ];
    const minX = Math.min(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxX = Math.max(...corners.map((point) => point.x));
    const maxY = Math.max(...corners.map((point) => point.y));
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  } catch {
    return null;
  }
}

export function sampleSvgWordCloudMask(
  elements: SVGGraphicsElement[],
  bounds: Bounds,
  scopeElement: SVGGraphicsElement,
  maximumDimension = 240,
): WordCloudMask | null {
  if (!elements.length || bounds.width <= 0) return null;
  const scopeMatrix = scopeElement.getScreenCTM();
  if (!scopeMatrix) return null;
  const inverseScope = invertMatrix(domMatrix(scopeMatrix));
  if (!inverseScope) return null;
  const transforms = elements.flatMap((element) => {
    const screenMatrix = element.getScreenCTM();
    if (!screenMatrix) return [];
    const relative = multiplyMatrix(inverseScope, domMatrix(screenMatrix));
    const inverse = invertMatrix(relative);
    const geometryBounds = geometryBoundsInScope(element, relative);
    return inverse ? [{ element, inverse, geometryBounds }] : [];
  });
  if (!transforms.length) return null;
  const sampledBounds = transforms.reduce<Bounds | null>((merged, item) => {
    if (!item.geometryBounds) return merged;
    if (!merged) return item.geometryBounds;
    const minX = Math.min(merged.minX, item.geometryBounds.minX);
    const minY = Math.min(merged.minY, item.geometryBounds.minY);
    const maxX = Math.max(merged.maxX, item.geometryBounds.maxX);
    const maxY = Math.max(merged.maxY, item.geometryBounds.maxY);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }, null) ?? bounds;
  if (sampledBounds.width <= 0 || sampledBounds.height <= 0) return null;
  const scale = Math.min(1, maximumDimension / Math.max(sampledBounds.width, sampledBounds.height));
  const width = Math.max(8, Math.round(sampledBounds.width * scale));
  const height = Math.max(8, Math.round(sampledBounds.height * scale));
  const mask = new Uint8Array(width * height);
  let allowedCount = 0;
  let minimumAllowedX = width;
  let minimumAllowedY = height;
  let maximumAllowedX = -1;
  let maximumAllowedY = -1;
  for (let y = 0; y < height; y += 1) {
    const scopeY = sampledBounds.minY + (y + 0.5) / height * sampledBounds.height;
    for (let x = 0; x < width; x += 1) {
      const scopeX = sampledBounds.minX + (x + 0.5) / width * sampledBounds.width;
      const allowed = transforms.some(({ element, inverse }) =>
        geometryContains(element, transformPoint(inverse, { x: scopeX, y: scopeY })));
      if (!allowed) continue;
      mask[y * width + x] = 1;
      allowedCount += 1;
      minimumAllowedX = Math.min(minimumAllowedX, x);
      minimumAllowedY = Math.min(minimumAllowedY, y);
      maximumAllowedX = Math.max(maximumAllowedX, x);
      maximumAllowedY = Math.max(maximumAllowedY, y);
    }
  }
  if (!allowedCount) return null;
  const croppedWidth = maximumAllowedX - minimumAllowedX + 1;
  const croppedHeight = maximumAllowedY - minimumAllowedY + 1;
  const croppedMask = new Uint8Array(croppedWidth * croppedHeight);
  for (let y = 0; y < croppedHeight; y += 1) {
    for (let x = 0; x < croppedWidth; x += 1) {
      croppedMask[y * croppedWidth + x] = mask[(y + minimumAllowedY) * width + x + minimumAllowedX] ?? 0;
    }
  }
  const cellWidth = sampledBounds.width / width;
  const cellHeight = sampledBounds.height / height;
  const croppedBounds = {
    minX: sampledBounds.minX + minimumAllowedX * cellWidth,
    minY: sampledBounds.minY + minimumAllowedY * cellHeight,
    maxX: sampledBounds.minX + (maximumAllowedX + 1) * cellWidth,
    maxY: sampledBounds.minY + (maximumAllowedY + 1) * cellHeight,
    width: croppedWidth * cellWidth,
    height: croppedHeight * cellHeight,
  };
  return {
    width: croppedWidth,
    height: croppedHeight,
    rows: encodeWordCloudMask(croppedMask, croppedWidth, croppedHeight),
    coverage: allowedCount / croppedMask.length,
    bounds: croppedBounds,
  };
}
