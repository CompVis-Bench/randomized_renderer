import type {
  ChartEncodingChannel,
  ChartSpec,
  ChartTemplateKind,
  CoordinateChannel,
} from "../types";
import {
  chartTemplateContracts,
  getChartContract,
  normalizeChartFamily,
  type ChartEncodingChannelSchema,
  type ChartEncodingSchema,
} from "./chartContracts";

/** Compatibility exports. The declarative definitions live in chartContracts.ts. */
export { chartTemplateContracts };
export type ChartTemplateContract = ChartEncodingSchema;
export type TemplateChannelMapping = ChartEncodingChannelSchema;

export type SemanticBindingSlot =
  | "x"
  | "y"
  | "series"
  | "category"
  | "value"
  | "group"
  | "segment"
  | "theta"
  | "slice"
  | "radius"
  | "ring"
  | "row"
  | "column"
  | "cell"
  | "key"
  | "parent"
  | "source"
  | "target"
  | "date"
  | "dimensions";

export type TemplateBindingSourceKind = "dimension" | "measure" | "measure-set" | "value-series";

export type TemplateSlotContract = {
  id: SemanticBindingSlot;
  label: string;
  required: boolean;
  accepts: TemplateBindingSourceKind[];
  supportsMemberSelection?: boolean;
};

export type TemplateBindingContract = {
  templateId: ChartTemplateKind;
  slots: TemplateSlotContract[];
  unresolvedDimensionPolicies: Array<"filter" | "rollup" | "facet" | "detail">;
  compiler: "line" | "scatter" | "bar" | "arc" | "matrix";
};

const unresolvedDimensionPolicies: TemplateBindingContract["unresolvedDimensionPolicies"] = [
  "filter",
  "rollup",
  "facet",
  "detail",
];

/** Semantic data roles shown to authors. Native channels remain renderer details. */
export const templateBindingContracts: Record<ChartTemplateKind, TemplateBindingContract> = {
  line: {
    templateId: "line",
    slots: [
      { id: "x", label: "Horizontal", required: true, accepts: ["dimension", "measure"] },
      { id: "y", label: "Value", required: true, accepts: ["measure", "measure-set"] },
      { id: "series", label: "Series", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "line",
  },
  scatter: {
    templateId: "scatter",
    slots: [
      { id: "x", label: "Horizontal", required: true, accepts: ["dimension", "measure"] },
      { id: "y", label: "Vertical", required: true, accepts: ["dimension", "measure"] },
      { id: "series", label: "Series", required: false, accepts: ["dimension"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "scatter",
  },
  bar: {
    templateId: "bar",
    slots: [
      { id: "category", label: "Category", required: true, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "value", label: "Value", required: true, accepts: ["measure", "measure-set"] },
      { id: "group", label: "Group", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
      { id: "segment", label: "Segment", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "bar",
  },
  pie: {
    templateId: "pie",
    slots: [
      { id: "theta", label: "Theta", required: false, accepts: ["measure"] },
      { id: "segment", label: "Segment", required: true, accepts: ["dimension", "measure-set"], supportsMemberSelection: true },
      { id: "radius", label: "R", required: false, accepts: ["measure"] },
    ],
    unresolvedDimensionPolicies,
    compiler: "arc",
  },
  donut: {
    templateId: "donut",
    slots: [
      { id: "theta", label: "Theta", required: false, accepts: ["measure"] },
      { id: "segment", label: "Segment", required: true, accepts: ["dimension", "measure-set"], supportsMemberSelection: true },
      { id: "radius", label: "R", required: false, accepts: ["measure"] },
    ],
    unresolvedDimensionPolicies,
    compiler: "arc",
  },
  matrix: {
    templateId: "matrix",
    slots: [
      { id: "row", label: "Row", required: true, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "column", label: "Column", required: true, accepts: ["dimension"], supportsMemberSelection: true },
      { id: "cell", label: "Cell value", required: false, accepts: ["measure"] },
    ],
    unresolvedDimensionPolicies,
    compiler: "matrix",
  },
  area: {
    templateId: "area",
    slots: [
      { id: "x", label: "Horizontal", required: true, accepts: ["dimension", "measure"] },
      { id: "y", label: "Value", required: true, accepts: ["measure", "measure-set"] },
      { id: "series", label: "Series", required: false, accepts: ["dimension", "value-series"], supportsMemberSelection: true },
    ],
    unresolvedDimensionPolicies,
    compiler: "line",
  },
  parallel: { templateId: "parallel", slots: [], unresolvedDimensionPolicies, compiler: "line" },
  hierarchy: { templateId: "hierarchy", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
  calendar: { templateId: "calendar", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
  boxplot: { templateId: "boxplot", slots: [], unresolvedDimensionPolicies, compiler: "bar" },
  contour: { templateId: "contour", slots: [], unresolvedDimensionPolicies, compiler: "scatter" },
  hexbin: { templateId: "hexbin", slots: [], unresolvedDimensionPolicies, compiler: "scatter" },
  wordcloud: { templateId: "wordcloud", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
  flow: { templateId: "flow", slots: [], unresolvedDimensionPolicies, compiler: "matrix" },
};

type RequiredEncodingFallback = (spec: ChartSpec) => boolean;

const requiredEncodingFallbacks: Record<
  ChartTemplateKind,
  Partial<Record<ChartEncodingChannel, RequiredEncodingFallback>>
> = {
  line: {
    y: (spec) => !!spec.valueFields?.length,
  },
  scatter: {},
  bar: {
    y: (spec) => {
      const variant = normalizeBarChartVariant(spec.chartType);
      return (variant === "grouped" || variant === "stacked" || variant === "divergent-stacked")
        && (spec.valueFields?.length ?? 0) > 0;
    },
    color: (spec) => {
      const variant = normalizeBarChartVariant(spec.chartType);
      return (variant === "grouped" || variant === "stacked" || variant === "divergent-stacked")
        && ((spec.valueFields?.length ?? 0) > 0 || (spec.seriesFields?.length ?? 0) > 0 || !!spec.series);
    },
  },
  pie: {
    segment: (spec) => !!spec.encodings.segment || !!spec.angleFields?.length,
  },
  donut: {
    segment: (spec) => !!spec.encodings.segment || !!spec.angleFields?.length,
  },
  area: {
    y: (spec) => !!spec.valueFields?.length,
    color: (spec) => (spec.valueFields?.length ?? 0) > 0,
  },
  matrix: {
    x: (spec) => !!spec.encodings.x || !!spec.encodings.column,
    y: (spec) => !!spec.encodings.y || !!spec.encodings.row,
  },
  parallel: { dimensions: (spec) => (spec.parallelFields?.length ?? 0) >= 2 },
  hierarchy: {},
  calendar: {},
  boxplot: {},
  contour: {
    color: (spec) => !!spec.encodings.value,
  },
  hexbin: {},
  wordcloud: {},
  flow: {},
};

export function hasRequiredChartEncodings(spec: ChartSpec) {
  const template = normalizeChartTemplate(spec.chartType);
  if (!template) return false;
  const contract = getChartTemplateContract(spec.chartType);
  if (!contract) return false;
  const chartType = spec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  const seriesField = spec.roleBindings?.series?.fields[0]?.field
    ?? spec.series?.field
    ?? spec.seriesFields?.[0]?.field
    ?? spec.encodings.series?.field
    ?? (spec.encodings.color?.type === "nominal" ? spec.encodings.color.field : undefined)
    ?? (chartType === "multilinechart" && (spec.valueFields?.length ?? 0) > 0 ? "__csv_measure__" : "");
  if (chartType === "multilinechart" && !seriesField) return false;
  const barVariant = template === "bar" ? normalizeBarChartVariant(spec.chartType) : null;
  return contract.channels
    .filter((mapping) => mapping.required
      && !(template === "bar"
        && (barVariant === "grouped" || barVariant === "stacked" || barVariant === "divergent-stacked")
        && mapping.channel === "y"
        && (spec.valueFields?.length ?? 0) > 1))
    .every((mapping) => !!spec.encodings[mapping.channel]
      || (mapping.channel === "series" && !!seriesField)
      || requiredEncodingFallbacks[template][mapping.channel]?.(spec) === true);
}

export function normalizeChartTemplate(chartType: string): ChartTemplateKind | null {
  return normalizeChartFamily(chartType);
}

export function cartesianAxisEncoding(spec: ChartSpec, axis: "x" | "y") {
  // Encoding channels are semantic and remain stable when the visual axes are
  // swapped. Renderers map these channels to physical axes explicitly.
  return spec.encodings[axis];
}

/** Resolve the semantic channel represented by a physical Cartesian axis. */
export function physicalCartesianAxisChannel(spec: ChartSpec, axis: "x" | "y") {
  return spec.axisSwapped === true
    ? axis === "x" ? "y" : "x"
    : axis;
}

/** Resolve the encoding currently occupying a physical Cartesian axis. */
export function physicalCartesianAxisEncoding(spec: ChartSpec, axis: "x" | "y") {
  return spec.encodings[physicalCartesianAxisChannel(spec, axis)];
}

export type BarChartVariant = "single" | "grouped" | "stacked" | "divergent" | "divergent-stacked";

const barVariantMatchers: Array<readonly [BarChartVariant, (value: string) => boolean]> = [
  ["divergent-stacked", (value) => (value.includes("divergent") || value.includes("diverging")) && value.includes("stacked")],
  ["grouped", (value) => value.includes("grouped")],
  ["stacked", (value) => value.includes("stacked")],
  ["divergent", (value) => value.includes("divergent") || value.includes("diverging")],
];

export function normalizeBarChartVariant(chartType: string): BarChartVariant | null {
  if (normalizeChartTemplate(chartType) !== "bar") return null;
  const value = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return barVariantMatchers.find(([, matches]) => matches(value))?.[0] ?? "single";
}

const channelSlotMappings: Record<ChartTemplateKind, Partial<Record<ChartEncodingChannel, SemanticBindingSlot>>> = {
  line: { x: "x", y: "y", color: "series" },
  scatter: { x: "x", y: "y", color: "series" },
  bar: { x: "category", y: "value", theta: "value", segment: "category", radius: "value" },
  pie: { theta: "theta", segment: "segment", radius: "radius" },
  donut: { theta: "theta", segment: "segment", radius: "radius" },
  matrix: { x: "column", y: "row", color: "cell" },
  area: { x: "x", y: "y", color: "series" },
  parallel: {},
  hierarchy: {},
  calendar: {},
  boxplot: {},
  contour: { x: "x", y: "y" },
  hexbin: { x: "x", y: "y" },
  wordcloud: { x: "category", y: "value" },
  flow: {},
};

export function semanticSlotForChannel(
  chartType: string,
  channel: ChartEncodingChannel,
): SemanticBindingSlot | null {
  const template = normalizeChartTemplate(chartType);
  if (!template) return null;
  const normalized = chartType.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized === "circularstackedbarchart") {
    if (channel === "theta") return "value";
    if (channel === "radius") return "category";
  }
  if ((template === "pie" || template === "donut") && channel === "angle") return "theta";
  if (template === "bar" && channel === "color") {
    const variant = normalizeBarChartVariant(chartType);
    return variant === "grouped"
      ? "group"
      : variant === "stacked" || variant === "divergent-stacked"
        ? "segment"
        : "category";
  }
  return channelSlotMappings[template][channel] ?? null;
}

export function getChartTemplateContract(chartType: string) {
  return getChartContract(chartType);
}

export function getDimensionChartUpgradeOptions(chartType: string) {
  return getChartContract(chartType)?.dimensionUpgrades.map(({ chartType: targetChartType, label }) => ({
    chartType: targetChartType,
    label,
  })) ?? [];
}

export function getTemplateBindingContract(chartType: string) {
  const template = normalizeChartTemplate(chartType);
  return template ? templateBindingContracts[template] : null;
}
