import {
  chartTemplateContracts,
  getChartTemplateContract,
  normalizeChartTemplate,
} from "./chartTemplates";
import { isDataColumnTypeCompatible } from "../types";
import type {
  ChartEncoding,
  ChartEncodingChannel,
  ChartSpec,
  ChartTemplateKind,
  CoordinateChannel,
  DataColumn,
  DataColumnType,
  Dataset,
  DimensionRecommendation,
  MarkGroupSpec,
  SeriesCandidate,
} from "../types";
import { analyzeCsvGrain, csvRowKey } from "./csvDataEngine";
import type { ChartRepairStatus, ChartRoleBinding } from "./chartRepair";

export type ColumnDimensionProfile = {
  field: string;
  declaredType: DataColumnType;
  rowCount: number;
  validCount: number;
  missingCount: number;
  invalidCount: number;
  distinctCount: number;
  cardinalityRatio: number;
  coverage: number;
  isComparable: boolean;
  canBeCategory: boolean;
  categoryKind: "declared" | "low-cardinality-number" | "low-cardinality-ordinal" | null;
  categoryConfidence: number;
  minimum?: number;
  maximum?: number;
};

export function analyzeDimensionGrainRepairs(
  dataset: Dataset,
  keyFields: string[],
  valueFields: string[],
) {
  return analyzeCsvGrain(dataset, keyFields, valueFields, {
    candidateFields: dataset.columns
      .filter((column) => column.type !== "quantitative")
      .map((column) => column.name),
  });
}

export type ChannelDimensionStatistics = {
  channel: ChartEncodingChannel | "series";
  role: "dimension" | "measure" | "series" | "style";
  required: boolean;
  eligibleFields: string[];
  eligibleCount: number;
};

export type InferredEncodingAssignment = {
  channel: ChartEncodingChannel | "series";
  field: string;
  dataType: DataColumnType;
  semanticType: "comparable" | "category" | "measure";
};

export type TemplateEncodingCandidate = {
  id: string;
  mode: string;
  dimensionality: number;
  score: number;
  assignments: InferredEncodingAssignment[];
  reasons: string[];
};

export type TemplateEncodingStatistics = {
  templateId: ChartTemplateKind;
  rowCount: number;
  columnCount: number;
  columns: ColumnDimensionProfile[];
  channels: ChannelDimensionStatistics[];
  candidates: TemplateEncodingCandidate[];
  supportedDimensionalities: number[];
};

function normalizedValue(value: string, type: DataColumnType) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === "quantitative") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }
  return trimmed;
}

function uniqueValues(dataset: Dataset, field: string) {
  return Array.from(new Set(dataset.rows.map((row) => row[field] ?? "").filter(Boolean)));
}

export function profileDatasetDimensions(dataset: Dataset): ColumnDimensionProfile[] {
  return dataset.columns.map((column) => {
    const source = dataset.rows.map((row) => row[column.name] ?? "");
    const nonEmpty = source.filter((value) => value.trim() !== "");
    const normalized = nonEmpty
      .map((value) => normalizedValue(value, column.type))
      .filter((value): value is string | number => value !== null);
    const distinctCount = new Set(normalized).size;
    const validCount = normalized.length;
    const cardinalityRatio = validCount === 0 ? 0 : distinctCount / validCount;
    const repeated = validCount - distinctCount;
    const numeric = normalized.filter((value): value is number => typeof value === "number");
    const allIntegers = numeric.length > 0 && numeric.every(Number.isInteger);
    const lowCardinalityLimit = Math.min(20, Math.max(6, Math.round(Math.sqrt(Math.max(validCount, 1)) * 1.5)));
    const lowCardinality = distinctCount >= 2
      && distinctCount <= lowCardinalityLimit
      && repeated > 0
      && (cardinalityRatio <= 0.35 || (allIntegers && distinctCount <= 12));
    const declaredCategory = (column.type === "nominal" || column.type === "ordinal") && distinctCount >= 2;
    const promotedCategory = column.type !== "nominal" && lowCardinality;
    const categoryConfidence = declaredCategory
      ? Math.max(0.45, 1 - Math.max(0, cardinalityRatio - 0.2))
      : promotedCategory
        ? Math.min(0.88, 0.48 + (1 - cardinalityRatio) * 0.4)
        : 0;
    return {
      field: column.name,
      declaredType: column.type,
      rowCount: dataset.rows.length,
      validCount,
      missingCount: source.length - nonEmpty.length,
      invalidCount: nonEmpty.length - validCount,
      distinctCount,
      cardinalityRatio,
      coverage: source.length === 0 ? 0 : validCount / source.length,
      isComparable: (column.type === "quantitative" || column.type === "ordinal")
        && distinctCount >= 2
        && validCount >= 2,
      canBeCategory: declaredCategory || promotedCategory,
      categoryKind: declaredCategory
        ? "declared"
        : promotedCategory && column.type === "quantitative"
          ? "low-cardinality-number"
          : promotedCategory
            ? "low-cardinality-ordinal"
            : null,
      categoryConfidence,
      minimum: numeric.length ? Math.min(...numeric) : undefined,
      maximum: numeric.length ? Math.max(...numeric) : undefined,
    };
  });
}

function columnByField(dataset: Dataset) {
  return new Map(dataset.columns.map((column) => [column.name, column]));
}

function linePairScore(x: ColumnDimensionProfile, y: ColumnDimensionProfile) {
  const coverage = (x.coverage + y.coverage) / 2;
  return Math.max(0, Math.min(1, 0.58 + coverage * 0.3));
}

export function scoreSeriesFields(
  dataset: Dataset,
  xEncoding: ChartEncoding,
  yEncoding?: ChartEncoding,
  _profiles?: ColumnDimensionProfile[],
): SeriesCandidate[] {
  if (!yEncoding) return [];
  const analysis = analyzeDimensionGrainRepairs(
    dataset,
    [xEncoding.field],
    [yEncoding.field],
  );
  return analysis.candidates
    .filter((candidate) => candidate.fields.length === 1)
    .map((candidate) => {
      const field = candidate.fields[0]!;
      const profile = analysis.columnProfiles.find((item) => item.field === field)!;
      return {
        field,
        score: 1,
        groupCount: profile.distinctCount,
        averageGroupSize: profile.distinctCount
          ? profile.nonEmptyCount / profile.distinctCount
          : 0,
        coverage: 1,
        xUniqueness: candidate.resultingStatistics.conflictingValueGroupCount === 0 ? 1 : 0,
      };
    });
}

function assignment(channel: InferredEncodingAssignment["channel"], column: DataColumn, semanticType: InferredEncodingAssignment["semanticType"]): InferredEncodingAssignment {
  return { channel, field: column.name, dataType: column.type, semanticType };
}

function inferLineCandidates(dataset: Dataset, profiles: ColumnDimensionProfile[]) {
  const byColumn = columnByField(dataset);
  const comparable = profiles.filter((profile) => profile.isComparable);
  const candidates: TemplateEncodingCandidate[] = [];
  comparable.forEach((x) => comparable.forEach((y) => {
    if (x.field === y.field) return;
    const xColumn = byColumn.get(x.field)!;
    const yColumn = byColumn.get(y.field)!;
    const pairScore = linePairScore(x, y);
    candidates.push({
      id: `line:single:${x.field}:${y.field}`,
      mode: "single-line",
      dimensionality: 2,
      score: pairScore,
      assignments: [assignment("x", xColumn, "comparable"), assignment("y", yColumn, "comparable")],
      reasons: ["X and Y are comparable dimensions", "No category series is required"],
    });
    scoreSeriesFields(dataset, { field: x.field, type: x.declaredType }, { field: y.field, type: y.declaredType }, profiles)
      .filter((series) => series.score >= 0.52)
      .forEach((series) => {
        const seriesColumn = byColumn.get(series.field)!;
        candidates.push({
          id: `line:multi:${x.field}:${y.field}:${series.field}`,
          mode: "multi-line",
          dimensionality: 3,
          score: Math.min(1, pairScore * 0.52 + series.score * 0.48),
          assignments: [
            assignment("x", xColumn, "comparable"),
            assignment("y", yColumn, "comparable"),
            assignment("series", seriesColumn, "category"),
            assignment("color", seriesColumn, "category"),
          ],
          reasons: [
            "X and Y are comparable dimensions",
            `${series.field} forms ${series.groupCount} repeated category groups`,
            "Category is encoded as line color",
          ],
        });
      });
  }));
  return candidates;
}

function inferScatterCandidates(dataset: Dataset, profiles: ColumnDimensionProfile[]) {
  return inferLineCandidates(dataset, profiles).map((candidate) => ({
    ...candidate,
    id: candidate.id.replace(/^line:/, "scatter:"),
    mode: candidate.dimensionality === 3 ? "categorized-scatter" : "scatter",
  }));
}

function inferPieCandidates(dataset: Dataset, profiles: ColumnDimensionProfile[]) {
  const quantitative = profiles.filter((profile) => profile.declaredType === "quantitative" && profile.validCount > 0);
  if (quantitative.length === 0) return [];
  return quantitative.map((profile) => ({
    id: `pie:theta:${profile.field}`,
    mode: "theta-radius-axes",
    dimensionality: 1,
    score: profile.coverage,
    assignments: [assignment("theta", dataset.columns.find((column) => column.name === profile.field)!, "measure")],
    reasons: ["The quantitative field is bound to Theta"],
  } satisfies TemplateEncodingCandidate));
}

function inferMatrixCandidates(dataset: Dataset, profiles: ColumnDimensionProfile[]) {
  const categories = profiles.filter((profile) => profile.canBeCategory);
  const measures = profiles.filter((profile) => profile.declaredType === "quantitative");
  const candidates: TemplateEncodingCandidate[] = [];
  categories.forEach((row) => categories.forEach((column) => {
    if (row.field === column.field) return;
    const assignments: InferredEncodingAssignment[] = [
      assignment("y", dataset.columns.find((item) => item.name === row.field)!, "category"),
      assignment("x", dataset.columns.find((item) => item.name === column.field)!, "category"),
    ];
    if (measures[0]) assignments.push(assignment("color", dataset.columns.find((item) => item.name === measures[0]!.field)!, "measure"));
    candidates.push({
      id: `matrix:${row.field}:${column.field}:${measures[0]?.field ?? "count"}`,
      mode: measures[0] ? "value-matrix" : "count-matrix",
      dimensionality: measures[0] ? 3 : 2,
      score: (row.categoryConfidence + column.categoryConfidence + (measures[0]?.coverage ?? 1)) / 3,
      assignments,
      reasons: ["Row and column are categorical dimensions", measures[0] ? "Cell value is quantitative" : "Cells encode record counts"],
    });
  }));
  return candidates;
}

function inferDonutCandidates(dataset: Dataset, profiles: ColumnDimensionProfile[]) {
  return inferPieCandidates(dataset, profiles).map((candidate) => ({
    ...candidate,
    id: candidate.id.replace(/^pie:/, "donut:"),
    mode: "theta-radius-axes",
    reasons: ["The quantitative field is bound to Theta", "Donut inner radius is a chart default"],
  }));
}

function channelEligibility(templateId: ChartTemplateKind, profiles: ColumnDimensionProfile[]) {
  return chartTemplateContracts[templateId].channels.map((mapping) => {
    const eligible = profiles.filter((profile) => {
      if ((templateId === "line" || templateId === "scatter") && (mapping.channel === "x" || mapping.channel === "y")) {
        return profile.isComparable;
      }
      if (mapping.channel === "color" || mapping.channel === "shape" || mapping.role === "series") {
        return profile.canBeCategory;
      }
      return isDataColumnTypeCompatible(mapping.accepts, profile.declaredType);
    });
    return {
      channel: mapping.channel,
      role: mapping.role,
      required: mapping.required,
      eligibleFields: eligible.map((profile) => profile.field),
      eligibleCount: eligible.length,
    } satisfies ChannelDimensionStatistics;
  });
}

export function inferTemplateEncodings(dataset: Dataset, chartType: string | ChartTemplateKind): TemplateEncodingStatistics | null {
  const templateId = Object.prototype.hasOwnProperty.call(chartTemplateContracts, chartType)
    ? chartType as ChartTemplateKind
    : normalizeChartTemplate(chartType);
  if (!templateId) return null;
  const columns = profileDatasetDimensions(dataset);
  const candidates = (templateId === "line"
    ? inferLineCandidates(dataset, columns)
    : templateId === "scatter"
      ? inferScatterCandidates(dataset, columns)
      : templateId === "pie"
        ? inferPieCandidates(dataset, columns)
        : templateId === "matrix"
          ? inferMatrixCandidates(dataset, columns)
          : inferDonutCandidates(dataset, columns))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 120);
  return {
    templateId,
    rowCount: dataset.rows.length,
    columnCount: dataset.columns.length,
    columns,
    channels: channelEligibility(templateId, columns),
    candidates,
    supportedDimensionalities: Array.from(new Set(candidates.map((candidate) => candidate.dimensionality))).sort((a, b) => a - b),
  };
}

export function inferAllTemplateEncodings(dataset: Dataset): Record<ChartTemplateKind, TemplateEncodingStatistics> {
  return Object.fromEntries(
    (Object.keys(chartTemplateContracts) as ChartTemplateKind[]).map((templateId) => [
      templateId,
      inferTemplateEncodings(dataset, templateId)!,
    ]),
  ) as Record<ChartTemplateKind, TemplateEncodingStatistics>;
}

export type InputColumnDropContext =
  | { type: "chart-body" }
  | { type: "channel"; channel: ChartEncodingChannel };

export type InputColumnIntent = {
  id: string;
  kind: "bind" | "aggregate" | "facet" | "series" | "upgrade" | "filter";
  status: "VALID";
  inputColumn: string;
  label: string;
  binding: ChartRoleBinding;
  channel?: ChartEncodingChannel;
  aggregation?: "sum" | "avg";
  facetDirection?: "row" | "column";
  semanticRole?: string;
  targetChartType?: string;
  filterValues?: string[];
};

export type InputColumnIntentAnalysis = {
  inputColumn: string;
  status: ChartRepairStatus;
  intents: InputColumnIntent[];
  warnings: string[];
};

function explicitRoleBinding(spec: ChartSpec): ChartRoleBinding {
  const contract = getChartTemplateContract(spec.chartType);
  if (!contract) return {};
  const binding: ChartRoleBinding = {};
  contract.channels.forEach((mapping) => {
    const role = mapping.role === "series" ? "series" : mapping.channel;
    const encodings = mapping.role === "series"
      ? spec.roleBindings?.series?.fields.length
        ? spec.roleBindings.series.fields
        : spec.encodings.series
          ? [spec.encodings.series]
          : spec.seriesFields?.length
            ? spec.seriesFields
            : spec.series
              ? [spec.series]
              : spec.encodings[mapping.channel]
                ? [spec.encodings[mapping.channel]!]
                : []
      : mapping.channel === "segment" && spec.angleFields?.length
        ? spec.angleFields
        : mapping.channel === "y" && spec.valueFields?.length
          ? spec.valueFields
          : spec.encodings[mapping.channel]
            ? [spec.encodings[mapping.channel]!]
            : [];
    if (encodings.length) binding[role] = Array.from(new Set(encodings.map((encoding) => encoding.field)));
  });
  return binding;
}

function inputColumnValues(dataset: Dataset, field: string) {
  return new Set(dataset.rows.map((row) => row[field] ?? ""));
}

function partitionsAreEquivalent(dataset: Dataset, leftField: string, rightField: string) {
  for (let leftIndex = 0; leftIndex < dataset.rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < dataset.rows.length; rightIndex += 1) {
      const left = dataset.rows[leftIndex]!;
      const right = dataset.rows[rightIndex]!;
      const leftEqual = (left[leftField] ?? "") === (right[leftField] ?? "");
      const rightEqual = (left[rightField] ?? "") === (right[rightField] ?? "");
      if (leftEqual !== rightEqual) return false;
    }
  }
  return true;
}

function boundFields(spec: ChartSpec) {
  return new Set([
    ...Object.values(spec.encodings).flatMap((encoding) => encoding ? [encoding.field] : []),
    ...(spec.seriesFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.series ? [spec.series.field] : []),
    ...(spec.valueFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.angleFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.parallelFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.flattenFields ?? []),
    ...Object.values(spec.componentRadiusFields ?? {}).map((encoding) => encoding.field),
  ]);
}

/** Infers every legal interpretation of one user-supplied CSV column. */
export function inferColumnIntents(
  dataset: Dataset,
  spec: ChartSpec,
  inputColumn: DataColumn,
  dropContext: InputColumnDropContext,
): InputColumnIntentAnalysis {
  const datasetColumn = dataset.columns.find((column) => column.name === inputColumn.name);
  const contract = getChartTemplateContract(spec.chartType);
  if (!datasetColumn || datasetColumn.type !== inputColumn.type) {
    return {
      inputColumn: inputColumn.name,
      status: "UNRESOLVABLE",
      intents: [],
      warnings: [`Unknown or stale input column: ${inputColumn.name}`],
    };
  }
  if (!contract) {
    return {
      inputColumn: inputColumn.name,
      status: "UNRESOLVABLE",
      intents: [],
      warnings: [`Unknown chart type: ${spec.chartType}`],
    };
  }

  const binding = explicitRoleBinding(spec);
  if (dropContext.type === "channel") {
    const mapping = contract.channels.find((channel) => channel.channel === dropContext.channel);
    if (!mapping || !isDataColumnTypeCompatible(mapping.accepts, inputColumn.type)) {
      return { inputColumn: inputColumn.name, status: "TYPE_MISMATCH", intents: [], warnings: [] };
    }
    const role = mapping.role === "series" ? "series" : mapping.channel;
    return {
      inputColumn: inputColumn.name,
      status: "VALID",
      intents: [{
        id: `bind:${dropContext.channel}:${inputColumn.name}`,
        kind: "bind",
        status: "VALID",
        inputColumn: inputColumn.name,
        label: `Bind to ${mapping.label}`,
        binding: { ...binding, [role]: [inputColumn.name] },
        channel: dropContext.channel,
      }],
      warnings: [],
    };
  }

  if (boundFields(spec).has(inputColumn.name)) {
    return { inputColumn: inputColumn.name, status: "UNRESOLVABLE", intents: [], warnings: [] };
  }
  if (inputColumnValues(dataset, inputColumn.name).size < 2) {
    return { inputColumn: inputColumn.name, status: "DIMENSION_UNDERFLOW", intents: [], warnings: [] };
  }

  const intents: InputColumnIntent[] = [];
  const dimensionTypes = new Set(contract.channels
    .filter((mapping) => mapping.role === "dimension" || mapping.role === "series")
    .flatMap((mapping) => mapping.accepts));
  const dimensionFields = contract.channels
    .filter((mapping) => mapping.role === "dimension" || mapping.role === "series")
    .flatMap((mapping) => binding[mapping.role === "series" ? "series" : mapping.channel] ?? []);
  const valueFields = contract.channels
    .filter((mapping) => mapping.role === "measure")
    .flatMap((mapping) => binding[mapping.channel] ?? []);
  const independent = !contract.requiresIndependentDimensions
    || dimensionFields.every((field) => !partitionsAreEquivalent(dataset, field, inputColumn.name));
  const grain = contract.requiresFunctionalDependency
    ? analyzeCsvGrain(dataset, dimensionFields, valueFields, { candidateFields: [inputColumn.name] })
    : null;
  const resolvesGrain = !grain
    || grain.status === "unique"
    || grain.candidates.some((candidate) => candidate.fields.length === 1
      && candidate.fields[0] === inputColumn.name);
  const isLegalDimension = dimensionTypes.has(inputColumn.type) && independent && resolvesGrain;
  const quantitativeMeasures = contract.channels.filter((mapping) =>
    mapping.role === "measure"
    && spec.encodings[mapping.channel]?.type === "quantitative");
  if (isLegalDimension && contract.aggregationPolicy === "allowed" && quantitativeMeasures.length > 0) {
    (["sum", "avg"] as const).forEach((aggregation) => intents.push({
      id: `aggregate:${aggregation}:${inputColumn.name}`,
      kind: "aggregate",
      status: "VALID",
      inputColumn: inputColumn.name,
      label: `${aggregation === "sum" ? "Sum" : "Average"} by ${inputColumn.name}`,
      binding: { ...binding, aggregateBy: [inputColumn.name] },
      aggregation,
    }));
  }
  if (isLegalDimension && contract.unusedDimensionStrategies.includes("facet")) {
    (["row", "column"] as const).forEach((facetDirection) => intents.push({
      id: `facet:${facetDirection}:${inputColumn.name}`,
      kind: "facet",
      status: "VALID",
      inputColumn: inputColumn.name,
      label: `Facet ${facetDirection === "row" ? "rows" : "columns"} by ${inputColumn.name}`,
      binding: { ...binding, facet: [inputColumn.name] },
      facetDirection,
    }));
  }
  if (isLegalDimension) {
    const filterValues = Array.from(inputColumnValues(dataset, inputColumn.name))
      .filter((value) => value !== "")
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }));
    if (filterValues.length > 0) intents.push({
      id: `filter:${inputColumn.name}`,
      kind: "filter",
      status: "VALID",
      inputColumn: inputColumn.name,
      label: `Keep one ${inputColumn.name} value`,
      binding: { ...binding, filter: [inputColumn.name] },
      filterValues,
    });
  }
  const seriesRole = contract.channels.find((mapping) =>
    mapping.role === "series" && mapping.configurable !== false);
  const hasExplicitSeries = (binding.series?.length ?? 0) > 0;
  if (isLegalDimension
    && seriesRole
    && !hasExplicitSeries
    && contract.dimensionUpgrades.length === 0) {
    const semanticRole = seriesRole.semanticLabel ?? "Series";
    intents.push({
      id: `series:${seriesRole.channel}:${inputColumn.name}`,
      kind: "series",
      status: "VALID",
      inputColumn: inputColumn.name,
      label: `Use as ${semanticRole}`,
      binding: { ...binding, series: [inputColumn.name] },
      channel: seriesRole.channel,
      semanticRole,
    });
  }
  contract.dimensionUpgrades.forEach((upgrade) => {
    const target = getChartTemplateContract(upgrade.chartType);
    const targetRole = target?.channels.find((mapping) => mapping.role === upgrade.role);
    if (!isLegalDimension || !targetRole || !isDataColumnTypeCompatible(targetRole.accepts, inputColumn.type)) return;
    intents.push({
      id: `upgrade:${upgrade.chartType}:${inputColumn.name}`,
      kind: "upgrade",
      status: "VALID",
      inputColumn: inputColumn.name,
      label: upgrade.label,
      binding: { ...binding, series: [inputColumn.name] },
      targetChartType: upgrade.chartType,
    });
  });
  return {
    inputColumn: inputColumn.name,
    status: intents.length > 0
      ? "VALID"
      : dimensionTypes.has(inputColumn.type)
        ? "DIMENSION_UNDERFLOW"
        : "TYPE_MISMATCH",
    intents,
    warnings: [],
  };
}

function markKeys(dataset: Dataset, spec: ChartSpec, role: string) {
  if (role === "line") return spec.series ? uniqueValues(dataset, spec.series.field) : ["__single__"];
  if (role === "arc" && spec.encodings.segment?.field) {
    const aggregation = spec.aggregations?.theta
      ?? spec.aggregations?.angle
      ?? spec.aggregations?.y;
    return aggregation
      ? uniqueValues(dataset, spec.encodings.segment.field)
      : dataset.rows.map((row, index) => csvRowKey(dataset, row, index));
  }
  if (role === "arc" && spec.angleFields?.length) {
    const flattenFields = spec.flattenFields ?? [];
    if (flattenFields.length === 0) return spec.angleFields.map((encoding) => encoding.field);
    const groupKeys = Array.from(new Set(dataset.rows.map((row) =>
      flattenFields.map((field) => row[field] ?? "").join("|"),
    )));
    return groupKeys.flatMap((groupKey) =>
      spec.angleFields!.map((encoding) => `${groupKey}|${encoding.field}`),
    );
  }
  return dataset.rows.map((row, index) => csvRowKey(dataset, row, index));
}

/** Builds render metadata from confirmed bindings without scanning unused columns. */
export function materializeChartStructure(chartId: string, dataset: Dataset, input: ChartSpec): ChartSpec {
  const templateId = normalizeChartTemplate(input.chartType);
  if (!templateId) return input;
  const contract = getChartTemplateContract(input.chartType)!;
  const spec = { ...input, templateId };
  const role = contract.markRole;
  const existingGroup = input.markGroups?.find((item) => item.role === role);
  const auxiliaryGroups = input.markGroups?.filter((item) => item.role !== role) ?? [];
  return {
    ...spec,
    markGroups: [
      {
        id: `mark-group:${chartId}:${role}`,
        chartId,
        role,
        memberKeys: markKeys(dataset, spec, role),
        seriesField: spec.series?.field,
        sharedConfig: existingGroup?.sharedConfig ?? (role === "line"
          ? { strokeWidth: spec.styleTokens?.lineWidth ?? 2.5, opacity: 1 }
          : { opacity: 1 }),
        allowOverrides: existingGroup?.allowOverrides,
      },
      ...auxiliaryGroups,
    ],
  };
}

export function inferChartStructure(chartId: string, dataset: Dataset, input: ChartSpec): ChartSpec {
  const templateId = normalizeChartTemplate(input.chartType);
  if (!templateId) return input;
  const contract = getChartTemplateContract(input.chartType)!;
  const statistics = inferTemplateEncodings(dataset, templateId);
  let series = input.series;
  const normalizedChartType = input.chartType.replace(/[\s_-]/g, "").toLowerCase();
  const isSingleMeasureMultiLine = normalizedChartType === "multilinechart"
    && input.valueFields?.length === 1;
  if (!series && !isSingleMeasureMultiLine
    && (templateId === "line" || templateId === "scatter") && input.encodings.x && input.encodings.y) {
    const candidates = statistics?.candidates.filter((item) =>
      item.dimensionality === 3
      && item.assignments.some((assignment) => assignment.channel === "x" && assignment.field === input.encodings.x?.field)
      && item.assignments.some((assignment) => assignment.channel === "y" && assignment.field === input.encodings.y?.field),
    ) ?? [];
    const seriesAssignments = candidates
      .map((candidate) => candidate.assignments.find((item) => item.channel === "series"))
      .filter((item): item is InferredEncodingAssignment => !!item);
    const uniqueSeriesFields = new Set(seriesAssignments.map((item) => item.field));
    const seriesAssignment = uniqueSeriesFields.size === 1 ? seriesAssignments[0] : undefined;
    if (seriesAssignment) {
      series = { field: seriesAssignment.field, type: seriesAssignment.dataType };
    }
  }

  const spec = { ...input, templateId, series };
  const role = contract.markRole;
  const existingGroup = input.markGroups?.find((item) => item.role === role);
  const groupSpec: MarkGroupSpec = {
    id: `mark-group:${chartId}:${role}`,
    chartId,
    role,
    memberKeys: markKeys(dataset, spec, role),
    seriesField: series?.field,
    sharedConfig: existingGroup?.sharedConfig ?? (role === "line"
      ? { strokeWidth: spec.styleTokens?.lineWidth ?? 2.5, opacity: 1 }
      : { opacity: 1 }),
    allowOverrides: existingGroup?.allowOverrides,
  };
  const used = new Set([
    ...Object.values(spec.encodings).map((encoding) => encoding?.field),
    ...(spec.angleFields?.map((encoding) => encoding.field) ?? []),
    ...(spec.flattenFields ?? []),
    ...Object.values(spec.componentRadiusFields ?? {}).map((encoding) => encoding.field),
  ].filter((field): field is string => !!field));
  if (series) used.add(series.field);
  const profiles = statistics?.columns ?? profileDatasetDimensions(dataset);
  const outerDimensions = profiles.filter((profile) =>
    profile.canBeCategory
    && !used.has(profile.field),
  );
  const sharedChannels = contract.shareableChannels as CoordinateChannel[];
  const seriesValueCount = series ? uniqueValues(dataset, series.field).length : 0;
  const seriesRecommendations: DimensionRecommendation[] = templateId === "line"
    && series
    && seriesValueCount > 1
    && !spec.dimensionDecisions?.[series.field]
    ? [
      { id: `${chartId}:${series.field}:series`, strategy: "series", field: series.field, valueCount: seriesValueCount, estimatedMarkCount: seriesValueCount, sharedChannels, label: `${seriesValueCount} lines in one view` },
      { id: `${chartId}:${series.field}:facet`, strategy: "facet", field: series.field, valueCount: seriesValueCount, estimatedMarkCount: seriesValueCount, sharedChannels, label: `${seriesValueCount} views, one for each ${series.field}` },
    ]
    : [];
  const gridDimensions = templateId === "pie"
    ? outerDimensions.filter((profile) => profile.declaredType === "nominal" || profile.declaredType === "ordinal")
    : [];
  const gridColumn = gridDimensions[1];
  const gridRow = gridDimensions.find((profile) => profile.field !== gridColumn?.field && profile.declaredType === "nominal")
    ?? gridDimensions.find((profile) => profile.field !== gridColumn?.field);
  const rowValues = gridRow ? uniqueValues(dataset, gridRow.field) : [];
  const columnValues = gridColumn ? uniqueValues(dataset, gridColumn.field) : [];
  const hasGridFacet = !!gridRow
    && !!gridColumn
    && rowValues.length > 0
    && columnValues.length > 0
    && !spec.dimensionDecisions?.[gridRow.field]
    && !spec.dimensionDecisions?.[gridColumn.field];
  const gridRecommendations: DimensionRecommendation[] = hasGridFacet
    ? [{
      id: `${chartId}:${gridRow!.field}:${gridColumn!.field}:facet-grid`,
      strategy: "facet",
      field: `${gridRow!.field} × ${gridColumn!.field}`,
      valueCount: rowValues.length * columnValues.length,
      estimatedMarkCount: rowValues.length * columnValues.length,
      sharedChannels,
      label: `${rowValues.length} × ${columnValues.length} grid by ${gridRow!.field} and ${gridColumn!.field}`,
      facetGrid: {
        rowField: gridRow!.field,
        columnField: gridColumn!.field,
        rowValues,
        columnValues,
      },
    }]
    : [];
  const combinedFlattenRecommendations: DimensionRecommendation[] = hasGridFacet
    ? [{
      id: `${chartId}:${gridRow!.field}:${gridColumn!.field}:flatten`,
      strategy: "flatten",
      field: `[${gridRow!.field}, ${gridColumn!.field}]`,
      valueCount: rowValues.length * columnValues.length,
      estimatedMarkCount: rowValues.length * columnValues.length * Math.max(spec.angleFields?.length ?? 1, 1),
      sharedChannels,
      flattenFields: [gridRow!.field, gridColumn!.field],
      label: `Flatten by [${gridRow!.field}, ${gridColumn!.field}] into one Pie`,
    }]
    : [];
  const gridFields = new Set(hasGridFacet ? [gridRow!.field, gridColumn!.field] : []);
  const outerRecommendations: DimensionRecommendation[] = outerDimensions.flatMap((profile) => {
    if (profile.distinctCount < 2 || spec.dimensionDecisions?.[profile.field]) return [];
    return contract.unusedDimensionStrategies
      .filter((strategy) => strategy !== "facet" || !gridFields.has(profile.field))
      .map((strategy) => ({
      id: `${chartId}:${profile.field}:${strategy}`,
      strategy,
      field: profile.field,
      valueCount: profile.distinctCount,
      estimatedMarkCount: strategy === "facet" ? profile.distinctCount : groupSpec.memberKeys.length * profile.distinctCount,
      sharedChannels,
      flattenFields: strategy === "flatten" ? [profile.field] : undefined,
      label: strategy === "flatten"
        ? `Flatten by [${profile.field}] into the current chart`
        : strategy === "facet"
          ? `Facet into ${profile.distinctCount} charts by ${profile.field}`
          : `Nest ${profile.field} as an outer composition`,
      } satisfies DimensionRecommendation));
  });
  return {
    ...spec,
    markGroups: [groupSpec],
    dimensionRecommendations: [
      ...seriesRecommendations,
      ...gridRecommendations,
      ...combinedFlattenRecommendations,
      ...outerRecommendations,
    ],
  };
}
