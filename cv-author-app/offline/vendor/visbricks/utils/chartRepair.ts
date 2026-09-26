import { getChartTemplateContract, normalizeBarChartVariant } from "./chartTemplates";
import { isDataColumnTypeCompatible } from "../types";
import type { DataColumnType, Dataset, ChartSpec } from "../types";
import type { ChartContract, ChartRoleContract } from "./chartContracts";

export type ChartRepairStatus =
  | "VALID"
  | "DIMENSION_OVERFLOW"
  | "DIMENSION_UNDERFLOW"
  | "TYPE_MISMATCH"
  | "UNRESOLVABLE";

export type ChartRepairIssue = Exclude<ChartRepairStatus, "VALID" | "UNRESOLVABLE">;

export type ChartRepairRoleContract = Omit<ChartRoleContract, "kind"> & { kind: "dimension" | "measure" | "style" };

/** Repair is an algorithmic view of the canonical chart contract. */
export type ChartRepairContract = Pick<ChartContract, "allowFieldReuse" | "aggregationPolicy" | "requiresFunctionalDependency" | "requiresIndependentDimensions"> & {
  roles: ChartRepairRoleContract[];
};

export type ChartRoleBinding = Record<string, string[]>;

export type ChartRepair = {
  addedFields: string[];
  binding: ChartRoleBinding;
};

export type ChartRepairValidation = {
  valid: boolean;
  issues: ChartRepairIssue[];
};

export type ChartRepairAnalysis = {
  status: ChartRepairStatus;
  issues: ChartRepairIssue[];
  repairs: ChartRepair[];
  warnings: string[];
};

export type ChartRepairOptions = {
  candidateFields?: string[];
};

function tuple(row: Dataset["rows"][number], fields: readonly string[]) {
  return JSON.stringify(fields.map((field) => row[field] ?? ""));
}

function distinctCount(dataset: Dataset, field: string) {
  return new Set(dataset.rows.map((row) => row[field] ?? "")).size;
}

function uniqueFields(binding: ChartRoleBinding, roles: ChartRepairRoleContract[], kind: ChartRepairRoleContract["kind"]) {
  const roleIds = new Set(roles.filter((role) => role.kind === kind).map((role) => role.id));
  return Array.from(new Set(Object.entries(binding)
    .filter(([role]) => roleIds.has(role))
    .flatMap(([, fields]) => fields)));
}

function hasPartitionWithin(dataset: Dataset, field: string, keyFields: readonly string[]) {
  const valuesByKey = new Map<string, Set<string>>();
  dataset.rows.forEach((row) => {
    const key = tuple(row, keyFields);
    const values = valuesByKey.get(key) ?? new Set<string>();
    values.add(row[field] ?? "");
    valuesByKey.set(key, values);
  });
  return Array.from(valuesByKey.values()).some((values) => values.size > 1);
}

function partitionsAreEquivalent(dataset: Dataset, leftField: string, rightField: string) {
  for (let leftIndex = 0; leftIndex < dataset.rows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < dataset.rows.length; rightIndex += 1) {
      const leftRow = dataset.rows[leftIndex]!;
      const rightRow = dataset.rows[rightIndex]!;
      const leftEqual = (leftRow[leftField] ?? "") === (rightRow[leftField] ?? "");
      const rightEqual = (leftRow[rightField] ?? "") === (rightRow[rightField] ?? "");
      if (leftEqual !== rightEqual) return false;
    }
  }
  return true;
}

function functionallyDetermines(
  dataset: Dataset,
  dimensionFields: readonly string[],
  valueFields: readonly string[],
) {
  if (valueFields.length === 0) return true;
  const valueByDimension = new Map<string, string>();
  for (const row of dataset.rows) {
    const dimension = tuple(row, dimensionFields);
    const value = tuple(row, valueFields);
    const existing = valueByDimension.get(dimension);
    if (existing !== undefined && existing !== value) return false;
    valueByDimension.set(dimension, value);
  }
  return true;
}

function cloneBinding(binding: ChartRoleBinding): ChartRoleBinding {
  return Object.fromEntries(Object.entries(binding).map(([role, fields]) => [role, [...fields]]));
}

function pushIssue(issues: ChartRepairIssue[], issue: ChartRepairIssue) {
  if (!issues.includes(issue)) issues.push(issue);
}

export function validateChartBinding(
  dataset: Dataset,
  contract: ChartRepairContract,
  binding: ChartRoleBinding,
  partitionKeyFields?: readonly string[],
): ChartRepairValidation {
  const issues: ChartRepairIssue[] = [];
  const columns = new Map(dataset.columns.map((column) => [column.name, column]));
  const roles = new Map(contract.roles.map((role) => [role.id, role]));

  Object.keys(binding).forEach((roleId) => {
    if (!roles.has(roleId)) pushIssue(issues, "TYPE_MISMATCH");
  });

  contract.roles.forEach((role) => {
    const fields = binding[role.id] ?? [];
    if (fields.length < role.minFields) pushIssue(issues, "DIMENSION_UNDERFLOW");
    if (fields.length > role.maxFields || new Set(fields).size !== fields.length) {
      pushIssue(issues, "TYPE_MISMATCH");
    }
    fields.forEach((field) => {
      const column = columns.get(field);
      if (!column || !isDataColumnTypeCompatible(role.accepts, column.type)) {
        pushIssue(issues, "TYPE_MISMATCH");
        return;
      }
      const cardinality = distinctCount(dataset, field);
      if ((role.minCardinality !== undefined && cardinality < role.minCardinality)
        || (role.maxCardinality !== undefined && cardinality > role.maxCardinality)) {
        pushIssue(issues, "DIMENSION_UNDERFLOW");
      }
    });
  });

  const fieldRoles = new Map<string, Set<string>>();
  Object.entries(binding).forEach(([role, fields]) => fields.forEach((field) => {
    const assignedRoles = fieldRoles.get(field) ?? new Set<string>();
    assignedRoles.add(role);
    fieldRoles.set(field, assignedRoles);
  }));
  if (!contract.allowFieldReuse
    && Array.from(fieldRoles.values()).some((assignedRoles) => assignedRoles.size > 1)) {
    pushIssue(issues, "TYPE_MISMATCH");
  }

  const dimensionFields = uniqueFields(binding, contract.roles, "dimension");
  const basePartitionKeys = partitionKeyFields
    ? Array.from(new Set(partitionKeyFields))
    : dimensionFields;
  contract.roles.filter((role) => role.kind === "dimension" && role.requiresPartition)
    .forEach((role) => (binding[role.id] ?? []).forEach((field) => {
      const keys = basePartitionKeys.filter((keyField) => keyField !== field);
      if (!hasPartitionWithin(dataset, field, keys)) pushIssue(issues, "DIMENSION_UNDERFLOW");
    }));

  if (contract.requiresIndependentDimensions) {
    for (let leftIndex = 0; leftIndex < dimensionFields.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < dimensionFields.length; rightIndex += 1) {
        if (partitionsAreEquivalent(
          dataset,
          dimensionFields[leftIndex]!,
          dimensionFields[rightIndex]!,
        )) {
          pushIssue(issues, "DIMENSION_UNDERFLOW");
        }
      }
    }
  }

  if (contract.aggregationPolicy === "forbidden" && contract.requiresFunctionalDependency) {
    const valueFields = uniqueFields(binding, contract.roles, "measure");
    if (!functionallyDetermines(dataset, dimensionFields, valueFields)) {
      pushIssue(issues, "DIMENSION_OVERFLOW");
    }
  }
  return { valid: issues.length === 0, issues };
}

function isSubset(left: readonly string[], right: readonly string[]) {
  const rightFields = new Set(right);
  return left.every((field) => rightFields.has(field));
}

function combinations(fields: readonly string[], size: number) {
  const result: string[][] = [];
  const visit = (start: number, selected: string[]) => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= fields.length - (size - selected.length); index += 1) {
      selected.push(fields[index]!);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
}

function nonEmptySubsets<T>(items: readonly T[]) {
  const result: T[][] = [];
  for (let mask = 1; mask < 2 ** items.length; mask += 1) {
    result.push(items.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return result;
}

function bindingKey(binding: ChartRoleBinding) {
  return JSON.stringify(Object.entries(binding)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, fields]) => [role, [...fields].sort()]));
}

function enumerateBindings(
  dataset: Dataset,
  contract: ChartRepairContract,
  currentBinding: ChartRoleBinding,
  addedFields: readonly string[],
) {
  const columns = new Map(dataset.columns.map((column) => [column.name, column]));
  const bindings: ChartRoleBinding[] = [];
  const seen = new Set<string>();

  const visit = (fieldIndex: number, binding: ChartRoleBinding) => {
    if (fieldIndex === addedFields.length) {
      const key = bindingKey(binding);
      if (!seen.has(key)) {
        seen.add(key);
        bindings.push(binding);
      }
      return;
    }
    const field = addedFields[fieldIndex]!;
    const column = columns.get(field);
    if (!column) return;
    const eligibleRoles = contract.roles.filter((role) =>
      isDataColumnTypeCompatible(role.accepts, column.type)
      && (binding[role.id]?.length ?? 0) < role.maxFields);
    const choices = contract.allowFieldReuse
      ? nonEmptySubsets(eligibleRoles)
      : eligibleRoles.map((role) => [role]);
    choices.forEach((roles) => {
      if (roles.some((role) => (binding[role.id]?.length ?? 0) >= role.maxFields)) return;
      const next = cloneBinding(binding);
      roles.forEach((role) => {
        next[role.id] = [...(next[role.id] ?? []), field];
      });
      visit(fieldIndex + 1, next);
    });
  };
  visit(0, cloneBinding(currentBinding));
  return bindings;
}

function primaryStatus(issues: ChartRepairIssue[]) {
  if (issues.includes("TYPE_MISMATCH")) return "TYPE_MISMATCH" as const;
  if (issues.includes("DIMENSION_UNDERFLOW")) return "DIMENSION_UNDERFLOW" as const;
  return "DIMENSION_OVERFLOW" as const;
}

export function analyzeChartRepairs(
  dataset: Dataset,
  contract: ChartRepairContract,
  currentBinding: ChartRoleBinding,
  options: ChartRepairOptions = {},
): ChartRepairAnalysis {
  const initialBinding = cloneBinding(currentBinding);
  const initialDimensionFields = uniqueFields(initialBinding, contract.roles, "dimension");
  const initial = validateChartBinding(dataset, contract, initialBinding, initialDimensionFields);
  if (initial.valid) {
    return {
      status: "VALID",
      issues: [],
      repairs: [{ addedFields: [], binding: initialBinding }],
      warnings: [],
    };
  }

  const available = new Set(dataset.columns.map((column) => column.name));
  const bound = new Set(Object.values(initialBinding).flat());
  const requested = Array.from(new Set(
    options.candidateFields ?? dataset.columns.map((column) => column.name),
  ));
  const unknown = requested.filter((field) => !available.has(field));
  const candidateFields = dataset.columns.map((column) => column.name)
    .filter((field) => requested.includes(field) && !bound.has(field));
  const remainingCapacity = contract.roles.reduce(
    (capacity, role) => capacity + Math.max(0, role.maxFields - (initialBinding[role.id]?.length ?? 0)),
    0,
  );
  const maximumAddedFields = Math.min(candidateFields.length, remainingCapacity);
  const minimalFieldSets: string[][] = [];
  const repairs: ChartRepair[] = [];

  for (let size = 1; size <= maximumAddedFields; size += 1) {
    combinations(candidateFields, size).forEach((addedFields) => {
      if (minimalFieldSets.some((minimal) => isSubset(minimal, addedFields))) return;
      const validBindings = enumerateBindings(dataset, contract, initialBinding, addedFields)
        .filter((binding) => validateChartBinding(
          dataset,
          contract,
          binding,
          initialDimensionFields,
        ).valid);
      if (validBindings.length === 0) return;
      minimalFieldSets.push(addedFields);
      validBindings.forEach((binding) => repairs.push({ addedFields: [...addedFields], binding }));
    });
  }

  return {
    status: repairs.length > 0 ? primaryStatus(initial.issues) : "UNRESOLVABLE",
    issues: initial.issues,
    repairs,
    warnings: unknown.length ? [`Unknown candidate fields: ${unknown.join(", ")}`] : [],
  };
}

function repairRoleId(template: ReturnType<typeof getChartTemplateContract>, channel: string, role: string) {
  if (role === "series") return "series";
  if (template?.id === "pie" || template?.id === "donut") {
    if (channel === "theta") return "angle";
  }
  if (template?.id === "matrix") {
    if (channel === "x") return "column";
    if (channel === "y") return "row";
    if (channel === "color") return "value";
  }
  if (template?.id === "contour" && channel === "color") return "value";
  return channel;
}

/** Adapts the repository's declarative template contract to the repair solver. */
export function analyzeChartSpecRepairs(dataset: Dataset, spec: ChartSpec): ChartRepairAnalysis {
  const template = getChartTemplateContract(spec.chartType);
  if (!template) {
    return { status: "UNRESOLVABLE", issues: [], repairs: [], warnings: ["Unknown chart type"] };
  }
  const derivedBarSegments = template.id === "bar"
    && (normalizeBarChartVariant(spec.chartType) === "stacked" || normalizeBarChartVariant(spec.chartType) === "divergent-stacked")
    && (spec.valueFields?.length ?? 0) >= 2;
  const multiFieldBarSeries = template.id === "bar"
    && ["grouped", "stacked", "divergent-stacked"].includes(normalizeBarChartVariant(spec.chartType) ?? "")
    && !derivedBarSegments;
  const derivedPolarSegments = (template.id === "pie" || template.id === "donut")
    && (spec.angleFields?.length ?? 0) > 0;
  const roles: ChartRepairRoleContract[] = template.channels.map((channel) => ({
    id: repairRoleId(template, channel.channel, channel.role),
    kind: derivedPolarSegments && channel.channel === "segment"
      ? "measure"
      : derivedBarSegments && channel.channel === "series"
        ? "measure"
        : channel.role === "dimension" || channel.role === "series" ? "dimension" : channel.role,
    accepts: (derivedBarSegments && channel.channel === "series")
      || (derivedPolarSegments && channel.channel === "segment")
      ? ["quantitative"]
      : channel.accepts,
    minFields: (derivedBarSegments && channel.channel === "y")
      || (derivedPolarSegments && channel.channel === "theta")
      ? 0
      : channel.required ? 1 : 0,
    maxFields: derivedPolarSegments && channel.channel === "segment"
      ? spec.angleFields!.length
      : derivedBarSegments && channel.channel === "series"
        ? spec.valueFields!.length
        : multiFieldBarSeries && channel.role === "series"
          ? dataset.columns.length
          : 1,
    requiresPartition: !(derivedPolarSegments && channel.channel === "segment")
      && (channel.role === "dimension" || (channel.role === "series" && !(derivedBarSegments && channel.channel === "series"))),
    minCardinality: !(derivedPolarSegments && channel.channel === "segment")
      && (channel.role === "dimension" || channel.role === "series") ? 2 : undefined,
  }));
  const binding: ChartRoleBinding = {};
  template.channels.forEach((channel) => {
    const roleId = repairRoleId(template, channel.channel, channel.role);
    const encoding = derivedBarSegments && channel.channel === "series"
      ? undefined
      : channel.role === "series"
        ? spec.roleBindings?.series?.fields[0]
          ?? spec.encodings.series
          ?? (spec.seriesFields?.length ? spec.seriesFields[0] : spec.series)
          ?? spec.encodings[channel.channel]
      : template.id === "pie" || template.id === "donut"
        ? channel.channel === "theta"
          ? spec.encodings.theta ?? spec.encodings.angle ?? spec.encodings.y
          : spec.encodings[channel.channel]
        : template.id === "matrix"
          ? channel.channel === "x"
            ? spec.encodings.x ?? spec.encodings.column
            : channel.channel === "y"
              ? spec.encodings.y ?? spec.encodings.row
              : channel.channel === "color"
                ? spec.encodings.color ?? spec.encodings.value
                : spec.encodings[channel.channel]
          : template.id === "contour" && channel.channel === "color"
            ? spec.encodings.color ?? spec.encodings.value
            : spec.encodings[channel.channel];
    if (derivedBarSegments && channel.channel === "series") {
      binding[roleId] = spec.valueFields!.map((field) => field.field);
    } else if (derivedPolarSegments && channel.channel === "segment") {
      binding[roleId] = spec.angleFields!.map((field) => field.field);
    } else if (channel.role === "series" && spec.seriesFields?.length) {
      binding[roleId] = spec.seriesFields.map((field) => field.field);
    } else if (encoding) binding[roleId] = [encoding.field];
  });
  return analyzeChartRepairs(dataset, {
    roles,
    allowFieldReuse: template.allowFieldReuse,
    aggregationPolicy: template.aggregationPolicy,
    requiresFunctionalDependency: template.requiresFunctionalDependency,
    requiresIndependentDimensions: template.requiresIndependentDimensions,
  }, binding);
}
