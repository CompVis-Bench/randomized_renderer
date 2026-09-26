import type {
  CategoricalColorMapping,
  ChartEncoding,
  DataRow,
  LinearColorMapping,
  LinearColorStop,
  LinearSizeMapping,
  LinearSizeStop,
  SeriesStyleMapping,
} from "../types";
import { globalPalette } from "../config/global";

export const defaultColorMapping: LinearColorMapping = {
  type: "linear",
  stops: globalPalette.gradient.map((color, index) => ({
    offset: index / Math.max(1, globalPalette.gradient.length - 1),
    color,
  })),
};

export const defaultSizeMapping: LinearSizeMapping = {
  type: "linear",
  stops: [
    { offset: 0, size: 3 },
    { offset: 1, size: 9 },
  ],
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalizedColorStops(stops: LinearColorStop[]) {
  return stops
    .filter((stop) => Number.isFinite(stop.offset) && /^#[0-9a-f]{6}$/i.test(stop.color))
    .map((stop) => ({ offset: clamp01(stop.offset), color: stop.color.toLowerCase() }))
    .sort((left, right) => left.offset - right.offset);
}

function normalizedSizeStops(stops: LinearSizeStop[]) {
  return stops
    .filter((stop) => Number.isFinite(stop.offset) && Number.isFinite(stop.size))
    .map((stop) => ({ offset: clamp01(stop.offset), size: Math.max(0, stop.size) }))
    .sort((left, right) => left.offset - right.offset);
}

export function isLinearColorMapping(value: unknown): value is LinearColorMapping {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LinearColorMapping>;
  return candidate.type === "linear"
    && Array.isArray(candidate.stops)
    && (candidate.domain === undefined
      || (Array.isArray(candidate.domain)
        && candidate.domain.length === 2
        && candidate.domain.every((entry) => Number.isFinite(entry))))
    && normalizedColorStops(candidate.stops).length >= 2;
}

export function isLinearSizeMapping(value: unknown): value is LinearSizeMapping {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LinearSizeMapping>;
  return candidate.type === "linear"
    && Array.isArray(candidate.stops)
    && normalizedSizeStops(candidate.stops).length >= 2;
}

export function isCategoricalColorMapping(value: unknown): value is CategoricalColorMapping {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CategoricalColorMapping>;
  return candidate.type === "categorical"
    && !!candidate.values
    && typeof candidate.values === "object"
    && !Array.isArray(candidate.values);
}

export function isSeriesStyleMapping(value: unknown): value is SeriesStyleMapping {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SeriesStyleMapping>;
  return candidate.type === "series-style"
    && !!candidate.values
    && typeof candidate.values === "object"
    && !Array.isArray(candidate.values);
}

export function parseVisualValue(value: string, encoding: ChartEncoding) {
  const trimmed = value.trim();
  if (!trimmed || encoding.type === "nominal" || encoding.type === "ordinal") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function visualDomain(rows: DataRow[], encoding: ChartEncoding | undefined): [number, number] | null {
  if (!encoding || encoding.type === "nominal" || encoding.type === "ordinal") return null;
  const values = rows.flatMap((row) => {
    const value = parseVisualValue(row[encoding.field] ?? "", encoding);
    return value === null ? [] : [value];
  });
  if (values.length === 0) return null;
  return values.reduce<[number, number]>(
    ([minimum, maximum], value) => [Math.min(minimum, value), Math.max(maximum, value)],
    [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
  );
}

export function normalizeVisualValue(value: number, domain: [number, number]) {
  if (!Number.isFinite(value)) return 0.5;
  if (domain[0] === domain[1]) return 0.5;
  return clamp01((value - domain[0]) / (domain[1] - domain[0]));
}

function segmentAt<T extends { offset: number }>(stops: T[], offset: number) {
  if (offset <= stops[0]!.offset) return [stops[0]!, stops[0]!, 0] as const;
  if (offset >= stops[stops.length - 1]!.offset) {
    const last = stops[stops.length - 1]!;
    return [last, last, 0] as const;
  }
  const rightIndex = stops.findIndex((stop) => stop.offset >= offset);
  const left = stops[Math.max(0, rightIndex - 1)]!;
  const right = stops[rightIndex]!;
  const span = right.offset - left.offset;
  return [left, right, span <= 0 ? 1 : (offset - left.offset) / span] as const;
}

function rgb(color: string) {
  const value = color.slice(1);
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function hex(values: number[]) {
  return `#${values.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

export function interpolateLinearColor(mapping: LinearColorMapping, offset: number) {
  const stops = normalizedColorStops(mapping.stops);
  if (stops.length === 0) return globalPalette.categorical[0] ?? "#000000";
  const [left, right, ratio] = segmentAt(stops, clamp01(offset));
  if (left === right) return left.color;
  const from = rgb(left.color);
  const to = rgb(right.color);
  return hex(from.map((value, index) => value + (to[index]! - value) * ratio));
}

export function interpolateLinearSize(mapping: LinearSizeMapping, offset: number) {
  const stops = normalizedSizeStops(mapping.stops);
  if (stops.length === 0) return 4;
  const [left, right, ratio] = segmentAt(stops, clamp01(offset));
  return left.size + (right.size - left.size) * ratio;
}

export function mapColorValue(value: number, domain: [number, number], mapping: LinearColorMapping) {
  return interpolateLinearColor(mapping, normalizeVisualValue(value, mapping.domain ?? domain));
}

export function globalGradientColor(value: number, domain: [number, number]) {
  return mapColorValue(value, domain, defaultColorMapping);
}

export function mapSizeValue(value: number, domain: [number, number], mapping: LinearSizeMapping) {
  return interpolateLinearSize(mapping, normalizeVisualValue(value, domain));
}
