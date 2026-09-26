import { isDataColumnTypeCompatible, type Dataset } from "../types";
import type {
  BlockValidationResult,
  BlockValidationStatus,
  ChartBlockInstanceSpec,
  ChartBlockSpecification,
} from "./model";
import { materializeChartDataTransforms } from "../utils/chartDataTransforms";

type ValidationIssue = Exclude<BlockValidationStatus, "VALID" | "UNRESOLVABLE">;

function tuple(row: Dataset["rows"][number], fields: readonly string[]) {
  return JSON.stringify(fields.map((field) => row[field] ?? ""));
}

function functionallyDetermines(dataset: Dataset, keys: readonly string[], values: readonly string[]) {
  const valuesByKey = new Map<string, string>();
  for (const row of dataset.rows) {
    const key = tuple(row, keys);
    const value = tuple(row, values);
    const existing = valuesByKey.get(key);
    if (existing !== undefined && existing !== value) return false;
    valuesByKey.set(key, value);
  }
  return true;
}

function partitionsAreEquivalent(dataset: Dataset, left: string, right: string) {
  for (let leftIndex = 0; leftIndex < dataset.rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < dataset.rows.length; rightIndex += 1) {
      const leftRow = dataset.rows[leftIndex]!;
      const rightRow = dataset.rows[rightIndex]!;
      if (((leftRow[left] ?? "") === (rightRow[left] ?? ""))
        !== ((leftRow[right] ?? "") === (rightRow[right] ?? ""))) return false;
    }
  }
  return true;
}

function contractFlag(specification: ChartBlockSpecification, key: string, fallback: boolean) {
  const data = specification.data;
  return typeof data === "object" && data !== null && key in data
    ? Boolean((data as Record<string, unknown>)[key])
    : fallback;
}

/** Validate only the complete proposed binding; this function never repairs or mutates it. */
export function validateChartBlockInstance(
  specification: ChartBlockSpecification,
  instance: ChartBlockInstanceSpec,
  dataset: Dataset,
): BlockValidationResult {
  if (instance.blockId !== specification.id || instance.blockRevision !== specification.revision) {
    return { status: "UNRESOLVABLE", issues: ["The instance does not match this block specification revision."] };
  }
  if (instance.datasetId !== dataset.id) {
    return { status: "UNRESOLVABLE", issues: ["The instance and dataset identities do not match."] };
  }
  const issues = new Set<ValidationIssue>();
  const invalidFold = instance.dataTransforms.some((transform) => transform.kind === "fold"
    && (transform.sourceFields.length < 2
      || transform.sourceFields.some((field) => !dataset.columns.some((column) => column.name === field))
      || transform.lineage.operation !== "fold"
      || transform.lineage.sourceFields.join("\u0000") !== transform.sourceFields.join("\u0000")));
  if (invalidFold) return { status: "UNRESOLVABLE", issues: ["A fold transform has unresolved source fields or lineage."] };
  const materializedDataset = materializeChartDataTransforms(dataset, instance.dataTransforms);
  const columns = new Map(materializedDataset.columns.map((column) => [column.name, column]));
  const roles = new Map(specification.roles.map((role) => [role.id, role]));
  Object.keys(instance.bindings).forEach((roleId) => {
    if (!roles.has(roleId)) issues.add("TYPE_MISMATCH");
  });
  specification.roles.forEach((role) => {
    const bindings = instance.bindings[role.id] ?? [];
    if (bindings.length < role.minFields) issues.add("DIMENSION_UNDERFLOW");
    if (bindings.length > role.maxFields || new Set(bindings.map((binding) => binding.field)).size !== bindings.length) {
      issues.add("TYPE_MISMATCH");
    }
    bindings.forEach((binding) => {
      const column = columns.get(binding.field);
      if (!column || !isDataColumnTypeCompatible(role.accepts, column.type)) {
        issues.add("TYPE_MISMATCH");
        return;
      }
      const cardinality = new Set(materializedDataset.rows.map((row) => row[binding.field] ?? "")).size;
      if ((role.minCardinality !== undefined && cardinality < role.minCardinality)
        || (role.maxCardinality !== undefined && cardinality > role.maxCardinality)) {
        issues.add("DIMENSION_UNDERFLOW");
      }
    });
  });
  const roleByField = new Map<string, Set<string>>();
  Object.entries(instance.bindings).forEach(([roleId, bindings]) => bindings.forEach((binding) => {
    const fieldRoles = roleByField.get(binding.field) ?? new Set<string>();
    fieldRoles.add(roleId);
    roleByField.set(binding.field, fieldRoles);
  }));
  if (!contractFlag(specification, "allowFieldReuse", false)
    && [...roleByField.values()].some((fieldRoles) => fieldRoles.size > 1)) issues.add("TYPE_MISMATCH");

  const dimensionFields = specification.roles
    .filter((role) => role.kind === "dimension" || role.kind === "series" || role.kind === "identity")
    .flatMap((role) => (instance.bindings[role.id] ?? []).map((binding) => binding.field));
  if (contractFlag(specification, "requiresIndependentDimensions", false)) {
    for (let left = 0; left < dimensionFields.length; left += 1) {
      for (let right = left + 1; right < dimensionFields.length; right += 1) {
        if (partitionsAreEquivalent(materializedDataset, dimensionFields[left]!, dimensionFields[right]!)) {
          issues.add("DIMENSION_UNDERFLOW");
        }
      }
    }
  }
  const data = specification.data as Record<string, unknown>;
  if (data.aggregationPolicy === "forbidden"
    && contractFlag(specification, "requiresFunctionalDependency", false)) {
    const valueFields = specification.roles.filter((role) => role.kind === "measure")
      .flatMap((role) => (instance.bindings[role.id] ?? []).map((binding) => binding.field));
    if (!functionallyDetermines(materializedDataset, dimensionFields, valueFields)) issues.add("DIMENSION_OVERFLOW");
  }
  if (!issues.size) return { status: "VALID", issues: [] };
  const status = issues.has("TYPE_MISMATCH")
    ? "TYPE_MISMATCH"
    : issues.has("DIMENSION_UNDERFLOW")
      ? "DIMENSION_UNDERFLOW"
      : "DIMENSION_OVERFLOW";
  return { status, issues: [...issues] };
}
