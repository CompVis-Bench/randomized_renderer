import type { ChartEncoding, ChartEncodingChannel, ChartSpec, CoordinateChannel, Dataset, EncodingChannel } from "../types";
import { getChartBlockSpecification } from "../chart-blocks/registry";
import { resolveBlockSurface } from "../chart-blocks/spatial";

export type CartesianTreeDirection = "right" | "left" | "down" | "up";

export function isCartesianTreeChart(chartType: string | null | undefined) {
  if (!chartType) return false;
  const specification = getChartBlockSpecification(chartType);
  return specification?.coordinateSystem === "Cartesian"
    && specification.spatialReferences.some((reference) => reference.semantic === "tree-leaf");
}

export function isPolarTreeChart(chartType: string | null | undefined) {
  if (!chartType) return false;
  const specification = getChartBlockSpecification(chartType);
  return specification?.coordinateSystem === "Polar"
    && specification.spatialReferences.some((reference) => reference.semantic === "tree-leaf");
}

export function isCoordinateTreeChart(chartType: string | null | undefined) {
  return isCartesianTreeChart(chartType) || isPolarTreeChart(chartType);
}

/** Hierarchy renderers that expose the same four-way growth direction control. */
export function isDirectionalHierarchyChart(chartType: string | null | undefined) {
  const normalized = chartType?.replace(/[\s_-]/g, "").toLowerCase();
  return normalized === "dendrogram" || normalized === "icicle" || normalized === "treemap";
}

export function normalizeCartesianTreeDirection(value: unknown): CartesianTreeDirection {
  return value === "left" || value === "down" || value === "up" ? value : "right";
}

export function cartesianTreeDirection(spec: ChartSpec | null | undefined) {
  const config = spec?.markGroups?.find((group) => group.role === "node")?.sharedConfig
    ?? spec?.markGroups?.[0]?.sharedConfig;
  return normalizeCartesianTreeDirection(config?.treeDirection);
}

export function cartesianTreeLeafAxis(direction: CartesianTreeDirection): EncodingChannel {
  return direction === "left" || direction === "right" ? "y" : "x";
}

/** The only external coordinate channel a tree exposes for composition. */
export function coordinateTreeLeafAxis(spec: ChartSpec | null | undefined): CoordinateChannel | null {
  if (!spec) return null;
  const specification = getChartBlockSpecification(spec.chartType);
  const reference = specification
    ? resolveBlockSurface(specification, spec).references.find((candidate) => candidate.semantic === "tree-leaf")
    : undefined;
  const channel = reference?.placement.channel;
  return channel === "x" || channel === "y" || channel === "angle" || channel === "radius"
    ? channel
    : null;
}

/**
 * A tree leaf axis is categorical even when node keys happen to be numeric.
 * The source encoding supplies leaf identity/order, not a continuous measure.
 */
export function coordinateTreeLeafEncoding(spec: ChartSpec | null | undefined): ChartEncoding | undefined {
  if (!spec) return undefined;
  const specification = getChartBlockSpecification(spec.chartType);
  const resolver = specification?.spatialReferences
    .find((reference) => reference.semantic === "tree-leaf")?.domainResolver;
  if (resolver?.kind !== "terminal-leaves") return undefined;
  const roleIds = [...resolver.orderRoleIds, resolver.keyRoleId];
  const encoding = roleIds.flatMap((roleId) => {
    const candidate = spec.encodings[roleId as ChartEncodingChannel];
    return candidate ? [candidate] : [];
  })[0];
  return encoding ? { ...encoding, type: "nominal" } : undefined;
}

/**
 * A hierarchy owns one structural record per node even when the CSV also
 * contains repeated observation rows (for example, one row per month).
 * Preserve the first source row so its composite row key remains a stable
 * anchor for Nested children, while the complete dataset stays available to
 * the child chart through its inherited node-id filter.
 */
export function uniqueHierarchyRows(rows: Dataset["rows"], keyField: string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = (row[keyField] ?? "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Values represented by terminal nodes on a Cartesian dendrogram's leaf axis.
 * The axis uses the same ordering encoding as the renderer (category, then
 * key), while hierarchy membership is determined from key/parent links.
 */
export function cartesianTreeLeafValues(spec: ChartSpec | null | undefined, rows: Dataset["rows"] = []) {
  if (!isCartesianTreeChart(spec?.chartType)) return [];
  return coordinateTreeLeafValues(spec, rows);
}

/** Ordered values represented by terminal nodes on either tree coordinate system. */
export function coordinateTreeLeafValues(spec: ChartSpec | null | undefined, rows: Dataset["rows"] = []) {
  if (!isCoordinateTreeChart(spec?.chartType)) return [];
  const specification = spec ? getChartBlockSpecification(spec.chartType) : null;
  const resolver = specification?.spatialReferences
    .find((reference) => reference.semantic === "tree-leaf")?.domainResolver;
  if (resolver?.kind !== "terminal-leaves") return [];
  const keyField = spec?.encodings[resolver.keyRoleId as ChartEncodingChannel]?.field;
  const parentField = spec?.encodings[resolver.parentRoleId as ChartEncodingChannel]?.field;
  if (!keyField || !parentField) return [];
  const childKeys = new Set(rows
    .map((row) => row[parentField])
    .filter((value): value is string => value !== undefined && value !== "")
    .map(String));
  const orderField = resolver.orderRoleIds
    .flatMap((roleId) => {
      const candidate = spec?.encodings[roleId as ChartEncodingChannel];
      return candidate ? [candidate.field] : [];
    })[0]
    ?? keyField;
  const terminalRows = rows.filter((row) => !childKeys.has(String(row[keyField] ?? "")));
  terminalRows.sort((left, right) => {
    const order = String(left[orderField] ?? left[keyField] ?? "")
      .localeCompare(String(right[orderField] ?? right[keyField] ?? ""), undefined, { numeric: true });
    return order || String(left[keyField] ?? "").localeCompare(String(right[keyField] ?? ""), undefined, { numeric: true });
  });
  const values = terminalRows
    .map((row) => row[orderField] ?? row[keyField])
    .filter((value): value is string => value !== undefined && value !== "")
    .map(String);
  return Array.from(new Set(values));
}
