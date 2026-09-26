import { descending, extent, quickselect } from "d3-array";
import { materializeChartStructure } from "./dimensionInference";
import { getChartTemplateContract, normalizeBarChartVariant, normalizeChartTemplate } from "./chartTemplates";
import { inferCsvPrimaryKey } from "./csvDataEngine";
import { materializeChartDataTransforms } from "./chartDataTransforms";
import { adaptLegacyWideBindings } from "../chart-blocks/bindings";
import { getChartBlockSpecification } from "../chart-blocks/registry";
import type { ChartEncoding, ChartEncodingChannel, ChartSpec, Dataset } from "../types";

export const CSV_MEASURE_ID_FIELD = "__csv_measure__";
export const CSV_MEASURE_VALUE_FIELD = "__csv_value__";

export function rowMatchesChartFilters(
  row: Dataset["rows"][number],
  spec: ChartSpec,
) {
  const matchesSelection = Object.entries(spec.filters ?? {})
    .every(([field, value]) => row[field] === value);
  if (!matchesSelection) return false;
  return Object.entries(spec.valueFilters ?? {})
    .every(([field, values]) => values.includes(row[field] ?? ""));
}

export function createChartFilterPredicate(spec: ChartSpec) {
  // Compile once per chart view, rather than rebuilding entries for each row.
  const selections = Object.entries(spec.filters ?? {});
  const valueFilters = Object.entries(spec.valueFilters ?? {})
    .map(([field, values]) => [field, new Set(values)] as const);
  return (row: Dataset["rows"][number]) => selections.every(([field, value]) => row[field] === value)
    && valueFilters.every(([field, values]) => values.has(row[field] ?? ""));
}

export function filterDatasetForChart(dataset: Dataset, spec: ChartSpec): Dataset {
  const hasFilters = Object.keys(spec.filters ?? {}).length > 0
    || Object.keys(spec.valueFilters ?? {}).length > 0;
  let rows = hasFilters
    ? dataset.rows.filter(createChartFilterPredicate(spec))
    : dataset.rows;
  for (const [field, filter] of Object.entries(spec.numericFilters ?? {})) {
    const topN = normalizePositiveInteger(filter.topN);
    if (!topN) continue;
    const distinct = new Set<number>();
    for (const row of rows) {
      const value = Number(row[field] ?? "");
      if (Number.isFinite(value)) distinct.add(value);
    }
    const values = Array.from(distinct);
    if (topN < values.length) quickselect(values, topN - 1, 0, values.length - 1, descending);
    // Legacy Top N selects distinct values, including every tied source row.
    const allowed = new Set(values.slice(0, topN));
    rows = rows.filter((row) => {
      const numeric = Number(row[field] ?? "");
      return Number.isFinite(numeric) && allowed.has(numeric);
    });
  }
  if (rows.length === dataset.rows.length && !hasFilters && Object.keys(spec.numericFilters ?? {}).length === 0) return dataset;
  return {
    ...dataset,
    rows,
  };
}

/** Select the graph table consumed by a chart while preserving graph lineage. */
export function materializeGraphDataset(dataset: Dataset, spec: ChartSpec): Dataset {
  if (!dataset.graph) return dataset;
  const chartType = spec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  // Force-directed layouts consume both graph tables during rendering.
  if (chartType === "forcedirectedgraph") {
    const columns = Array.from(new Map(
      [...dataset.graph.nodes.columns, ...dataset.graph.edges.columns]
        .map((column) => [column.name, column] as const),
    ).values());
    return {
      ...dataset,
      // The inspector needs one field list while the renderer keeps the
      // separate node and edge tables as the source of truth.
      columns,
      rows: dataset.graph.nodes.rows,
    };
  }
  const template = normalizeChartTemplate(spec.chartType);
  // A composite dataset may keep a chart-local table alongside graph tables.
  // Non-flow charts consume those raw CSV rows; graph renderers retain the
  // separate node/edge lineage above and below this boundary.
  if (dataset.columns.length > 0 && dataset.rows.length > 0 && template !== "flow") {
    return dataset;
  }
  const table = template === "flow" ? dataset.graph.edges : dataset.graph.nodes;
  return {
    ...dataset,
    columns: table.columns,
    rows: table.rows,
  };
}

function normalizePositiveInteger(value: number | undefined) {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return null;
  return Math.max(1, Math.floor(value));
}

/** Replace numeric values with equal-width bin midpoints before rendering. */
export function materializeNumericBins(dataset: Dataset, spec: ChartSpec): Dataset {
  const binFields = Object.entries(spec.numericFilters ?? {})
    .map(([field, filter]) => [field, normalizePositiveInteger(filter.binCount)] as const)
    .filter((entry): entry is readonly [string, number] => !!entry[1]);
  if (binFields.length === 0) return dataset;
  let rows = dataset.rows;
  binFields.forEach(([field, binCount]) => {
    const [min, max] = extent(rows, (row) => {
      const value = Number(row[field] ?? "");
      return Number.isFinite(value) ? value : undefined;
    });
    if (min === undefined || max === undefined) return;
    const width = max === min ? 1 : (max - min) / binCount;
    rows = rows.map((row) => {
      const numeric = Number(row[field] ?? "");
      if (!Number.isFinite(numeric)) return row;
      const index = Math.min(binCount - 1, Math.max(0, Math.floor((numeric - min) / width)));
      const midpoint = min + (index + 0.5) * width;
      return { ...row, [field]: String(midpoint) };
    });
  });
  return { ...dataset, rows };
}

/** Materializes selected wide CSV value columns as ordinary long-form rows. */
export function materializeCsvValueSeries(dataset: Dataset, spec: ChartSpec) {
  const template = normalizeChartTemplate(spec.chartType);
  const barVariant = template === "bar" ? normalizeBarChartVariant(spec.chartType) : null;
  const supportsMeasureSeries = template === "line"
    || template === "area"
    || barVariant === "grouped"
    || barVariant === "stacked"
    || barVariant === "divergent-stacked";
  if (!supportsMeasureSeries) return { dataset, chartSpec: spec };
  const available = new Set(dataset.columns.map((column) => column.name));
  const measureIds = Array.from(new Set(spec.valueFields?.map((encoding) => encoding.field) ?? []))
    .filter((field) => available.has(field));
  if (measureIds.length < 2) return { dataset, chartSpec: spec };
  const rows = dataset.rows.flatMap((row) => measureIds.flatMap((measureId) => {
    const rawValue = row[measureId];
    if (rawValue === undefined || rawValue.trim() === "" || !Number.isFinite(Number(rawValue))) return [];
    return [{
      ...row,
      [CSV_MEASURE_ID_FIELD]: measureId,
      [CSV_MEASURE_VALUE_FIELD]: rawValue,
    }];
  }));
  const materializedDatasetWithoutKey: Dataset = {
    ...dataset,
    // These rows are now the explicit long-form chart view. If graph lineage
    // stays attached, the renderer selects the raw graph table again and
    // silently replaces the derived measure rows.
    graph: undefined,
    columns: [
      ...dataset.columns.filter((column) => column.name !== CSV_MEASURE_ID_FIELD && column.name !== CSV_MEASURE_VALUE_FIELD),
      { name: CSV_MEASURE_ID_FIELD, type: "nominal" },
      { name: CSV_MEASURE_VALUE_FIELD, type: "quantitative" },
    ],
    rows,
  };
  const sourceKey = dataset.primaryKey?.length ? dataset.primaryKey : undefined;
  const materializedDataset: Dataset = {
    ...materializedDatasetWithoutKey,
    primaryKey: sourceKey
      ? Array.from(new Set([...sourceKey, CSV_MEASURE_ID_FIELD]))
      : inferCsvPrimaryKey(materializedDatasetWithoutKey),
  };
  const seriesEncoding = { field: CSV_MEASURE_ID_FIELD, type: "nominal" as const };
  const priorSeriesFields = spec.seriesFields?.length
    ? spec.seriesFields
    : spec.series
      ? [spec.series]
      : [];
  const seriesFields = Array.from(new Map(
    [...priorSeriesFields, seriesEncoding].map((encoding) => [encoding.field, encoding]),
  ).values());
  const normalizedChartType = spec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  const polarBar = (normalizedChartType.startsWith("radial") || normalizedChartType.startsWith("circular"))
    && normalizedChartType.includes("barchart");
  const valueChannel: ChartEncodingChannel = polarBar
    ? normalizedChartType.startsWith("circular") ? "theta" : "radius"
    : "y";
  return {
    dataset: materializedDataset,
    chartSpec: {
      ...spec,
      encodings: {
        ...spec.encodings,
        [valueChannel]: { field: CSV_MEASURE_VALUE_FIELD, type: "quantitative" as const },
        color: seriesEncoding,
      },
      series: seriesFields[0] ?? seriesEncoding,
      seriesFields,
    },
  };
}

function synchronizeEncodingType(
  encoding: ChartEncoding | undefined,
  dataset: Dataset,
) {
  if (!encoding) return undefined;
  const column = dataset.columns.find((item) => item.name === encoding.field);
  return column ? { ...encoding, type: column.type } : encoding;
}

export function synchronizeChartEncodingTypes(spec: ChartSpec, dataset: Dataset): ChartSpec {
  const encodings = Object.fromEntries(
    (Object.entries(spec.encodings) as Array<[string, ChartEncoding | undefined]>)
      .map(([channel, encoding]) => [channel, synchronizeEncodingType(encoding, dataset)]),
  ) as ChartSpec["encodings"];
  const angleFields = spec.angleFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const parallelFields = spec.parallelFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const valueFields = spec.valueFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const seriesFields = spec.seriesFields
    ?.map((encoding) => synchronizeEncodingType(encoding, dataset))
    .filter((encoding): encoding is ChartEncoding => !!encoding);
  const componentRadiusFields = spec.componentRadiusFields
    ? Object.fromEntries(Object.entries(spec.componentRadiusFields)
      .map(([field, encoding]) => [field, synchronizeEncodingType(encoding, dataset)] as const)
      .filter((entry): entry is readonly [string, ChartEncoding] => !!entry[1]))
    : undefined;
  const seriesColumn = dataset.columns.find((item) => item.name === spec.series?.field);
  const roleBindings = spec.roleBindings
    ? Object.fromEntries(Object.entries(spec.roleBindings).map(([roleId, binding]) => [
      roleId,
      binding
        ? {
          ...binding,
          fields: binding.fields
            .map((field) => synchronizeEncodingType(field, dataset))
            .filter((field): field is ChartEncoding => !!field),
        }
        : binding,
    ])) as ChartSpec["roleBindings"]
    : undefined;

  return {
    ...spec,
    encodings,
    roleBindings,
    angleFields,
    parallelFields,
    valueFields,
    seriesFields,
    componentRadiusFields,
    series: spec.series && seriesColumn
      ? { ...spec.series, type: seriesColumn.type }
      : spec.series,
  };
}

function encodingsForChannel(spec: ChartSpec, channel: ChartEncodingChannel, role: string) {
  if (role === "series") {
    return spec.roleBindings?.series?.fields.length
      ? spec.roleBindings.series.fields
      : spec.encodings.series
        ? [spec.encodings.series]
        : spec.seriesFields?.length
          ? spec.seriesFields
          : spec.series
            ? [spec.series]
            : spec.encodings[channel]
              ? [spec.encodings[channel]!]
              : [];
  }
  if (channel === "y" && spec.valueFields?.length) return spec.valueFields;
  if (channel === "segment") {
    return spec.encodings.segment ? [spec.encodings.segment] : [];
  }
  if ((channel === "theta" || channel === "angle") && spec.angleFields?.length) return spec.angleFields;
  const encoding = spec.encodings[channel];
  return encoding ? [encoding] : [];
}

function visualKeyFields(spec: ChartSpec) {
  const contract = getChartTemplateContract(spec.chartType);
  if (!contract) return [];
  return Array.from(new Set(contract.channels.flatMap((mapping) => {
    // Renderer aggregation keeps its established key semantics while grain
    // compatibility resolves through ChartDataMode in chartContracts.
    if (mapping.role === "measure") return [];
    return encodingsForChannel(spec, mapping.channel, mapping.role)
      .filter((encoding) => encoding.type !== "quantitative")
      .map((encoding) => encoding.field);
  })));
}

function hasRepeatedVisualKey(dataset: Dataset, fields: string[]) {
  if (dataset.rows.length < 2) return false;
  const keys = new Set<string>();
  for (const row of dataset.rows) {
    const key = fields.map((field) => row[field] ?? "").join("\u0000");
    if (keys.has(key)) return true;
    keys.add(key);
  }
  return false;
}

/**
 * Detects duplicate visual keys after chart-local transforms. A categorical
 * polar Segment explicitly defines the grouping grain, so its quantitative
 * Theta value is summed automatically even when each current key is unique.
 */
export function applyAutomaticAggregations(dataset: Dataset, input: ChartSpec): ChartSpec {
  const contract = getChartTemplateContract(input.chartType);
  if (!contract || contract.aggregationPolicy !== "allowed") return input;
  const template = normalizeChartTemplate(input.chartType);
  const isPolar = template === "pie" || template === "donut";
  const hasCategoricalPolarSegment = isPolar
    && input.encodings.segment !== undefined
    && input.encodings.segment.type !== "quantitative";
  const dimensions = visualKeyFields(input);
  const repeated = hasRepeatedVisualKey(dataset, dimensions);
  const previousAuto = input.autoAggregations ?? {};
  const aggregations = { ...input.aggregations };
  Object.keys(previousAuto).forEach((channel) => {
    if (aggregations[channel as ChartEncodingChannel] === previousAuto[channel as ChartEncodingChannel]) {
      delete aggregations[channel as ChartEncodingChannel];
    }
  });
  const autoAggregations: Partial<Record<ChartEncodingChannel, "sum" | "avg">> = {};
  contract.channels.forEach((mapping) => {
    if (mapping.role !== "measure") return;
    const encodings = encodingsForChannel(input, mapping.channel, mapping.role)
      .filter((encoding) => encoding.type === "quantitative");
    if (encodings.length === 0) return;
    const shouldAggregate = hasCategoricalPolarSegment
      ? mapping.channel === "theta" || mapping.channel === "angle"
      : !isPolar && repeated;
    if (shouldAggregate
      && aggregations[mapping.channel] === undefined) {
      aggregations[mapping.channel] = "sum";
      autoAggregations[mapping.channel] = "sum";
    }
  });
  const next: ChartSpec = {
    ...input,
  };
  if (Object.keys(aggregations).length > 0) next.aggregations = aggregations;
  else delete next.aggregations;
  if (Object.keys(autoAggregations).length > 0) next.autoAggregations = autoAggregations;
  else delete next.autoAggregations;
  return next;
}

export function prepareChartData(
  chartId: string,
  sourceDataset: Dataset,
  spec: ChartSpec,
) {
  const chartDataset = materializeGraphDataset(sourceDataset, spec);
  const filteredDataset = filterDatasetForChart(chartDataset, spec);
  const adaptedSpec = adaptLegacyWideBindings(
    spec,
    filteredDataset,
    getChartBlockSpecification(spec.chartType),
  );
  const transformedDataset = materializeChartDataTransforms(filteredDataset, adaptedSpec.dataTransforms);
  const dataset = materializeNumericBins(transformedDataset, adaptedSpec);
  const synchronizedSpec = applyAutomaticAggregations(
    dataset,
    synchronizeChartEncodingTypes(adaptedSpec, dataset),
  );
  return {
    dataset,
    chartSpec: materializeChartStructure(chartId, dataset, synchronizedSpec),
  };
}
