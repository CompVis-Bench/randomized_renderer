import type {
  ChartEncodingChannel,
  ChartEncoding,
  ChartSpec,
  ChartTemplateKind,
  CoordinateChannel,
  CoordinateSystem,
  DataColumnType,
} from "../types";
import { DeclarativeChartBlockTemplate } from "../chart-blocks/ChartBlockTemplate";
import type {
  BlockFamilyId,
  BlockRoleSpecification,
  ChartBlockSpecification,
  DropAreaSpecification,
  RoleBindingModeSpecification,
  SeriesPresentationSpecification,
  SpatialReferenceSpecification,
  StructuralTargetSpecification,
} from "../chart-blocks/model";

export type EncodingRole = "dimension" | "measure" | "series" | "style";
export type EncodingEmptyLabel = "Not bound" | "Static";
export type ChartRendererKey =
  | "line"
  | "radar"
  | "scatter"
  | "bar"
  | "pie"
  | "donut"
  | "matrix"
  | ChartTemplateKind;

/**
 * Legacy renderer/UI role. Grain resolution uses the type of the completed
 * binding instead of this static hint.
 */
export type ChartChannelContract = {
  channel: ChartEncodingChannel;
  label: string;
  semanticLabel?: string;
  role: EncodingRole;
  required: boolean;
  accepts: DataColumnType[];
  emptyLabel: EncodingEmptyLabel;
  multiple?: boolean;
  /** Selection/materialization choices rendered by the generic role editor. */
  bindingModes?: readonly RoleBindingModeSpecification[];
  /** Categorical bindings stay single-select even when measure-set bindings are multi-select. */
  categoricalExclusive?: boolean;
  configurable?: boolean;
};

/** Backwards-compatible name used by encoding controls. */
export type ChartEncodingChannelSchema = ChartChannelContract;

export type ChartDimensionUpgradeSchema = {
  chartType: string;
  label: string;
  role: "series";
};

export type ChartRoleContract = {
  id: string;
  kind: "dimension" | "measure";
  accepts: DataColumnType[];
  minFields: number;
  maxFields: number;
  requiresPartition?: boolean;
  minCardinality?: number;
  maxCardinality?: number;
};

/** How a chart materializes its input rows after bindings are resolved. */
export type ChartDataMode = "grouped-scalar" | "record" | "distribution" | "derived" | "relational";

export type ChartDataModeCondition = {
  /** All listed channels must currently bind dimension fields. */
  dimensionChannels: ChartEncodingChannel[];
  resolveAs: ChartDataMode;
};

export type NestedContextPolicy = "bound-dimensions" | "node-id" | "none";

/**
 * Declarative data contract for an implemented chart block.
 *
 * `channels` describes the channel assignments exposed by the renderer. The
 * explicit capacity and uniqueness fields describe the analytical contract
 * independently of any renderer or UI implementation.
 */
export type ChartContract = {
  chartType: string;
  id: ChartTemplateKind;
  family: ChartTemplateKind;
  label: string;
  renderer: ChartRendererKey;
  rendererVersion: 1 | 3;
  coordinateSystem: Exclude<CoordinateSystem, "Geographic">;
  markRole: "line" | "point" | "bar" | "arc" | "cell" | "area" | "path" | "node" | "box" | "contour" | "hexagon" | "link";
  channels: ChartEncodingChannelSchema[];
  seriesPresentation?: SeriesPresentationSpecification;
  aggregationPolicy: "allowed" | "forbidden";
  /** Default materialization mode; conditions may refine it from a binding. */
  dataMode: ChartDataMode;
  dataModeConditions?: ChartDataModeCondition[];
  /** Default relationship context for a child nested in this chart. */
  nestedContext: NestedContextPolicy;
  requiresFunctionalDependency: boolean;
  requiresIndependentDimensions: boolean;
  allowFieldReuse: boolean;
  supportsLayerComposition: boolean;
  shareableChannels: CoordinateChannel[];
  /** Concat may use only the shared coordinate geometry, without matching data-axis encodings. */
  concatCompatibility?: "shared-channel" | "coordinate-only";
  unusedDimensionStrategies: Array<"flatten" | "facet" | "nested">;
  dimensionUpgrades: ChartDimensionUpgradeSchema[];
  /** Required channel ids for instantiating this block. */
  requiredChannels: string[];
  /** Capacity of analytical dimensions and measures represented by the block. */
  dimensions: { min: number; max: number };
  measures: { min: number; max: number };
  /** Role-level constraints used by compatibility and repair algorithms. */
  roles: ChartRoleContract[];
  /** `unique(channels...)`; omitted only for marks with no visual key. */
  uniqueness?: { channels: string[] };
  /** Alias matching the notation unique(c1, ..., ck). */
  unique?: string[];
  /** Contract-level aggregation semantics. */
  aggregation: { allowed: boolean; default: "sum" | "mean" | "count" | "none" };
};

/** Compatibility alias for existing encoding consumers. */
export type ChartEncodingSchema = ChartContract;

type SchemaDefaults = Omit<ChartContract, "chartType" | "label" | "channels" | "requiredChannels" | "dimensions" | "measures" | "roles" | "uniqueness" | "unique" | "aggregation">;

const commonStrategies: ChartEncodingSchema["unusedDimensionStrategies"] = ["flatten", "facet", "nested"];

const familyDefaults: Record<ChartTemplateKind, SchemaDefaults> = {
  line: { id: "line", family: "line", renderer: "line", rendererVersion: 3, coordinateSystem: "Cartesian", markRole: "line", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  scatter: { id: "scatter", family: "scatter", renderer: "scatter", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "point", aggregationPolicy: "forbidden", dataMode: "record", dataModeConditions: [{ dimensionChannels: ["x", "y"], resolveAs: "grouped-scalar" }], nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  bar: { id: "bar", family: "bar", renderer: "bar", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "bar", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  pie: { id: "pie", family: "pie", renderer: "pie", rendererVersion: 1, coordinateSystem: "Polar", markRole: "arc", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: true, supportsLayerComposition: true, shareableChannels: ["angle", "radius"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  donut: { id: "donut", family: "donut", renderer: "donut", rendererVersion: 1, coordinateSystem: "Polar", markRole: "arc", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: true, supportsLayerComposition: true, shareableChannels: ["angle", "radius"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  matrix: { id: "matrix", family: "matrix", renderer: "matrix", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "cell", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  area: { id: "area", family: "area", renderer: "area", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "area", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  parallel: { id: "parallel", family: "parallel", renderer: "parallel", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "path", aggregationPolicy: "forbidden", dataMode: "record", nestedContext: "none", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: true, supportsLayerComposition: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  hierarchy: { id: "hierarchy", family: "hierarchy", renderer: "hierarchy", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "node", aggregationPolicy: "allowed", dataMode: "relational", nestedContext: "node-id", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: false, shareableChannels: [], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  calendar: { id: "calendar", family: "calendar", renderer: "calendar", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "cell", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  boxplot: { id: "boxplot", family: "boxplot", renderer: "boxplot", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "box", aggregationPolicy: "allowed", dataMode: "distribution", nestedContext: "none", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  contour: { id: "contour", family: "contour", renderer: "contour", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "contour", aggregationPolicy: "allowed", dataMode: "derived", nestedContext: "none", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  hexbin: { id: "hexbin", family: "hexbin", renderer: "hexbin", rendererVersion: 1, coordinateSystem: "Cartesian", markRole: "hexagon", aggregationPolicy: "allowed", dataMode: "derived", nestedContext: "none", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: ["x", "y"], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  wordcloud: { id: "wordcloud", family: "wordcloud", renderer: "wordcloud", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "point", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
  flow: { id: "flow", family: "flow", renderer: "flow", rendererVersion: 1, coordinateSystem: "CoordinateFree", markRole: "link", aggregationPolicy: "allowed", dataMode: "grouped-scalar", nestedContext: "bound-dimensions", requiresFunctionalDependency: false, requiresIndependentDimensions: true, allowFieldReuse: false, supportsLayerComposition: true, shareableChannels: [], unusedDimensionStrategies: commonStrategies, dimensionUpgrades: [] },
};

function defineSchema(
  chartType: string,
  label: string,
  family: ChartTemplateKind,
  channels: ChartEncodingChannelSchema[],
  overrides: Partial<SchemaDefaults> = {},
): ChartContract {
  const base = { chartType, label, channels, ...familyDefaults[family], ...overrides };
  const dimensions = channels.filter((channel) => channel.role === "dimension" || channel.role === "series");
  const measures = channels.filter((channel) => channel.role === "measure");
  const requiredChannels = channels.filter((channel) => channel.required).map((channel) => channel.channel);
  const roles: ChartRoleContract[] = channels
    .filter((channel) => channel.role === "dimension" || channel.role === "series" || channel.role === "measure")
    .map((channel) => {
      const bindingModes = channel.bindingModes ?? [{
        kind: "field" as const,
        minFields: channel.required ? 1 : 0,
        maxFields: 1,
      }];
      return {
        id: channel.channel,
        kind: channel.role === "measure" ? "measure" : "dimension",
        accepts: [...channel.accepts],
        minFields: Math.min(...bindingModes.map((mode) => mode.minFields)),
        maxFields: Math.max(...bindingModes.map((mode) => mode.maxFields)),
      };
    });
  return {
    ...base,
    requiredChannels,
    dimensions: { min: dimensions.filter((channel) => channel.required).length, max: dimensions.filter((channel) => channel.multiple).length ? Number.POSITIVE_INFINITY : dimensions.length },
    measures: { min: measures.filter((channel) => channel.required).length, max: measures.filter((channel) => channel.multiple).length ? Number.POSITIVE_INFINITY : measures.length },
    roles,
    aggregation: { allowed: base.aggregationPolicy === "allowed", default: base.aggregationPolicy === "allowed" ? "sum" : "none" },
  };
}

function boundEncodings(spec: ChartSpec, channel: ChartEncodingChannel, role: EncodingRole): ChartEncoding[] {
  const canonical = spec.roleBindings?.[channel];
  if (canonical) return canonical.fields;
  if (role === "series") {
    if (spec.seriesFields?.length) return spec.seriesFields;
    if (spec.series) return [spec.series];
  }
  if (channel === "segment") return spec.encodings.segment ? [spec.encodings.segment] : [];
  if (channel === "y" && spec.valueFields?.length) return spec.valueFields;
  if ((channel === "theta" || channel === "angle") && spec.angleFields?.length) return spec.angleFields;
  const encoding = spec.encodings[channel]
    ?? (channel === "x" ? spec.encodings.column : undefined)
    ?? (channel === "y" ? spec.encodings.row : undefined);
  return encoding ? [encoding] : [];
}

export function bindingIsDimension(encoding: ChartEncoding) {
  return encoding.type !== "quantitative";
}

/** Resolve the chart's materialization mode from its completed bindings. */
export function resolveChartDataMode(spec: ChartSpec): ChartDataMode | null {
  const contract = getChartContract(spec.chartType);
  if (!contract) return null;
  const condition = contract.dataModeConditions?.find((candidate) => candidate.dimensionChannels.every((channel) => {
    const mapping = contract.channels.find((item) => item.channel === channel);
    return mapping !== undefined
      && boundEncodings(spec, channel, mapping.role).some(bindingIsDimension);
  }));
  return condition?.resolveAs ?? contract.dataMode;
}

/** Fields that form the dynamic grain of a grouped-scalar binding. */
export function groupedScalarDimensionFields(spec: ChartSpec) {
  const contract = getChartContract(spec.chartType);
  if (!contract || resolveChartDataMode(spec) !== "grouped-scalar") return [];
  return Array.from(new Set(contract.channels.flatMap((channel) =>
    boundEncodings(spec, channel.channel, channel.role)
      .filter(bindingIsDimension)
      .map((encoding) => encoding.field))));
}

export function nestedContextFields(spec: ChartSpec) {
  const contract = getChartContract(spec.chartType);
  if (!contract) return [];
  if (contract.nestedContext === "node-id") {
    return spec.encodings.key ? [spec.encodings.key.field] : [];
  }
  return contract.nestedContext === "bound-dimensions"
    ? groupedScalarDimensionFields(spec)
    : [];
}

const xAny = { channel: "x", label: "X", role: "dimension", required: true, accepts: ["ordinal", "quantitative", "nominal"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const yMeasure = { channel: "y", label: "Y", role: "measure", required: true, accepts: ["ordinal", "quantitative"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const multiLineYMeasure = {
  ...yMeasure,
  multiple: true,
  bindingModes: [
    { kind: "field", minFields: 1, maxFields: 1 },
    { kind: "fold", minFields: 2, maxFields: Number.POSITIVE_INFINITY, keyOutputRoleId: "series", valueOutputRoleId: "y" },
  ],
} satisfies ChartEncodingChannelSchema;
const lineSize = { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const lineSeries = { channel: "series", label: "Series", role: "series", required: false, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound", categoricalExclusive: true } satisfies ChartEncodingChannelSchema;
const scatterColor = { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const barX = { channel: "x", label: "X", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const categoricalBarX = { ...barX, accepts: ["nominal", "ordinal"] } satisfies ChartEncodingChannelSchema;
const barY = { channel: "y", label: "Y", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const foldedBarY = {
  ...barY,
  multiple: true,
  bindingModes: [
    { kind: "field", minFields: 1, maxFields: 1 },
    { kind: "fold", minFields: 2, maxFields: Number.POSITIVE_INFINITY, keyOutputRoleId: "series", valueOutputRoleId: "y", presentation: "grouped-series" },
  ],
} satisfies ChartEncodingChannelSchema;
const foldedStackedBarY = {
  ...barY,
  multiple: true,
  bindingModes: [
    { kind: "field", minFields: 1, maxFields: 1 },
    { kind: "fold", minFields: 2, maxFields: Number.POSITIVE_INFINITY, keyOutputRoleId: "series", valueOutputRoleId: "y", presentation: "stacked-series" },
  ],
} satisfies ChartEncodingChannelSchema;
const barStyle = { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const barSeries = { channel: "series", label: "Series", role: "series", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound", multiple: true, categoricalExclusive: true } satisfies ChartEncodingChannelSchema;
const barSize = { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema;
const polarBarCategory = { channel: "segment", label: "Category", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const polarBarValue = { channel: "radius", label: "R value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" } satisfies ChartEncodingChannelSchema;
const polarBarSeries = { channel: "series", label: "Series", role: "series", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound", categoricalExclusive: true } satisfies ChartEncodingChannelSchema;
const radialBarChannels = (stacked: boolean): ChartEncodingChannelSchema[] => [
  { channel: "theta", label: "Angular width", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Static" },
  polarBarCategory,
  polarBarValue,
  ...(stacked
    ? [polarBarSeries]
    : [{ channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" } satisfies ChartEncodingChannelSchema]),
];
const circularBarChannels = (stacked: boolean): ChartEncodingChannelSchema[] => stacked
  ? [
    { channel: "theta", label: "Theta", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "radius", label: "R", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" },
    barSeries,
    barSize,
  ]
  : [
    { ...polarBarCategory, label: "Ring" },
    { channel: "theta", label: "Theta value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
  ];
const areaChannels = (requiresSeries: boolean): ChartEncodingChannelSchema[] => [
  xAny,
  {
    ...yMeasure,
    accepts: ["quantitative"],
    multiple: true,
    bindingModes: [
      { kind: "field", minFields: 1, maxFields: 1 },
      { kind: "fold", minFields: 2, maxFields: Number.POSITIVE_INFINITY, keyOutputRoleId: "series", valueOutputRoleId: "y" },
    ],
  },
  { ...lineSeries, required: requiresSeries },
];
const hierarchyChannels: ChartEncodingChannelSchema[] = [
  { channel: "key", label: "Node ID", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "parent", label: "Parent ID", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "value", label: "Node value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
  { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" },
];
const flowChannels: ChartEncodingChannelSchema[] = [
  { channel: "source", label: "Source", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "target", label: "Target", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
  { channel: "value", label: "Flow value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
];
const lineSeriesPresentation = {
  roleId: "series",
  layout: "line",
  legend: true,
  itemProperties: ["color", "lineStyle", "strokeWidth"],
} as const satisfies SeriesPresentationSpecification;
const singleLineSeriesPresentation = {
  ...lineSeriesPresentation,
  layout: "single",
  legend: false,
} as const satisfies SeriesPresentationSpecification;
const groupedBarSeriesPresentation = {
  roleId: "series",
  layout: "grouped",
  legend: true,
  itemProperties: ["color"],
} as const satisfies SeriesPresentationSpecification;
const stackedBarSeriesPresentation = {
  roleId: "series",
  layout: "stacked",
  legend: true,
  itemProperties: ["color"],
} as const satisfies SeriesPresentationSpecification;
const areaSeriesPresentation = {
  roleId: "series",
  layout: "area",
  legend: true,
  itemProperties: ["color"],
} as const satisfies SeriesPresentationSpecification;

/**
 * Data-contract payloads used to construct the chart-block specifications.
 * The public `chartContracts` export below is projected back out of those
 * specifications for compatibility with existing inference/UI consumers.
 */
const chartContractData = {
  LineGraph: defineSchema("LineGraph", "Single Line", "line", [xAny, yMeasure], {
    aggregationPolicy: "forbidden",
    requiresFunctionalDependency: true,
    seriesPresentation: singleLineSeriesPresentation,
    dimensionUpgrades: [{ chartType: "MultiLineChart", label: "Multi-line", role: "series" }],
  }),
  MultiLineChart: defineSchema("MultiLineChart", "Multi-Line Chart", "line", [xAny, multiLineYMeasure, lineSeries], {
    seriesPresentation: lineSeriesPresentation,
  }),
  Scatterplot: defineSchema("Scatterplot", "Scatterplot", "scatter", [
    xAny,
    { ...yMeasure, accepts: ["quantitative", "ordinal", "nominal"] },
    scatterColor,
    lineSize,
  ]),
  SingleBarChart: defineSchema("SingleBarChart", "Single Bar", "bar", [barX, foldedBarY, { ...barSeries, required: false }, barSize], {
    seriesPresentation: groupedBarSeriesPresentation,
    dimensionUpgrades: [
      { chartType: "GroupedBarChart", label: "Grouped bar", role: "series" },
      { chartType: "StackedBarChart", label: "Stacked bar", role: "series" },
    ],
  }),
  GroupedBarChart: defineSchema("GroupedBarChart", "Grouped Bar", "bar", [categoricalBarX, foldedBarY, barSeries, barSize], {
    seriesPresentation: groupedBarSeriesPresentation,
  }),
  StackedBarChart: defineSchema("StackedBarChart", "Stacked Bar", "bar", [categoricalBarX, foldedStackedBarY, barSeries, barSize], {
    seriesPresentation: stackedBarSeriesPresentation,
  }),
  DivergentBarChart: defineSchema("DivergentBarChart", "Divergent Bar", "bar", [barX, barY, barStyle, barSize], {
    dimensionUpgrades: [{ chartType: "DivergentStackedBarChart", label: "Divergent stacked bar", role: "series" }],
  }),
  DivergentStackedBarChart: defineSchema("DivergentStackedBarChart", "Divergent Stacked Bar", "bar", [categoricalBarX, foldedStackedBarY, barSeries, barSize], {
    seriesPresentation: stackedBarSeriesPresentation,
  }),
  PieChart: defineSchema("PieChart", "Pie Chart", "pie", [
    { channel: "theta", label: "Theta", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Static", multiple: true, bindingModes: [{ kind: "field", minFields: 0, maxFields: 1 }, { kind: "fold", minFields: 2, maxFields: Number.POSITIVE_INFINITY, keyOutputRoleId: "segment", valueOutputRoleId: "theta" }] },
    { channel: "segment", label: "Segment", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound", categoricalExclusive: true },
    { channel: "radius", label: "R", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  ]),
  DonutChart: defineSchema("DonutChart", "Donut", "donut", [
    { channel: "theta", label: "Theta", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Static", multiple: true, bindingModes: [{ kind: "field", minFields: 0, maxFields: 1 }, { kind: "fold", minFields: 2, maxFields: Number.POSITIVE_INFINITY, keyOutputRoleId: "segment", valueOutputRoleId: "theta" }] },
    { channel: "segment", label: "Segment", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound", categoricalExclusive: true },
    { channel: "radius", label: "R", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
  ]),
  MatrixDiagram: defineSchema("MatrixDiagram", "Matrix", "matrix", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "measure", required: false, accepts: ["quantitative", "nominal"], emptyLabel: "Static" },
  ]),
  AreaChart: defineSchema("AreaChart", "Area Chart", "area", areaChannels(false), {
    seriesPresentation: areaSeriesPresentation,
    aggregationPolicy: "allowed",
    requiresFunctionalDependency: false,
    dimensionUpgrades: [{ chartType: "StackedAreaChart", label: "Stacked area", role: "series" }],
  }),
  StackedAreaChart: defineSchema("StackedAreaChart", "Stacked Area", "area", areaChannels(true), { seriesPresentation: areaSeriesPresentation }),
  Streamgraph: defineSchema("Streamgraph", "Streamgraph", "area", areaChannels(true), { seriesPresentation: areaSeriesPresentation }),
  HorizonChart: defineSchema("HorizonChart", "Horizon Chart", "area", areaChannels(true), { coordinateSystem: "CoordinateFree", shareableChannels: [], seriesPresentation: areaSeriesPresentation }),
  ParallelCoordinatesPlot: defineSchema("ParallelCoordinatesPlot", "Parallel Coordinates", "parallel", [
    { channel: "dimensions", label: "Dimensions", role: "dimension", required: true, accepts: ["quantitative", "nominal", "ordinal"], emptyLabel: "Not bound", multiple: true, bindingModes: [{ kind: "repeat", minFields: 2, maxFields: Number.POSITIVE_INFINITY }] },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
  ]),
  Icicle: defineSchema("Icicle", "Icicle", "hierarchy", hierarchyChannels),
  Sunburst: defineSchema("Sunburst", "Sunburst", "hierarchy", hierarchyChannels, {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
    concatCompatibility: "coordinate-only",
  }),
  Treemap: defineSchema("Treemap", "Treemap", "hierarchy", hierarchyChannels),
  Dendrogram: defineSchema("Dendrogram", "Dendrogram", "hierarchy", [
    ...hierarchyChannels,
    { channel: "category", label: "Leaf order", role: "dimension", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
  ], {
    coordinateSystem: "Cartesian",
    rendererVersion: 3,
    supportsLayerComposition: true,
    shareableChannels: ["x", "y"],
  }),
  RadialDendrogram: defineSchema("RadialDendrogram", "Radial Dendrogram", "hierarchy", [
    { channel: "key", label: "Node ID", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "parent", label: "Parent ID", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    // Leaf order is an optional refinement. A regular tree CSV only needs
    // node_id and parent_id; the renderer falls back to Node ID ordering.
    { channel: "theta", label: "Leaf order", role: "dimension", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
    { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" },
  ], {
    coordinateSystem: "Polar",
    rendererVersion: 3,
    supportsLayerComposition: true,
    shareableChannels: ["angle", "radius"],
    concatCompatibility: "coordinate-only",
  }),
  RadialBarChart: defineSchema("RadialBarChart", "Radial Bar (Sector)", "bar", radialBarChannels(false), {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
  }),
  RadialStackedBarChart: defineSchema("RadialStackedBarChart", "Radial Stacked Bar (Sector)", "bar", radialBarChannels(true), {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
    seriesPresentation: stackedBarSeriesPresentation,
  }),
  RadialRectBarChart: defineSchema("RadialRectBarChart", "Radial Bar (Rectangle)", "bar", radialBarChannels(false), {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
  }),
  RadialRectStackedBarChart: defineSchema("RadialRectStackedBarChart", "Radial Stacked Bar (Rectangle)", "bar", radialBarChannels(true), {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
    seriesPresentation: stackedBarSeriesPresentation,
  }),
  CircularBarChart: defineSchema("CircularBarChart", "Circular Bar", "bar", circularBarChannels(false), {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
  }),
  CircularStackedBarChart: defineSchema("CircularStackedBarChart", "Circular Stacked Bar", "bar", circularBarChannels(true), {
    coordinateSystem: "Polar",
    shareableChannels: ["angle", "radius"],
    seriesPresentation: stackedBarSeriesPresentation,
  }),
  RadarChart: defineSchema("RadarChart", "Radar Chart", "area", [
    { channel: "theta", label: "Axis", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" },
    { channel: "radius", label: "Value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { ...lineSeries, required: false },
  ], {
    renderer: "radar",
    coordinateSystem: "Polar",
    markRole: "area",
    shareableChannels: ["angle", "radius"],
    seriesPresentation: { ...areaSeriesPresentation, layout: "radar" },
  }),
  Calendar: defineSchema("Calendar", "Calendar", "calendar", [
    { channel: "date", label: "Date", role: "dimension", required: true, accepts: ["ordinal"], emptyLabel: "Not bound" },
    { channel: "value", label: "Daily value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["quantitative", "nominal"], emptyLabel: "Static" },
  ]),
  Boxplot: defineSchema("Boxplot", "Box Plot", "boxplot", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "quantitative"], emptyLabel: "Static" },
  ]),
  SingleBoxplot: defineSchema("SingleBoxplot", "Single Box Plot", "boxplot", [
    { channel: "y", label: "Value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
  ]),
  MultipleBoxplot: defineSchema("MultipleBoxplot", "Multiple Box Plot", "boxplot", [
    { channel: "x", label: "Group", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" },
    { channel: "y", label: "Value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
  ]),
  Contour: defineSchema("Contour", "Contour", "contour", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Value", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
  ]),
  Hexbin: defineSchema("Hexbin", "Hexbin", "hexbin", [
    { channel: "x", label: "X", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "y", label: "Y", role: "dimension", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "User type", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
    { channel: "shape", label: "Role style", role: "style", required: false, accepts: ["nominal", "ordinal"], emptyLabel: "Static" },
  ]),
  WordCloud: defineSchema("WordCloud", "Word Cloud", "wordcloud", [
    { channel: "x", label: "Word", semanticLabel: "Word", role: "dimension", required: true, accepts: ["nominal", "ordinal"], emptyLabel: "Not bound" },
    { channel: "y", label: "Weight", semanticLabel: "Weight", role: "measure", required: true, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
  ]),
  Chord: defineSchema("Chord", "Chord", "flow", [
    { channel: "key", label: "Node ID", role: "dimension", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    ...flowChannels,
  ], {
    coordinateSystem: "Polar",
    shareableChannels: ["angle"],
  }),
  Sankey: defineSchema("Sankey", "Sankey", "flow", flowChannels),
  ForceDirectedGraph: defineSchema("ForceDirectedGraph", "Force-Directed Graph", "flow", [
    { channel: "key", label: "Node ID", role: "dimension", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "source", label: "Source", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "target", label: "Target", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "value", label: "Link value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
    { channel: "size", label: "Size", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" },
  ], {
    markRole: "node",
    aggregationPolicy: "forbidden",
    dataMode: "relational",
    nestedContext: "node-id",
  }),
  GraphLink: defineSchema("GraphLink", "Graph Link", "flow", [
    { channel: "source", label: "Source", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "target", label: "Target", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "value", label: "Link value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
    { channel: "size", label: "Thickness", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" },
  ], {
    coordinateSystem: "Cartesian",
    markRole: "link",
    aggregationPolicy: "forbidden",
    dataMode: "relational",
    nestedContext: "none",
    shareableChannels: ["x", "y"],
  }),
  GraphLinkPolar: defineSchema("GraphLinkPolar", "Graph Link (Polar)", "flow", [
    { channel: "source", label: "Source", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "target", label: "Target", role: "dimension", required: true, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Not bound" },
    { channel: "value", label: "Link value", role: "measure", required: false, accepts: ["quantitative"], emptyLabel: "Not bound" },
    { channel: "color", label: "Color", role: "style", required: false, accepts: ["nominal", "ordinal", "quantitative"], emptyLabel: "Static" },
    { channel: "size", label: "Thickness", role: "style", required: false, accepts: ["quantitative"], emptyLabel: "Static" },
  ], {
    coordinateSystem: "Polar",
    markRole: "link",
    aggregationPolicy: "forbidden",
    dataMode: "relational",
    nestedContext: "none",
    shareableChannels: ["angle", "radius"],
  }),
} satisfies Record<string, ChartEncodingSchema>;

export type SupportedChartType = keyof typeof chartContractData;

const chartTypeFamilies: Record<SupportedChartType, readonly BlockFamilyId[]> = {
  LineGraph: ["linechart"],
  MultiLineChart: ["linechart"],
  Scatterplot: ["point"],
  SingleBarChart: ["barchart"],
  GroupedBarChart: ["barchart"],
  StackedBarChart: ["barchart"],
  DivergentBarChart: ["barchart"],
  DivergentStackedBarChart: ["barchart"],
  PieChart: ["arc"],
  DonutChart: ["arc"],
  MatrixDiagram: ["heatmap"],
  AreaChart: ["areachart"],
  StackedAreaChart: ["areachart"],
  Streamgraph: ["areachart"],
  HorizonChart: ["areachart"],
  ParallelCoordinatesPlot: ["linechart"],
  Icicle: ["tree"],
  Sunburst: ["tree"],
  Treemap: ["tree"],
  Dendrogram: ["tree"],
  RadialDendrogram: ["tree"],
  RadialBarChart: ["barchart", "arc"],
  RadialStackedBarChart: ["barchart", "arc"],
  RadialRectBarChart: ["barchart"],
  RadialRectStackedBarChart: ["barchart"],
  CircularBarChart: ["barchart", "arc"],
  CircularStackedBarChart: ["barchart", "arc"],
  RadarChart: ["areachart", "linechart", "radar"],
  Calendar: ["calendar"],
  Boxplot: ["boxplot"],
  SingleBoxplot: ["boxplot"],
  MultipleBoxplot: ["boxplot"],
  Contour: ["heatmap"],
  Hexbin: ["point", "heatmap"],
  WordCloud: ["wordcloud"],
  Chord: ["chord"],
  Sankey: ["sankey"],
  ForceDirectedGraph: ["network"],
  GraphLink: ["network"],
  GraphLinkPolar: ["network"],
};

const candidateIds: Partial<Record<SupportedChartType, string>> = {
  LineGraph: "builtin-template:line",
  MultiLineChart: "builtin-template:multi-line",
  Scatterplot: "builtin-template:scatter",
  MatrixDiagram: "builtin-template:matrix",
  SingleBarChart: "builtin-template:single-bar",
  GroupedBarChart: "builtin-template:grouped-bar",
  StackedBarChart: "builtin-template:stacked-bar",
  DivergentBarChart: "builtin-template:divergent-bar",
  DivergentStackedBarChart: "builtin-template:divergent-stacked-bar",
  AreaChart: "builtin-template:area-chart",
  StackedAreaChart: "builtin-template:stacked-area-chart",
  HorizonChart: "builtin-template:horizon-chart",
  ParallelCoordinatesPlot: "builtin-template:parallel-coordinates",
  PieChart: "builtin-template:pie",
  DonutChart: "builtin-template:donut",
  RadialBarChart: "builtin-template:radial-bar-chart",
  RadialStackedBarChart: "builtin-template:radial-stacked-bar-chart",
  RadialRectBarChart: "builtin-template:radial-rect-bar-chart",
  RadialRectStackedBarChart: "builtin-template:radial-rect-stacked-bar-chart",
  CircularBarChart: "builtin-template:circular-bar-chart",
  CircularStackedBarChart: "builtin-template:circular-stacked-bar-chart",
  RadarChart: "builtin-template:radar-chart",
  Icicle: "builtin-template:icicle",
  Sunburst: "builtin-template:sunburst",
  Treemap: "builtin-template:treemap",
  Dendrogram: "builtin-template:dendrogram",
  RadialDendrogram: "builtin-template:radial-dendrogram",
  ForceDirectedGraph: "builtin-template:force-directed-graph",
  GraphLink: "builtin-template:graph-link",
  GraphLinkPolar: "builtin-template:graph-link-polar",
  WordCloud: "builtin-template:word-cloud",
};

const familyOrders: Partial<Record<BlockFamilyId, readonly SupportedChartType[]>> = {
  tree: ["Sunburst", "Icicle", "Treemap", "Dendrogram", "RadialDendrogram"],
};

const treeDirectionPlacement = {
  right: { channel: "y", boundary: "right", concatDirection: "horizontal", concatPosition: "after" },
  left: { channel: "y", boundary: "left", concatDirection: "horizontal", concatPosition: "before" },
  down: { channel: "x", boundary: "bottom", concatDirection: "vertical", concatPosition: "after" },
  up: { channel: "x", boundary: "top", concatDirection: "vertical", concatPosition: "before" },
} as const;

const treeDepthPlacement = {
  right: { channel: "x" },
  left: { channel: "x" },
  down: { channel: "y" },
  up: { channel: "y" },
} as const;

function catalogId(chartType: SupportedChartType) {
  return candidateIds[chartType]
    ?? `builtin-template:${chartType.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

function blockRoles(contract: ChartContract): BlockRoleSpecification[] {
  return contract.channels.map((channel) => {
    const bindingModes = channel.bindingModes ?? [{
      kind: "field" as const,
      minFields: channel.required ? 1 as const : 0 as const,
      maxFields: 1 as const,
    }];
    return {
      id: channel.channel,
      label: channel.semanticLabel ?? channel.label,
      kind: channel.channel === "key"
        ? "identity" as const
        : channel.role === "measure"
          ? "measure" as const
          : channel.role === "series"
            ? "series" as const
            : channel.role === "style"
              ? "style" as const
              : "dimension" as const,
      channel: channel.channel,
      required: channel.required,
      accepts: channel.accepts,
      minFields: Math.min(...bindingModes.map((mode) => mode.minFields)),
      maxFields: Math.max(...bindingModes.map((mode) => mode.maxFields)),
      bindingModes,
      editor: {
        label: channel.label,
        emptyLabel: channel.emptyLabel,
        configurable: channel.configurable !== false,
        categoricalExclusive: channel.categoricalExclusive,
      },
    };
  });
}

function edgeArea(
  id: string,
  referenceId: string,
  boundary: "left" | "right" | "top" | "bottom",
  treeDirections?: DropAreaSpecification["treeDirections"],
): DropAreaSpecification {
  return {
    id,
    operation: "concat",
    geometry: {
      kind: "outside-edge-band",
      referenceId,
      boundary,
      gapPx: 10,
      minimumThicknessPx: 18,
      maximumFraction: 0.22,
    },
    sharedReferenceIds: [referenceId],
    exclusiveGroup: "composition",
    treeDirections,
  };
}

function cartesianReferences(): SpatialReferenceSpecification[] {
  return [
    {
      id: "axis-x",
      kind: "axis",
      semantic: "position",
      exposure: "external",
      compatibility: "type-exact",
      roleIds: ["x", "column"],
      placement: { channel: "x" },
      presentation: { baseline: "axis", ticks: "scale", labels: "scale" },
    },
    {
      id: "axis-y",
      kind: "axis",
      semantic: "position",
      exposure: "external",
      compatibility: "type-exact",
      roleIds: ["y", "row"],
      placement: { channel: "y" },
      presentation: { baseline: "axis", ticks: "scale", labels: "scale" },
    },
  ];
}

function polarReferences(): SpatialReferenceSpecification[] {
  return [
    {
      id: "axis-angle",
      kind: "axis",
      semantic: "position",
      exposure: "external",
      compatibility: "type-exact",
      roleIds: ["theta", "angle", "segment"],
      placement: { channel: "angle" },
      presentation: { baseline: "axis", ticks: "scale", labels: "scale" },
    },
    {
      id: "axis-radius",
      kind: "axis",
      semantic: "position",
      exposure: "external",
      compatibility: "type-exact",
      roleIds: ["radius", "value"],
      placement: { channel: "radius" },
      presentation: { baseline: "axis", ticks: "scale", labels: "scale" },
    },
  ];
}

function standardDropAreas(
  coordinateSystem: ChartContract["coordinateSystem"],
  references: readonly SpatialReferenceSpecification[],
  layerEnabled: boolean,
): DropAreaSpecification[] {
  const areas: DropAreaSpecification[] = [];
  const ids = new Set(references.map((reference) => reference.id));
  if (coordinateSystem === "Cartesian") {
    if (ids.has("axis-y")) areas.push(edgeArea("concat-left", "axis-y", "left"), edgeArea("concat-right", "axis-y", "right"));
    if (ids.has("axis-x")) areas.push(edgeArea("concat-top", "axis-x", "top"), edgeArea("concat-bottom", "axis-x", "bottom"));
  } else if (coordinateSystem === "Polar") {
    if (ids.has("axis-angle")) {
      areas.push(
        { id: "concat-inner", operation: "concat", geometry: { kind: "outside-annulus", referenceId: "axis-angle", boundary: "inner", gapPx: 10, minimumThicknessPx: 18, maximumFraction: 0.22 }, sharedReferenceIds: ["axis-angle"], exclusiveGroup: "composition" },
        { id: "concat-outer", operation: "concat", geometry: { kind: "outside-annulus", referenceId: "axis-angle", boundary: "outer", gapPx: 10, minimumThicknessPx: 18, maximumFraction: 0.22 }, sharedReferenceIds: ["axis-angle"], exclusiveGroup: "composition" },
      );
    }
    if (ids.has("axis-radius")) {
      areas.push(
        { id: "concat-start", operation: "concat", geometry: { kind: "outside-angular-band", referenceId: "axis-radius", boundary: "start", gapPx: 10, minimumThicknessPx: 18, maximumAngle: 45 }, sharedReferenceIds: ["axis-radius"], exclusiveGroup: "composition" },
        { id: "concat-end", operation: "concat", geometry: { kind: "outside-angular-band", referenceId: "axis-radius", boundary: "end", gapPx: 10, minimumThicknessPx: 18, maximumAngle: 45 }, sharedReferenceIds: ["axis-radius"], exclusiveGroup: "composition" },
      );
    }
  }
  if (layerEnabled && references.some((reference) => reference.exposure === "external")) {
    areas.push({ id: "layer-body", operation: "layer", geometry: { kind: "body-inset", insetPx: 10 }, sharedReferenceIds: references.filter((reference) => reference.exposure === "external").map((reference) => reference.id), exclusiveGroup: "composition" });
  }
  areas.push(
    { id: "nested-mark", operation: "nested", geometry: { kind: "structural-target", targetId: "marks" }, sharedReferenceIds: [], exclusiveGroup: "nested" },
    { id: "enter", operation: "enter", geometry: { kind: "enter-portal", maximumDiameterPx: 72 }, sharedReferenceIds: [], exclusiveGroup: "navigation" },
  );
  return areas;
}

function standardStructuralTargets(contract: ChartContract): StructuralTargetSpecification[] {
  return [{
    id: "marks",
    markRole: contract.markRole,
    repeated: true,
    contextRoleIds: contract.nestedContext === "node-id" ? ["key"] : contract.roles.filter((role) => role.kind === "dimension").map((role) => role.id),
    anchorReferenceId: "mark-anchors",
  }];
}

function standardSpatialReferences(contract: ChartContract): SpatialReferenceSpecification[] {
  if (contract.chartType === "Dendrogram") {
    return [
      {
        id: "tree-leaf-axis",
        kind: "derived-axis",
        semantic: "tree-leaf",
        exposure: "external",
        compatibility: "tree-leaf-domain",
        roleIds: ["category", "key"],
        placementByTreeDirection: treeDirectionPlacement,
        domainResolver: { kind: "terminal-leaves", keyRoleId: "key", parentRoleId: "parent", orderRoleIds: ["category", "key"] },
        presentation: { baseline: "none", ticks: "terminal-node-centers", labels: "terminal-node-labels" },
      },
      {
        id: "tree-depth-axis",
        kind: "derived-axis",
        semantic: "hierarchy-depth",
        exposure: "internal",
        compatibility: "hierarchy-depth",
        placementByTreeDirection: treeDepthPlacement,
        domainResolver: { kind: "hierarchy-depth", keyRoleId: "key", parentRoleId: "parent" },
        presentation: { baseline: "none", ticks: "none", labels: "none" },
      },
      { id: "mark-anchors", kind: "anchor-set", semantic: "mark-anchor", exposure: "internal", compatibility: "type-exact", roleIds: ["key"], placement: { channel: "anchor" } },
    ];
  }
  if (contract.chartType === "RadialDendrogram") {
    return [
      {
        id: "tree-leaf-axis",
        kind: "derived-axis",
        semantic: "tree-leaf",
        exposure: "external",
        compatibility: "tree-leaf-domain",
        roleIds: ["theta", "key"],
        placement: { channel: "angle", boundary: "outer", concatDirection: "radial", concatPosition: "after" },
        domainResolver: { kind: "terminal-leaves", keyRoleId: "key", parentRoleId: "parent", orderRoleIds: ["theta", "angle", "key"] },
        presentation: { baseline: "none", ticks: "terminal-node-centers", labels: "terminal-node-labels" },
      },
      {
        id: "tree-depth-axis",
        kind: "derived-axis",
        semantic: "hierarchy-depth",
        exposure: "conditional",
        compatibility: "hierarchy-depth",
        placement: { channel: "radius" },
        domainResolver: { kind: "hierarchy-depth", keyRoleId: "key", parentRoleId: "parent" },
        presentation: { baseline: "none", ticks: "none", labels: "none" },
        conditionalPartnerCapability: "hierarchy-depth",
      },
      { id: "mark-anchors", kind: "anchor-set", semantic: "mark-anchor", exposure: "internal", compatibility: "type-exact", roleIds: ["key"], placement: { channel: "anchor" } },
    ];
  }
  const references = contract.coordinateSystem === "Cartesian"
    ? cartesianReferences()
    : contract.coordinateSystem === "Polar"
      ? polarReferences()
      : [];
  if (contract.chartType === "Sunburst") {
    const radius = references.find((reference) => reference.id === "axis-radius");
    if (radius) {
      radius.semantic = "hierarchy-depth";
      radius.exposure = "conditional";
      radius.compatibility = "hierarchy-depth";
      radius.conditionalPartnerCapability = "hierarchy-depth";
      radius.domainResolver = { kind: "hierarchy-depth", keyRoleId: "key", parentRoleId: "parent" };
    }
  }
  const declaredRoles = new Set(contract.channels.map((channel) => channel.channel));
  references.forEach((reference) => {
    if (reference.roleIds) {
      const roleIds = reference.roleIds.filter((roleId) => declaredRoles.has(roleId as ChartEncodingChannel));
      reference.roleIds = roleIds.length ? roleIds : undefined;
    }
  });
  return [
    ...references,
    { id: "mark-anchors", kind: "anchor-set", semantic: "mark-anchor", exposure: "internal", compatibility: "type-exact", roleIds: contract.nestedContext === "node-id" ? ["key"] : undefined, placement: { channel: "anchor" } },
  ];
}

function treeDropAreas(contract: ChartContract): DropAreaSpecification[] | null {
  if (contract.chartType === "Dendrogram") {
    return [
      edgeArea("concat-leaf-left", "tree-leaf-axis", "left", ["right", "left"]),
      edgeArea("concat-leaf-right", "tree-leaf-axis", "right", ["right", "left"]),
      edgeArea("concat-leaf-top", "tree-leaf-axis", "top", ["down", "up"]),
      edgeArea("concat-leaf-bottom", "tree-leaf-axis", "bottom", ["down", "up"]),
      { id: "layer-leaf", operation: "layer", geometry: { kind: "body-inset", insetPx: 10 }, sharedReferenceIds: ["tree-leaf-axis"], exclusiveGroup: "composition" },
      { id: "nested-node", operation: "nested", geometry: { kind: "structural-target", targetId: "marks" }, sharedReferenceIds: [], exclusiveGroup: "nested" },
      { id: "enter", operation: "enter", geometry: { kind: "enter-portal", maximumDiameterPx: 72 }, sharedReferenceIds: [], exclusiveGroup: "navigation" },
    ];
  }
  if (contract.chartType === "RadialDendrogram") {
    return [
      { id: "concat-leaf-outer", operation: "concat", geometry: { kind: "outside-annulus", referenceId: "tree-leaf-axis", boundary: "outer", gapPx: 10, minimumThicknessPx: 18, maximumFraction: 0.22 }, sharedReferenceIds: ["tree-leaf-axis"], exclusiveGroup: "composition" },
      { id: "concat-depth-start", operation: "concat", geometry: { kind: "outside-angular-band", referenceId: "tree-depth-axis", boundary: "start", gapPx: 10, minimumThicknessPx: 18, maximumAngle: 45 }, sharedReferenceIds: ["tree-depth-axis"], exclusiveGroup: "composition", requiresPartnerCapability: "hierarchy-depth" },
      { id: "concat-depth-end", operation: "concat", geometry: { kind: "outside-angular-band", referenceId: "tree-depth-axis", boundary: "end", gapPx: 10, minimumThicknessPx: 18, maximumAngle: 45 }, sharedReferenceIds: ["tree-depth-axis"], exclusiveGroup: "composition", requiresPartnerCapability: "hierarchy-depth" },
      { id: "layer-leaf", operation: "layer", geometry: { kind: "body-inset", insetPx: 10 }, sharedReferenceIds: ["tree-leaf-axis"], exclusiveGroup: "composition" },
      { id: "nested-node", operation: "nested", geometry: { kind: "structural-target", targetId: "marks" }, sharedReferenceIds: [], exclusiveGroup: "nested" },
      { id: "enter", operation: "enter", geometry: { kind: "enter-portal", maximumDiameterPx: 72 }, sharedReferenceIds: [], exclusiveGroup: "navigation" },
    ];
  }
  return null;
}

function createBlockSpecification(chartType: SupportedChartType): ChartBlockSpecification<ChartContract> {
  const contract = chartContractData[chartType];
  const references = standardSpatialReferences(contract);
  const specialTreeDropAreas = treeDropAreas(contract);
  const dropAreas = specialTreeDropAreas ?? standardDropAreas(
    contract.coordinateSystem,
    references,
    contract.supportsLayerComposition,
  );
  if (chartType === "Sunburst") {
    dropAreas.forEach((area) => {
      if (area.sharedReferenceIds.includes("axis-radius")) area.requiresPartnerCapability = "hierarchy-depth";
    });
  }
  const capabilities = chartType === "Sunburst" || chartType === "RadialDendrogram"
    ? ["hierarchy", "hierarchy-depth"]
    : contract.family === "hierarchy"
      ? ["hierarchy"]
      : [];
  return {
    schemaVersion: 1,
    id: `chart-block:${chartType.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`,
    revision: 2,
    chartType,
    aliases: [],
    label: contract.label,
    families: chartTypeFamilies[chartType],
    dataShape: contract.family === "hierarchy"
      ? "hierarchy"
      : contract.family === "flow"
        ? "graph"
        : "tabular",
    data: contract,
    roles: blockRoles(contract),
    seriesPresentation: contract.seriesPresentation,
    coordinateSystem: contract.coordinateSystem,
    spatialReferences: references,
    structuralTargets: standardStructuralTargets(contract),
    composition: {
      layer: { enabled: dropAreas.some((area) => area.operation === "layer") },
      concat: { enabled: dropAreas.some((area) => area.operation === "concat") },
      facet: { enabled: true },
      nested: { asParent: true, asChild: true },
      capabilities,
      dropAreas,
    },
    renderer: { kind: "svg", key: contract.renderer, version: contract.rendererVersion },
    catalog: {
      candidateId: catalogId(chartType),
      label: contract.label,
      previewKey: chartType,
      defaultSize: contract.coordinateSystem === "Polar" ? { width: 360, height: 360 } : { width: 420, height: 260 },
      familyOrder: Object.fromEntries(chartTypeFamilies[chartType].map((family) => [
        family,
        familyOrders[family]?.indexOf(chartType) ?? Number.MAX_SAFE_INTEGER,
      ])),
      hidden: chartType === "Boxplot",
      unavailable: chartType === "GraphLinkPolar",
    },
  };
}

/** Every implemented SVG chart is represented by one inheritable template class. */
export const coreChartBlockTemplates = (Object.keys(chartContractData) as SupportedChartType[])
  .map((chartType) => new DeclarativeChartBlockTemplate(createBlockSpecification(chartType)));

export const coreChartBlockSpecifications = coreChartBlockTemplates
  .map((template) => template.specification);

/** Compatibility projection; all active values come from BlockSpecification.data. */
export const chartContracts = Object.fromEntries(coreChartBlockSpecifications
  .map((specification) => [specification.chartType, specification.data])) as typeof chartContractData;

function normalizedName(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}

const exactSchemas = new Map(
  coreChartBlockSpecifications.map((specification) => [normalizedName(specification.chartType), specification.data]),
);

const familyMatchers: Array<readonly [ChartTemplateKind, (value: string) => boolean]> = [
  ["parallel", (value) => value.includes("parallelcoordinate")],
  ["hierarchy", (value) => ["icicle", "sunburst", "treemap", "dendrogram"].some((name) => value.includes(name))],
  ["calendar", (value) => value.includes("calendar")],
  ["boxplot", (value) => value.includes("boxplot") || value.includes("boxandwhisker")],
  ["contour", (value) => value.includes("contour")],
  ["hexbin", (value) => value.includes("hexbin")],
  ["wordcloud", (value) => value.includes("wordcloud")],
  ["flow", (value) => value.includes("chord") || value.includes("sankey")],
  ["area", (value) => value.includes("area") || value.includes("streamgraph") || value.includes("horizon")],
  ["scatter", (value) => value.includes("scatter")],
  ["bar", (value) => value.includes("barchart") || value === "bar"],
  ["donut", (value) => value.includes("donut")],
  ["pie", (value) => value.includes("pie")],
  ["matrix", (value) => value.includes("matrix") || value.includes("heatmap")],
  ["line", (value) => value === "linegraph" || value.includes("linechart")],
];

const familyFallbacks: Record<ChartTemplateKind, ChartEncodingSchema> = {
  line: chartContracts.LineGraph,
  scatter: chartContracts.Scatterplot,
  bar: chartContracts.SingleBarChart,
  pie: chartContracts.PieChart,
  donut: chartContracts.DonutChart,
  matrix: chartContracts.MatrixDiagram,
  area: chartContracts.AreaChart,
  parallel: chartContracts.ParallelCoordinatesPlot,
  hierarchy: chartContracts.Icicle,
  calendar: chartContracts.Calendar,
  boxplot: chartContracts.Boxplot,
  contour: chartContracts.Contour,
  hexbin: chartContracts.Hexbin,
  wordcloud: chartContracts.WordCloud,
  flow: chartContracts.Chord,
};

export function normalizeChartFamily(chartType: string): ChartTemplateKind | null {
  const value = normalizedName(chartType);
  return exactSchemas.get(value)?.family
    ?? familyMatchers.find(([, matches]) => matches(value))?.[0]
    ?? null;
}

export function getChartContract(chartType: string): ChartContract | null {
  const value = normalizedName(chartType);
  const exact = exactSchemas.get(value);
  if (exact) return exact;
  const family = normalizeChartFamily(chartType);
  if (!family) return null;
  const fallback = familyFallbacks[family];
  return { ...fallback, chartType, label: chartType };
}

export const chartTemplateContracts = Object.fromEntries(
  (Object.keys(familyFallbacks) as ChartTemplateKind[]).map((family) => [family, familyFallbacks[family]]),
) as Record<ChartTemplateKind, ChartEncodingSchema>;
