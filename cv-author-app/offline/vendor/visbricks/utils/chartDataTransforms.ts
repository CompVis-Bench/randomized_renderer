import { extent, quickselect } from "d3-array";
import type {
  ChartBinAggregateTransform,
  ChartDataTransform,
  ChartNumericFilterTransform,
  ChartFoldTransform,
  DataColumn,
  DataRow,
  Dataset,
} from "../types";
import { inferCsvPrimaryKey } from "./csvDataEngine";

type MaterializedChartData = Pick<Dataset, "columns" | "rows">;

type TransformCacheEntry = {
  rows: Dataset["rows"];
  columns: Dataset["columns"];
  signature: string;
  result: Dataset;
};

const transformCache = new WeakMap<object, TransformCacheEntry[]>();
const transformCacheLimit = 8;

function transformSignature(transforms: ChartDataTransform[]) {
  return JSON.stringify(transforms);
}

function numericValue(row: DataRow, field: string) {
  const rawValue = row[field]?.trim() ?? "";
  if (!rawValue) return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function applyNumericFilter(rows: DataRow[], transform: ChartNumericFilterTransform) {
  if (transform.operator === "top" || transform.operator === "bottom") {
    const count = Math.max(1, Math.floor(transform.value));
    const values = rows.map((row) => numericValue(row, transform.field));
    const candidates: number[] = [];
    values.forEach((value, index) => {
      if (value !== null) candidates.push(index);
    });
    // Partition only the requested rows; tie-breaking still uses source order.
    if (count < candidates.length) {
      quickselect(candidates, count - 1, 0, candidates.length - 1, (a, b) => {
        const left = Number(a);
        const right = Number(b);
        return (transform.operator === "top"
          ? values[right]! - values[left]!
          : values[left]! - values[right]!) || left - right;
      });
    }
    const retainedIndexes = new Set(candidates.slice(0, count));
    return rows.filter((_, index) => retainedIndexes.has(index));
  }

  return rows.filter((row) => {
    const value = numericValue(row, transform.field);
    if (value === null) return false;
    if (transform.operator === "gte") return value >= transform.value;
    if (transform.operator === "gt") return value > transform.value;
    if (transform.operator === "lte") return value <= transform.value;
    if (transform.operator === "lt") return value < transform.value;
    if (transform.operator === "eq") return value === transform.value;
    return value >= Math.min(transform.value, transform.upperValue ?? transform.value)
      && value <= Math.max(transform.value, transform.upperValue ?? transform.value);
  });
}

function displayNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  return Number.parseFloat(value.toPrecision(6)).toString();
}

function applyGroupValueOrder(
  rows: DataRow[],
  transform: Extract<ChartDataTransform, { kind: "order" }>,
) {
  const groups = new Map<string, { sourceIndex: number; total: number; count: number }>();
  rows.forEach((row, index) => {
    const group = row[transform.groupField] ?? "";
    const value = numericValue(row, transform.valueField);
    if (!group || value === null) return;
    const current = groups.get(group);
    if (current) {
      current.total += value;
      current.count += 1;
    } else {
      groups.set(group, { sourceIndex: index, total: value, count: 1 });
    }
  });
  const groupValue = (entry: [string, { total: number; count: number }]) =>
    transform.operation === "avg" ? entry[1].total / entry[1].count : entry[1].total;
  const byValue = (direction: "ascending" | "descending") =>
    (left: [string, { sourceIndex: number; total: number; count: number }], right: [string, { sourceIndex: number; total: number; count: number }]) => {
      const difference = groupValue(left) - groupValue(right);
      return (direction === "ascending" ? difference : -difference)
        || left[1].sourceIndex - right[1].sourceIndex;
    };
  const entries = Array.from(groups.entries());
  const retained = transform.limit === undefined
    ? entries
    : [...entries]
      .sort(byValue("descending"))
      .slice(0, Math.max(1, Math.floor(transform.limit)));
  const ordered = transform.direction === "source"
    ? [...retained].sort((left, right) => left[1].sourceIndex - right[1].sourceIndex)
    : [...retained].sort(byValue(transform.direction));
  const groupedRows = new Map<string, DataRow[]>(ordered.map(([group]) => [group, []]));
  for (const row of rows) groupedRows.get(row[transform.groupField] ?? "")?.push(row);
  return Array.from(groupedRows.values()).flat();
}

function applyFoldTransform(
  materialized: MaterializedChartData,
  transform: ChartFoldTransform,
): MaterializedChartData {
  const available = new Set(materialized.columns.map((column) => column.name));
  if (transform.sourceFields.length < 2
    || transform.sourceFields.some((field) => !available.has(field))) return materialized;
  const rows = materialized.rows.flatMap((row) => transform.sourceFields.flatMap((sourceField) => {
    const value = row[sourceField];
    if (value === undefined || value.trim() === "") return [];
    return [{
      ...row,
      [transform.keyOutputField]: sourceField,
      [transform.valueOutputField]: value,
    }];
  }));
  return {
    columns: [
      ...materialized.columns.filter((column) =>
        column.name !== transform.keyOutputField && column.name !== transform.valueOutputField),
      { name: transform.keyOutputField, type: "nominal" },
      { name: transform.valueOutputField, type: "quantitative" },
    ],
    rows,
  };
}

function createBinLabeler(values: number[], transform: ChartBinAggregateTransform) {
  // Avoid spreading large columns into function arguments (engine stack limit).
  const [minimum = 0, maximum = 0] = extent(values);
  const parameter = Math.max(1, transform.parameter);

  if (transform.method === "fixed-width") {
    const width = parameter;
    return (value: number) => {
      const lower = Math.floor((value - minimum) / width) * width + minimum;
      const upper = lower + width;
      return `[${displayNumber(lower)}, ${displayNumber(upper)}${value === maximum ? "]" : ")"}`;
    };
  }

  if (transform.method === "quantile") {
    const binCount = Math.max(2, Math.floor(parameter));
    const sorted = [...values].sort((left, right) => left - right);
    const thresholds = Array.from({ length: binCount + 1 }, (_, index) =>
      sorted[Math.min(sorted.length - 1, Math.floor(index * sorted.length / binCount))] ?? minimum);
    thresholds[0] = minimum;
    thresholds[thresholds.length - 1] = maximum;
    return (value: number) => {
      let index = thresholds.findIndex((threshold, thresholdIndex) =>
        thresholdIndex > 0 && value <= threshold);
      if (index < 1) index = binCount;
      const lower = thresholds[index - 1] ?? minimum;
      const upper = thresholds[index] ?? maximum;
      return `[${displayNumber(lower)}, ${displayNumber(upper)}]`;
    };
  }

  const binCount = Math.max(2, Math.floor(parameter));
  if (minimum === maximum) {
    const label = `[${displayNumber(minimum)}, ${displayNumber(maximum)}]`;
    return () => label;
  }
  const width = (maximum - minimum) / binCount;
  return (value: number) => {
    const index = Math.min(binCount - 1, Math.floor((value - minimum) / width));
    const lower = minimum + index * width;
    const upper = index === binCount - 1 ? maximum : minimum + (index + 1) * width;
    return `[${displayNumber(lower)}, ${displayNumber(upper)}${index === binCount - 1 ? "]" : ")"}`;
  };
}

function applyTransform(
  materialized: MaterializedChartData,
  transform: ChartDataTransform,
): MaterializedChartData {
  const available = new Map(materialized.columns.map((column) => [column.name, column]));

  if (transform.kind === "fold") return applyFoldTransform(materialized, transform);

  if (transform.kind === "filter") {
    if (!available.has(transform.field)) return materialized;
    if (transform.mode === "values") {
      const allowed = new Set(transform.values);
      return { ...materialized, rows: materialized.rows.filter((row) => allowed.has(row[transform.field] ?? "")) };
    }
    return { ...materialized, rows: applyNumericFilter(materialized.rows, transform) };
  }

  if (transform.kind === "order") {
    if (!available.has(transform.groupField) || !available.has(transform.valueField)) return materialized;
    return { ...materialized, rows: applyGroupValueOrder(materialized.rows, transform) };
  }

  if (transform.mode === "group") {
    const groupColumn = available.get(transform.groupField);
    if (!groupColumn || !available.has(transform.valueField)) return materialized;
    const groups = new Map<string, { sum: number; count: number }>();
    materialized.rows.forEach((row) => {
      const groupValue = row[transform.groupField] ?? "";
      const accumulator = groups.get(groupValue) ?? { sum: 0, count: 0 };
      const value = numericValue(row, transform.valueField);
      if (value !== null) {
        accumulator.sum += value;
        accumulator.count += 1;
      }
      groups.set(groupValue, accumulator);
    });
    const rows = Array.from(groups, ([groupValue, accumulator]) => ({
      [transform.groupField]: groupValue,
      [transform.outputField]: accumulator.count === 0
        ? ""
        : String(transform.operation === "sum"
          ? accumulator.sum
          : accumulator.sum / accumulator.count),
    }));
    return {
      columns: [groupColumn, { name: transform.outputField, type: "quantitative" }],
      rows,
    };
  }

  if (!available.has(transform.field)) return materialized;
  const numericValues = materialized.rows
    .map((row) => numericValue(row, transform.field))
    .filter((value): value is number => value !== null);
  const labelForValue = numericValues.length > 0
    ? createBinLabeler(numericValues, transform)
    : null;
  const columns: DataColumn[] = [
    ...materialized.columns.filter((column) => column.name !== transform.outputField),
    { name: transform.outputField, type: "ordinal" },
  ];
  const rows = materialized.rows.map((row) => {
    const value = numericValue(row, transform.field);
    return {
      ...row,
      [transform.outputField]: value === null || numericValues.length === 0
        ? ""
        : labelForValue?.(value) ?? "",
    };
  });
  return { columns, rows };
}

function retainedPrimaryKey(dataset: Dataset) {
  const fields = dataset.primaryKey ?? [];
  if (fields.length === 0 || dataset.rows.length === 0) return inferCsvPrimaryKey(dataset);
  const available = new Set(dataset.columns.map((column) => column.name));
  if (!fields.every((field) => available.has(field))) return inferCsvPrimaryKey(dataset);
  const keys = new Set<string>();
  for (const row of dataset.rows) {
    const values = fields.map((field) => row[field]?.trim() ?? "");
    const key = JSON.stringify(values);
    if (!values.every(Boolean) || keys.has(key)) return inferCsvPrimaryKey(dataset);
    keys.add(key);
  }
  return fields;
}

export function materializeChartDataTransforms(
  dataset: Dataset,
  transforms: ChartDataTransform[] | undefined,
): Dataset {
  if (!transforms?.length) return dataset;
  const signature = transformSignature(transforms);
  const cached = transformCache.get(dataset as object)?.find((entry) =>
    entry.rows === dataset.rows
      && entry.columns === dataset.columns
      && entry.signature === signature,
  );
  if (cached) return cached.result;
  const materialized = transforms.reduce<MaterializedChartData>(applyTransform, {
    columns: dataset.columns.map((column) => ({ ...column })),
    rows: dataset.rows,
  });
  const transformed = { ...dataset, ...materialized };
  const result = { ...transformed, primaryKey: retainedPrimaryKey(transformed) };
  const entries = transformCache.get(dataset as object) ?? [];
  entries.push({ rows: dataset.rows, columns: dataset.columns, signature, result });
  if (entries.length > transformCacheLimit) entries.shift();
  transformCache.set(dataset as object, entries);
  return result;
}
