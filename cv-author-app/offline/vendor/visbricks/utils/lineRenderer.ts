import { extent, group } from "d3-array";
import { scaleLinear, scalePoint, scaleUtc } from "d3-scale";
import { line } from "d3-shape";
import type {
  CartesianCoordinateGuide,
  ChartEncoding,
  ChartPlotArea,
  ChartScaleSpec,
  ChartSpec,
  ChartStyleTokens,
  Dataset,
  ParsedSvgTemplate,
  ParsedSvgTemplateNode,
} from "../types";
import { csvRowKey } from "./csvDataEngine";
import { cartesianAxisEncoding } from "./chartTemplates";
import { CSV_MEASURE_ID_FIELD } from "./chartDataPipeline";
import {
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  isSeriesStyleMapping,
  mapColorValue,
  mapSizeValue,
  parseVisualValue,
  visualDomain,
} from "./visualMapping";
import { globalPalette } from "../config/global";

const fallbackPalette = globalPalette.categorical;
const defaultCartesianAspectRatio = 4 / 3;
const linechartTemplateStyle: ChartStyleTokens = {
  palette: fallbackPalette,
  axisColor: "#64748b",
  textColor: "#334155",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 9,
  lineWidth: 2.5,
};

export type LineRenderResult = {
  content: string;
  plotArea: ChartPlotArea;
  scales: { x: ChartScaleSpec; y: ChartScaleSpec };
  series: LineSeriesGeometry[];
};

export type LineSeriesGeometry = {
  key: string;
  points: Array<{ x: number; y: number; rowKeys: string[] }>;
  color: string;
  lineWidth: number;
  lineStyle: string;
};

export type LineRenderInput = {
  chartId: string;
  width: number;
  height: number;
  minX: number;
  minY: number;
  coordinateGuide: CartesianCoordinateGuide;
  chartSpec: ChartSpec;
  dataset: Dataset;
  sharedPlotArea?: ChartPlotArea;
  sharedScales?: Partial<{ x: ChartScaleSpec; y: ChartScaleSpec }>;
  includeZeroValueDomain?: boolean;
  plotAspectRatio?: number;
};

export function isLineChartType(chartType: string) {
  const normalized = chartType.replace(/[\s_-]/g, "").toLowerCase();
  return normalized === "linegraph" || normalized.includes("linechart");
}

function collectTemplateContent(nodes: ParsedSvgTemplateNode[]): string[] {
  return nodes.flatMap((node) => node.kind === "leaf"
    ? [node.content]
    : collectTemplateContent(node.children));
}

function presentationValue(element: Element, name: string) {
  const direct = element.getAttribute(name)?.trim();
  if (direct) return direct;
  const style = element.getAttribute("style") ?? "";
  const declaration = style
    .split(";")
    .map((item) => item.split(":"))
    .find(([property]) => property?.trim().toLowerCase() === name);
  return declaration?.slice(1).join(":").trim() || "";
}

function isVisiblePaint(value: string) {
  const normalized = value.replace(/\s/g, "").toLowerCase();
  return !!normalized
    && normalized !== "none"
    && normalized !== "transparent"
    && normalized !== "rgba(0,0,0,0)"
    && !normalized.endsWith(",0)");
}

export function extractChartStyleTokens(template: ParsedSvgTemplate): ChartStyleTokens {
  const fallback: ChartStyleTokens = { ...linechartTemplateStyle, palette: [...linechartTemplateStyle.palette] };
  if (typeof DOMParser === "undefined") return fallback;

  const document = new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${collectTemplateContent(template.nodes).join("")}</svg>`,
    "image/svg+xml",
  );
  const elements = Array.from(document.querySelectorAll("path, polyline, line, circle"));
  const paints: string[] = [];
  for (const element of elements) {
    for (const property of ["stroke", "fill"]) {
      const value = presentationValue(element, property);
      if (isVisiblePaint(value) && !paints.includes(value)) paints.push(value);
    }
  }
  const text = document.querySelector("text");
  const firstLine = elements.find((element) => isVisiblePaint(presentationValue(element, "stroke")));
  const parsedFontSize = Number.parseFloat(text ? presentationValue(text, "font-size") : "");
  const parsedLineWidth = Number.parseFloat(firstLine ? presentationValue(firstLine, "stroke-width") : "");
  return {
    palette: [...paints, ...fallbackPalette.filter((color) => !paints.includes(color))].slice(0, 8),
    axisColor: fallback.axisColor,
    textColor: text && isVisiblePaint(presentationValue(text, "fill"))
      ? presentationValue(text, "fill")
      : fallback.textColor,
    fontFamily: (text ? presentationValue(text, "font-family") : "") || fallback.fontFamily,
    fontSize: Number.isFinite(parsedFontSize) ? parsedFontSize : fallback.fontSize,
    lineWidth: Number.isFinite(parsedLineWidth) ? parsedLineWidth : fallback.lineWidth,
  };
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function finiteExtent(values: number[]) {
  const domain = extent(values);
  if (domain[0] === undefined || domain[1] === undefined) return null;
  if (domain[0] === domain[1]) {
    const padding = Math.abs(domain[0]) * 0.05 || 1;
    return [domain[0] - padding, domain[1] + padding] as [number, number];
  }
  return domain as [number, number];
}

function rowKey(dataset: Dataset, row: Record<string, string>) {
  return csvRowKey(dataset, row);
}

type ParsedAxisValue = string | number;

type LineDatum = {
  row: Record<string, string>;
  sourceRows: Record<string, string>[];
  x: ParsedAxisValue;
  y: ParsedAxisValue;
  series: string;
};

function parseAxisValue(value: string, type: ChartEncoding["type"]): ParsedAxisValue | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === "nominal" || type === "ordinal") return trimmed;
  if (type === "quantitative") {
    const number = Number(trimmed);
    return Number.isFinite(number) ? number : null;
  }
  if (type === "temporal") {
    const timestamp = Date.parse(trimmed);
    return Number.isFinite(timestamp) ? trimmed : null;
  }
  return null;
}

function uniqueDomain(values: ParsedAxisValue[]) {
  return Array.from(new Set(values.map((value) => String(value))));
}

export function renderLineChart(input: LineRenderInput): LineRenderResult {
  const { chartId, width, height, minX, minY, coordinateGuide, chartSpec, dataset } = input;
  const xEncoding = cartesianAxisEncoding(chartSpec, "x");
  const yEncoding = cartesianAxisEncoding(chartSpec, "y");
  const canonicalSeries = chartSpec.roleBindings?.series?.fields;
  const seriesEncodings = canonicalSeries?.length
    ? canonicalSeries
    : chartSpec.encodings.series
      ? [chartSpec.encodings.series]
      : chartSpec.seriesFields?.length
        ? chartSpec.seriesFields
        : chartSpec.series
          ? [chartSpec.series]
          : chartSpec.encodings.color?.type === "nominal" || chartSpec.encodings.color?.type === "ordinal"
            ? [chartSpec.encodings.color]
            : [];
  if (!xEncoding || !yEncoding) throw new Error("Line renderer requires both X and Y encodings.");
  if (seriesEncodings.some((encoding) => encoding.type !== "nominal" && encoding.type !== "ordinal")) {
    throw new Error("Line renderer series encoding must be nominal or ordinal.");
  }

  const sourceRows = dataset.rows
    .map((row) => ({
      row,
      sourceRows: [row],
      x: parseAxisValue(row[xEncoding.field] ?? "", xEncoding.type),
      y: parseAxisValue(row[yEncoding.field] ?? "", yEncoding.type),
      series: seriesEncodings.length > 0
        ? seriesEncodings.map((encoding) => (row[encoding.field] ?? "").trim()).join(" / ")
        : "__single__",
    }))
    .filter((datum): datum is LineDatum =>
      datum.x !== null && datum.y !== null && datum.series !== "",
    );
  if (sourceRows.length === 0) throw new Error("No valid rows remain after applying the line encodings.");
  // Progression follows the semantic X channel. Swapping only changes which
  // physical axis receives that progression, not the grouping key.
  const progressionEncoding = xEncoding;
  const progressionValue = (datum: LineDatum) => datum.x;
  const normalizedChartType = chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase();
  const hasExplicitAggregation = chartSpec.aggregations?.y !== undefined
    || Object.keys(chartSpec.dimensionAggregations ?? {}).length > 0;
  const preserveUnboundLineRows = normalizedChartType === "linegraph"
    || (normalizedChartType === "multilinechart" && chartSpec.valueFields?.length === 1);
  const preserveSingleMeasureRows = preserveUnboundLineRows
    && seriesEncodings.length === 0
    && !hasExplicitAggregation;
  const preserveMaterializedMeasureRows = normalizedChartType === "multilinechart"
    && chartSpec.series?.field === CSV_MEASURE_ID_FIELD
    && chartSpec.seriesFields?.every((encoding) => encoding.field === CSV_MEASURE_ID_FIELD) === true
    && !hasExplicitAggregation;
  // Line and plain-area charts preserve source rows by default.  Reduction is
  // opt-in through an explicit y or dimension aggregation configuration.
  const preserveDuplicateXRows = !hasExplicitAggregation
    || preserveSingleMeasureRows
    || preserveMaterializedMeasureRows;
  const dimensionAggregations = Object.entries(chartSpec.dimensionAggregations ?? {});
  const aggregateGroups = (groups: LineDatum[][], operation: "sum" | "avg") => groups.map((values): LineDatum => {
    const first = values[0]!;
    if (yEncoding.type !== "quantitative") {
      return { ...first, sourceRows: values.flatMap((datum) => datum.sourceRows) };
    }
    const total = values.reduce((sum, datum) => sum + Number(datum.y), 0);
    return {
      ...first,
      sourceRows: values.flatMap((datum) => datum.sourceRows),
      y: operation === "sum" ? total : total / values.length,
    };
  });
  let reducedRows = sourceRows;
  if (!preserveDuplicateXRows) dimensionAggregations.forEach(([field, operation], index) => {
    const remainingFields = dimensionAggregations.slice(index + 1).map(([remainingField]) => remainingField);
    const grouped = group(
      reducedRows,
      (datum) => datum.series,
      (datum) => String(progressionValue(datum)),
      (datum) => remainingFields.map((remainingField) => datum.row[remainingField] ?? "").join("\u0000"),
    );
    reducedRows = aggregateGroups(
      Array.from(grouped.values()).flatMap((xGroups) =>
        Array.from(xGroups.values()).flatMap((remainingGroups) => Array.from(remainingGroups.values())),
      ),
      operation,
    );
  });
  const yAggregation = chartSpec.aggregations?.y;
  const rows = preserveDuplicateXRows
    ? reducedRows
    : aggregateGroups(
      Array.from(group(reducedRows, (datum) => datum.series, (datum) => String(progressionValue(datum))).values())
        .flatMap((xGroups) => Array.from(xGroups.values())),
      dimensionAggregations.length > 0 ? "avg" : yAggregation!,
    );
  const groupedRows = Array.from(group(rows, (datum) => datum.series).entries())
    .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }));

  // The Linechart template is the visual source of truth. Candidate SVGs may
  // carry unrelated thin strokes, so do not let their extracted tokens win.
  const tokens: ChartStyleTokens = {
    ...chartSpec.styleTokens,
    ...linechartTemplateStyle,
    palette: [...linechartTemplateStyle.palette],
  };
  const lineConfig = chartSpec.markGroups?.find((markGroup) => markGroup.role === "line")?.sharedConfig;
  if (lineConfig?.strokeWidth !== undefined) tokens.lineWidth = Number(lineConfig.strokeWidth);
  const isMultiLine = seriesEncodings.length > 0;
  if (!isMultiLine && typeof lineConfig?.color === "string") tokens.palette = [lineConfig.color];
  const fontSize = Math.max(9, Math.min(tokens.fontSize, Math.min(width, height) * 0.045));
  const leftMargin = Math.min(Math.max(fontSize * 4.8, width * 0.09), width * 0.28);
  const rightMargin = Math.min(Math.max(fontSize * 1.8, width * 0.035), width * 0.14);
  const topMargin = Math.min(Math.max(fontSize * 2, height * 0.07), height * 0.22);
  const bottomMargin = Math.min(Math.max(fontSize * 3.6, height * 0.14), height * 0.3);
  const availablePlotWidth = Math.max(1, width - leftMargin - rightMargin);
  const availablePlotHeight = Math.max(1, height - topMargin - bottomMargin);
  const targetAspectRatio = input.plotAspectRatio ?? defaultCartesianAspectRatio;
  const basePlotWidth = Math.min(availablePlotWidth, availablePlotHeight * targetAspectRatio);
  const basePlotHeight = Math.min(availablePlotHeight, basePlotWidth / targetAspectRatio);
  const basePlotX = minX + leftMargin + (availablePlotWidth - basePlotWidth) / 2;
  const basePlotY = minY + topMargin + (availablePlotHeight - basePlotHeight) / 2;
  const xDiscreteSpacing = xEncoding.type === "nominal" || xEncoding.type === "ordinal"
    ? coordinateGuide.xDiscreteSpacing ?? 1
    : 1;
  const yDiscreteSpacing = yEncoding.type === "nominal" || yEncoding.type === "ordinal"
    ? coordinateGuide.yDiscreteSpacing ?? 1
    : 1;
  const scaledPlotWidth = Math.max(1, basePlotWidth * (coordinateGuide.xScale ?? 1) * xDiscreteSpacing);
  const scaledPlotHeight = Math.max(1, basePlotHeight * (coordinateGuide.yScale ?? 1) * yDiscreteSpacing);
  const plotArea: ChartPlotArea = input.sharedPlotArea ?? {
    // Keep the coordinate origin fixed while the opposing endpoint is dragged.
    x: coordinateGuide.xDirection === 1
      ? basePlotX
      : basePlotX + basePlotWidth - scaledPlotWidth,
    y: coordinateGuide.yDirection === -1
      ? basePlotY + basePlotHeight - scaledPlotHeight
      : basePlotY,
    width: scaledPlotWidth,
    height: scaledPlotHeight,
  };
  const plotRight = plotArea.x + plotArea.width;
  const plotBottom = plotArea.y + plotArea.height;
  const xRange: [number, number] = input.sharedScales?.x?.range ?? (coordinateGuide.xDirection === 1
    ? [plotArea.x, plotRight]
    : [plotRight, plotArea.x]);
  const yRange: [number, number] = input.sharedScales?.y?.range ?? (coordinateGuide.yDirection === -1
    ? [plotBottom, plotArea.y]
    : [plotArea.y, plotBottom]);
  const makeScale = (
    encoding: ChartEncoding,
    values: ParsedAxisValue[],
    range: [number, number],
    sharedScale?: ChartScaleSpec,
  ) => {
    if (sharedScale?.type === "point") {
      const domain = sharedScale.domain as string[];
      const scale = scalePoint<string>().domain(domain).range(sharedScale.range).padding(0.5);
      return {
        position: (value: ParsedAxisValue) => {
          const key = String(value);
          return key === undefined ? 0 : scale(key) ?? 0;
        },
        domain,
        type: "point" as const,
      };
    }
    if (sharedScale?.type === "utc") {
      const domain = sharedScale.domain as [string, string];
      const scale = scaleUtc()
        .domain(domain.map((value) => new Date(value)) as [Date, Date])
        .range(sharedScale.range);
      return {
        position: (value: ParsedAxisValue) => scale(new Date(String(value))),
        domain: domain.map((value) => Date.parse(value)) as [number, number],
        type: "utc" as const,
      };
    }
    if (sharedScale?.type === "linear") {
      const domain = sharedScale.domain as [number, number];
      const scale = scaleLinear().domain(domain).range(sharedScale.range);
      return {
        position: (value: ParsedAxisValue) => scale(Number(value)),
        domain,
        type: "linear" as const,
      };
    }
    if (encoding.type === "nominal" || encoding.type === "ordinal") {
      const domain = uniqueDomain(values);
      const scale = scalePoint<string>().domain(domain).range(range).padding(0.5);
      return {
        position: (value: ParsedAxisValue) => scale(value as string) ?? 0,
        domain,
        type: "point" as const,
      };
    }
    if (encoding.type === "temporal") {
      const domain = finiteExtent(values.map((value) => Date.parse(String(value))));
      if (!domain) throw new Error("Unable to calculate a temporal scale domain.");
      const scale = scaleUtc()
        .domain(domain.map((value) => new Date(value)) as [Date, Date])
        .nice(5)
        .range(range);
      return {
        position: (value: ParsedAxisValue) => scale(new Date(String(value))),
        domain: scale.domain().map((value) => value.getTime()) as [number, number],
        type: "utc" as const,
      };
    }
    const domain = finiteExtent(values as number[]);
    if (!domain) throw new Error("Unable to calculate a quantitative scale domain.");
    const span = domain[1] - domain[0];
    const padding = span * 0.045;
    const scale = scaleLinear().domain([domain[0] - padding, domain[1] + padding]).nice(5).range(range);
    return {
      position: (value: ParsedAxisValue) => scale(value as number),
      domain: scale.domain() as [number, number],
      type: "linear" as const,
    };
  };
  const xValues = rows.map((datum) => datum.x);
  const yValues = rows.map((datum) => datum.y);
  if (input.includeZeroValueDomain) {
    if (yEncoding.type === "quantitative") yValues.push(0);
  }
  const swapped = chartSpec.axisSwapped === true;
  const xAxisScale = makeScale(
    swapped ? yEncoding : xEncoding,
    swapped ? yValues : xValues,
    xRange,
    input.sharedScales?.x,
  );
  const yAxisScale = makeScale(
    swapped ? xEncoding : yEncoding,
    swapped ? xValues : yValues,
    yRange,
    input.sharedScales?.y,
  );
  const clipId = `line-plot-${chartId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const pathGenerator = line<LineDatum>()
    .x((datum) => xAxisScale.position(swapped ? datum.y : datum.x))
    .y((datum) => yAxisScale.position(swapped ? datum.x : datum.y));
  const colorEncoding = isMultiLine ? undefined : chartSpec.encodings.color;
  const sizeEncoding = isMultiLine ? undefined : chartSpec.encodings.size;
  const mappedAggregate = (
    values: LineDatum[],
    encoding: ChartEncoding | undefined,
    operation?: "sum" | "avg",
  ) => {
    if (!encoding) return null;
    const parsed = values.flatMap((datum) => datum.sourceRows.flatMap((row) => {
      const value = parseVisualValue(row[encoding.field] ?? "", encoding);
      return value === null ? [] : [value];
    }));
    if (parsed.length === 0) return null;
    const total = parsed.reduce((sum, value) => sum + value, 0);
    return operation === "sum" ? total : total / parsed.length;
  };
  let maximumLineWidth = tokens.lineWidth;
  const seriesStyles = isSeriesStyleMapping(lineConfig?.seriesStyleMapping)
    ? lineConfig.seriesStyleMapping.values
    : {};
  const legacySeriesColors = isCategoricalColorMapping(lineConfig?.seriesColorMapping)
    ? lineConfig.seriesColorMapping.values
    : {};
  const colorAggregation = chartSpec.aggregations?.color;
  const sizeAggregation = chartSpec.aggregations?.size;
  const series: LineSeriesGeometry[] = [];
  const colorDomain = colorAggregation
    ? extent(groupedRows.flatMap(([, values]) => {
      const value = mappedAggregate(values, colorEncoding, colorAggregation);
      return value === null ? [] : [value];
    })) as [number | undefined, number | undefined]
    : visualDomain(dataset.rows, colorEncoding);
  const sizeDomain = sizeAggregation
    ? extent(groupedRows.flatMap(([, values]) => {
      const value = mappedAggregate(values, sizeEncoding, sizeAggregation);
      return value === null ? [] : [value];
    })) as [number | undefined, number | undefined]
    : visualDomain(dataset.rows, sizeEncoding);
  const seriesMarkup = groupedRows.map(([seriesKey, values], index) => {
    const ordered = progressionEncoding.type === "nominal" || progressionEncoding.type === "ordinal"
      ? [...values]
      : [...values].sort((left, right) => Number(progressionValue(left)) - Number(progressionValue(right)));
    const path = pathGenerator(ordered);
    if (!path) return "";
    const fallbackColor = tokens.palette[index % tokens.palette.length] ?? fallbackPalette[index % fallbackPalette.length]!;
    const memberStyle = seriesStyles[seriesKey];
    const memberColor = memberStyle?.color ?? legacySeriesColors[seriesKey];
    const aggregatedColorValue = mappedAggregate(values, colorEncoding, colorAggregation);
    const color = memberColor ?? (colorDomain && colorDomain[0] !== undefined && colorDomain[1] !== undefined
      && aggregatedColorValue !== null && isLinearColorMapping(lineConfig?.colorMapping)
      ? mapColorValue(aggregatedColorValue, colorDomain as [number, number], lineConfig.colorMapping)
      : fallbackColor);
    const aggregatedSizeValue = mappedAggregate(values, sizeEncoding, sizeAggregation);
    const lineWidth = memberStyle?.strokeWidth ?? (sizeDomain && sizeDomain[0] !== undefined && sizeDomain[1] !== undefined
      && aggregatedSizeValue !== null && isLinearSizeMapping(lineConfig?.sizeMapping)
      ? mapSizeValue(aggregatedSizeValue, sizeDomain as [number, number], lineConfig.sizeMapping)
      : !isMultiLine && typeof lineConfig?.size === "number" ? lineConfig.size : tokens.lineWidth);
    const lineStyle = memberStyle?.lineStyle ?? memberStyle?.shape ?? "solid";
    const dasharray = lineStyle === "dashed"
      ? `${lineWidth * 3} ${lineWidth * 2}`
      : lineStyle === "dotted" ? `${lineWidth} ${lineWidth * 1.8}` : "none";
    maximumLineWidth = Math.max(maximumLineWidth, lineWidth);
    const keys = ordered.flatMap((datum) => datum.sourceRows.map((row) => rowKey(dataset, row))).filter(Boolean);
    series.push({
      key: seriesKey,
      points: ordered.map((datum) => ({
        x: xAxisScale.position(swapped ? datum.y : datum.x),
        y: yAxisScale.position(swapped ? datum.x : datum.y),
        rowKeys: datum.sourceRows.map((row) => rowKey(dataset, row)).filter(Boolean),
      })),
      color,
      lineWidth,
      lineStyle,
    });
    const markAttributes = `data-chart-id="${escapeXml(chartId)}" data-mark-role="line" data-mark-group-id="mark-group:${escapeXml(chartId)}:line" data-series-key="${escapeXml(seriesKey)}" data-line-style="${lineStyle}" data-point-count="${ordered.length}" data-row-keys="${escapeXml(keys.join(","))}" opacity="${Number(lineConfig?.opacity ?? 1)}"`;
    const pathAttributes = isMultiLine ? "" : ` ${markAttributes}`;
    const pathMarkup = `<path d="${path}"${pathAttributes} fill="none" stroke="${escapeXml(color)}" stroke-width="${lineWidth}" stroke-dasharray="${dasharray}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="stroke: ${escapeXml(color)}; stroke-width: ${lineWidth}px; stroke-dasharray: ${dasharray}; stroke-linecap: round; stroke-linejoin: round; fill: none;"/>`;
    // A single line has no group-level state. Put its metadata on the visible
    // path so the SVG tree contains one mark element instead of two.
    return isMultiLine ? `<g ${markAttributes}>${pathMarkup}</g>` : pathMarkup;
  }).join("");
  const clipPadding = Math.max(3, maximumLineWidth * 2);
  // Apply clipping to the chart root. The former plot-only wrapper carried no
  // state beyond this clip path and added an element for every line chart.
  const content = `<g data-chart-id="${escapeXml(chartId)}" data-chart-type="line" data-renderer="deterministic-line-marks@3" clip-path="url(#${clipId})"><defs><clipPath id="${clipId}"><rect x="${plotArea.x - clipPadding}" y="${plotArea.y - clipPadding}" width="${plotArea.width + clipPadding * 2}" height="${plotArea.height + clipPadding * 2}"/></clipPath></defs>${seriesMarkup}</g>`;
  return {
    content,
    plotArea,
    scales: {
      x: {
        type: xAxisScale.type,
        domain: xAxisScale.type === "utc"
          ? (xAxisScale.domain as [number, number]).map((value) => new Date(value).toISOString()) as [string, string]
          : xAxisScale.domain,
        range: xRange,
      },
      y: {
        type: yAxisScale.type,
        domain: yAxisScale.domain,
        range: yRange,
        nice: yAxisScale.type === "linear" || undefined,
      },
    },
    series,
  };
}
