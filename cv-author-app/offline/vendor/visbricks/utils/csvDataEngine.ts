import type { Dataset } from "../types";

export type CsvColumnProfile = {
  field: string;
  rowCount: number;
  nonEmptyCount: number;
  missingCount: number;
  distinctCount: number;
  cardinalityRatio: number;
};

export type CsvGrainStatistics = {
  rowCount: number;
  valueObservationCount: number;
  groupCount: number;
  duplicateGroupCount: number;
  extraObservationCount: number;
  conflictingValueGroupCount: number;
  conflictingValueExcess: number;
  maximumMultiplicity: number;
};

export type CsvGrainCandidate = {
  fields: string[];
  exact: boolean;
  resultingStatistics: CsvGrainStatistics;
  evidence: string[];
};

export type CsvGrainAnalysis = {
  status: "unique" | "conflict" | "unresolvable" | "insufficient-data";
  ambiguous: boolean;
  topCandidateFields: string[][];
  keyFields: string[];
  valueFields: string[];
  baseline: CsvGrainStatistics;
  conflictPairCount: number;
  distinguishingFieldSets: string[][];
  minimalFieldSets: string[][];
  columnProfiles: CsvColumnProfile[];
  candidates: CsvGrainCandidate[];
  warnings: string[];
};

export type CsvGrainAnalysisOptions = {
  candidateFields?: string[];
  /** @deprecated Exact minimal repairs are never bounded by combination size. */
  maxCombinationSize?: number;
  /** @deprecated Exact minimal repairs do not use beam search. */
  beamWidth?: number;
  /** @deprecated Exact minimal repairs are never truncated. */
  candidateLimit?: number;
};

export type CsvPrimaryKeyInferenceOptions = {
  maxCombinationSize?: number;
  beamWidth?: number;
};

const missingValue = "\u0000missing";

function rawValue(row: Dataset["rows"][number], field: string) {
  const value = row[field]?.trim() ?? "";
  return value || missingValue;
}

function tupleKey(row: Dataset["rows"][number], fields: string[]) {
  return JSON.stringify(fields.map((field) => rawValue(row, field)));
}

export function csvRowKey(
  dataset: Dataset,
  row: Dataset["rows"][number],
  rowIndex = dataset.rows.indexOf(row),
) {
  const fields = dataset.primaryKey ?? [];
  if (fields.length > 0 && fields.every((field) => rawValue(row, field) !== missingValue)) {
    return fields.map((field) => row[field] ?? "").join("|");
  }
  return rowIndex >= 0 ? String(rowIndex) : "";
}

function completeValueCount(row: Dataset["rows"][number], fields: string[]) {
  return fields.reduce((count, field) => count + (rawValue(row, field) === missingValue ? 0 : 1), 0);
}

export function profileCsvColumns(dataset: Dataset): CsvColumnProfile[] {
  return dataset.columns.map((column) => {
    const values = new Set<string>();
    let nonEmptyCount = 0;
    for (const row of dataset.rows) {
      const value = rawValue(row, column.name);
      if (value === missingValue) continue;
      values.add(value);
      nonEmptyCount += 1;
    }
    const distinctCount = values.size;
    return {
      field: column.name,
      rowCount: dataset.rows.length,
      nonEmptyCount,
      missingCount: dataset.rows.length - nonEmptyCount,
      distinctCount,
      cardinalityRatio: nonEmptyCount ? distinctCount / nonEmptyCount : 0,
    };
  });
}

function distinctTupleCount(rows: Dataset["rows"], fields: string[]) {
  return new Set(rows.map((row) => tupleKey(row, fields))).size;
}

/** Returns a minimal, structurally unique key only when the evidence is unambiguous. */
export function inferCsvPrimaryKey(
  dataset: Dataset,
  options: CsvPrimaryKeyInferenceOptions = {},
): string[] | undefined {
  if (dataset.rows.length < 2) return undefined;
  const candidateFields = profileCsvColumns(dataset)
    .filter((profile) => profile.nonEmptyCount === profile.rowCount && profile.distinctCount > 1)
    .map((profile) => profile.field);
  const maxCombinationSize = Math.max(1, Math.min(options.maxCombinationSize ?? 2, 3));
  const beamWidth = Math.max(2, options.beamWidth ?? 32);
  let frontier = candidateFields.map((field) => [field]);

  for (let size = 1; size <= maxCombinationSize && frontier.length; size += 1) {
    const evaluated = frontier.map((fields) => ({
      fields,
      distinctCount: distinctTupleCount(dataset.rows, fields),
    }));
    const exact = evaluated.filter((candidate) => candidate.distinctCount === dataset.rows.length);
    if (exact.length > 0) return exact.length === 1 ? exact[0]!.fields : undefined;
    if (size === maxCombinationSize) break;

    const promising = evaluated
      .sort((left, right) => right.distinctCount - left.distinctCount
        || combinationKey(left.fields).localeCompare(combinationKey(right.fields)))
      .slice(0, beamWidth);
    const next = new Map<string, string[]>();
    promising.forEach((candidate) => candidateFields.forEach((field) => {
      if (candidate.fields.includes(field)) return;
      const fields = [...candidate.fields, field]
        .sort((left, right) => candidateFields.indexOf(left) - candidateFields.indexOf(right));
      next.set(combinationKey(fields), fields);
    }));
    frontier = Array.from(next.values());
  }
  return undefined;
}

function grainStatistics(
  rows: Dataset["rows"],
  keyFields: string[],
  valueFields: string[],
): CsvGrainStatistics {
  const groups = new Map<string, Dataset["rows"]>();
  rows.forEach((row) => {
    const key = tupleKey(row, keyFields);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });
  const groupedRows = Array.from(groups.values());
  const valueSignatures = groupedRows.map((groupRows) => new Set(
    groupRows.map((row) => tupleKey(row, valueFields)),
  ));
  return {
    rowCount: rows.length,
    valueObservationCount: rows.reduce(
      (count, row) => count + completeValueCount(row, valueFields),
      0,
    ),
    groupCount: groups.size,
    duplicateGroupCount: groupedRows.filter((groupRows) => groupRows.length > 1).length,
    extraObservationCount: groupedRows.reduce(
      (count, groupRows) => count + Math.max(0, groupRows.length - 1),
      0,
    ),
    conflictingValueGroupCount: valueSignatures.filter((values) => values.size > 1).length,
    conflictingValueExcess: valueSignatures.reduce(
      (count, values) => count + Math.max(0, values.size - 1),
      0,
    ),
    maximumMultiplicity: groupedRows.reduce(
      (maximum, groupRows) => Math.max(maximum, groupRows.length),
      0,
    ),
  };
}

function combinationKey(fields: string[]) {
  return [...fields].sort().join("\u001f");
}

function isSubset(left: readonly string[], right: readonly string[]) {
  const rightFields = new Set(right);
  return left.every((field) => rightFields.has(field));
}

function orderedFields(fields: Iterable<string>, fieldOrder: readonly string[]) {
  const order = new Map(fieldOrder.map((field, index) => [field, index]));
  return Array.from(new Set(fields)).sort((left, right) =>
    (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
      || left.localeCompare(right));
}

function minimalAntichain(sets: string[][], fieldOrder: readonly string[]) {
  const unique = new Map<string, string[]>();
  sets.forEach((fields) => {
    const ordered = orderedFields(fields, fieldOrder);
    unique.set(combinationKey(ordered), ordered);
  });
  const minimal: string[][] = [];
  Array.from(unique.values())
    .sort((left, right) => left.length - right.length
      || combinationKey(left).localeCompare(combinationKey(right)))
    .forEach((fields) => {
      if (!minimal.some((candidate) => isSubset(candidate, fields))) minimal.push(fields);
    });
  return minimal;
}

/** Enumerates the complete family of inclusion-minimal hitting sets. */
export function enumerateMinimalHittingSets(
  constraints: readonly (readonly string[])[],
  fieldOrder: readonly string[] = [],
): string[][] {
  if (constraints.some((constraint) => constraint.length === 0)) return [];
  const normalizedConstraints = minimalAntichain(
    constraints.map((constraint) => orderedFields(constraint, fieldOrder)),
    fieldOrder,
  );
  let transversals: string[][] = [[]];
  normalizedConstraints.forEach((constraint) => {
    const constraintFields = new Set(constraint);
    const expanded = transversals.flatMap((transversal) =>
      transversal.some((field) => constraintFields.has(field))
        ? [transversal]
        : constraint.map((field) => [...transversal, field]));
    transversals = minimalAntichain(expanded, fieldOrder);
  });
  return transversals;
}

function conflictConstraints(
  rows: Dataset["rows"],
  keyFields: string[],
  valueFields: string[],
  candidateFields: string[],
) {
  const groups = new Map<string, Dataset["rows"]>();
  rows.forEach((row) => {
    const key = tupleKey(row, keyFields);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });
  const constraints: string[][] = [];
  let conflictPairCount = 0;
  Array.from(groups.values()).forEach((groupRows) => {
    const valueKeys = groupRows.map((row) => tupleKey(row, valueFields));
    for (let leftIndex = 0; leftIndex < groupRows.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < groupRows.length; rightIndex += 1) {
        const left = groupRows[leftIndex]!;
        const right = groupRows[rightIndex]!;
        if (valueKeys[leftIndex] === valueKeys[rightIndex]) continue;
        conflictPairCount += 1;
        constraints.push(candidateFields.filter((field) => rawValue(left, field) !== rawValue(right, field)));
      }
    }
  });
  return { conflictPairCount, constraints };
}

export function analyzeCsvGrain(
  dataset: Dataset,
  keyFields: string[],
  valueFields: string[],
  options: CsvGrainAnalysisOptions = {},
): CsvGrainAnalysis {
  const available = new Set(dataset.columns.map((column) => column.name));
  const keys = Array.from(new Set(keyFields));
  const values = Array.from(new Set(valueFields));
  const excluded = new Set([...keys, ...values]);
  const requestedCandidates = Array.from(new Set(
    options.candidateFields ?? dataset.columns.map((column) => column.name),
  ));
  const unknownCandidates = requestedCandidates.filter((field) => !available.has(field));
  const missingFields = [...keys, ...values].filter((field) => !available.has(field));
  const warnings = [
    ...(missingFields.length ? [`Unknown CSV fields: ${missingFields.join(", ")}`] : []),
    ...(unknownCandidates.length ? [`Unknown candidate fields: ${unknownCandidates.join(", ")}`] : []),
  ];
  const candidateFields = dataset.columns
    .map((column) => column.name)
    .filter((field) => requestedCandidates.includes(field) && !excluded.has(field));
  const participatingFields = [...keys, ...values, ...candidateFields];
  const hasMissingValues = dataset.rows.some((row) =>
    participatingFields.some((field) => rawValue(row, field) === missingValue));
  if (hasMissingValues) warnings.push("CSV grain repair requires non-missing values in participating fields");
  const rows = missingFields.length || hasMissingValues ? [] : dataset.rows;
  const baseline = grainStatistics(rows, keys, values);
  const profiles = profileCsvColumns(dataset);
  if (!values.length || !rows.length || missingFields.length || hasMissingValues) {
    return {
      status: "insufficient-data",
      ambiguous: false,
      topCandidateFields: [],
      keyFields: keys,
      valueFields: values,
      baseline,
      conflictPairCount: 0,
      distinguishingFieldSets: [],
      minimalFieldSets: [],
      columnProfiles: profiles,
      candidates: [],
      warnings,
    };
  }
  const { conflictPairCount, constraints } = conflictConstraints(
    rows,
    keys,
    values,
    candidateFields,
  );
  if (conflictPairCount === 0) {
    return {
      status: "unique",
      ambiguous: false,
      topCandidateFields: [],
      keyFields: keys,
      valueFields: values,
      baseline,
      conflictPairCount,
      distinguishingFieldSets: [],
      minimalFieldSets: [[]],
      columnProfiles: profiles,
      candidates: [],
      warnings,
    };
  }
  const distinguishingFieldSets = constraints.map((constraint) => [...constraint]);
  if (constraints.some((constraint) => constraint.length === 0)) {
    return {
      status: "unresolvable",
      ambiguous: false,
      topCandidateFields: [],
      keyFields: keys,
      valueFields: values,
      baseline,
      conflictPairCount,
      distinguishingFieldSets,
      minimalFieldSets: [],
      columnProfiles: profiles,
      candidates: [],
      warnings: [...warnings, "At least one value-conflict pair cannot be distinguished by candidate fields"],
    };
  }
  const reducedConstraints = minimalAntichain(constraints, candidateFields);
  const minimalFieldSets = enumerateMinimalHittingSets(reducedConstraints, candidateFields);
  const candidates = minimalFieldSets.map((fields): CsvGrainCandidate => ({
    fields,
    exact: true,
    resultingStatistics: grainStatistics(rows, [...keys, ...fields], values),
    evidence: ["Every value-conflict pair is distinguished", "No supplemental field can be removed"],
  }));
  const topCandidateFields = candidates.map((candidate) => candidate.fields);
  return {
    status: "conflict",
    ambiguous: candidates.length > 1,
    topCandidateFields,
    keyFields: keys,
    valueFields: values,
    baseline,
    conflictPairCount,
    distinguishingFieldSets,
    minimalFieldSets,
    columnProfiles: profiles,
    candidates,
    warnings,
  };
}
