import type {
  ChartDataTransform,
  ChartEncoding,
  ChartEncodingChannel,
  ChartFoldTransform,
  ChartRoleBinding,
  ChartSpec,
  Dataset,
} from "../types";
import { isDataColumnTypeCompatible } from "../types";
import type { BlockRoleSpecification, ChartBlockSpecification, RoleBindingModeSpecification } from "./model";

export type RoleSelectionMaterialization = "direct" | "fold" | "repeat";

export type RoleBindingSelection = {
  roleId: ChartEncodingChannel;
  fields: string[];
  materialization: RoleSelectionMaterialization;
};

export type RoleBindingMutationResult = {
  chartSpec: ChartSpec;
  error?: string;
};

const foldTransformPrefix = "chart-role-fold:";

function foldTransformId(roleId: string) {
  return `${foldTransformPrefix}${roleId}`;
}

function safeOutputPart(roleId: string) {
  return roleId.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function foldOutputFields(roleId: string) {
  const part = safeOutputPart(roleId);
  return {
    key: `__chart_fold_${part}_key__`,
    value: `__chart_fold_${part}_value__`,
  };
}

function foldTransform(spec: ChartSpec, transformId: string) {
  return spec.dataTransforms?.find((transform): transform is ChartFoldTransform =>
    transform.kind === "fold" && transform.id === transformId);
}

/**
 * Resolves the user's selected raw fields. A derived binding points back to
 * its fold transform, so the source set is never duplicated in binding state.
 */
export function roleBindingSelectedFields(spec: ChartSpec, roleId: ChartEncodingChannel): string[] {
  const binding = spec.roleBindings?.[roleId];
  if (binding?.mode === "derived" && binding.materialization === "fold") {
    const transform = foldTransform(spec, binding.transformId);
    const sourceRoleId = transform?.sourceRoleId
      ?? (binding.transformId.startsWith(foldTransformPrefix)
        ? binding.transformId.slice(foldTransformPrefix.length)
        : undefined);
    if (sourceRoleId === roleId) return [...(transform?.sourceFields ?? [])];
  }
  if (binding) return binding.fields.map((field) => field.field);

  // One localized read adapter for saved charts created before roleBindings.
  if (roleId === "y" && spec.valueFields?.length) return spec.valueFields.map((field) => field.field);
  if (roleId === "theta" && spec.angleFields?.length) return spec.angleFields.map((field) => field.field);
  if (roleId === "dimensions" && spec.parallelFields?.length) return spec.parallelFields.map((field) => field.field);
  if (roleId === "series") {
    if (spec.seriesFields?.length) return spec.seriesFields.map((field) => field.field);
    if (spec.series) return [spec.series.field];
    if (spec.encodings.color?.type === "nominal" || spec.encodings.color?.type === "ordinal") {
      return [spec.encodings.color.field];
    }
  }
  const encoding = spec.encodings[roleId];
  return encoding ? [encoding.field] : [];
}

/** True for a fold-generated key/value target that is not the editable source role. */
export function isGeneratedRoleBinding(spec: ChartSpec, roleId: ChartEncodingChannel) {
  const binding = spec.roleBindings?.[roleId];
  if (binding?.mode !== "derived" || binding.materialization !== "fold") return false;
  const transform = foldTransform(spec, binding.transformId);
  const sourceRoleId = transform?.sourceRoleId
    ?? (binding.transformId.startsWith(foldTransformPrefix)
      ? binding.transformId.slice(foldTransformPrefix.length)
      : undefined);
  return sourceRoleId !== roleId;
}

/** Fields consumed by the renderer/materialized schema, not fold source fields. */
export function roleBindingResolvedFields(spec: ChartSpec, roleId: ChartEncodingChannel): ChartEncoding[] {
  const binding = spec.roleBindings?.[roleId];
  if (binding) return binding.fields.map((field) => ({ ...field }));
  if (roleId === "y" && spec.valueFields?.length) return spec.valueFields.map((field) => ({ ...field }));
  if (roleId === "theta" && spec.angleFields?.length) return spec.angleFields.map((field) => ({ ...field }));
  if (roleId === "dimensions" && spec.parallelFields?.length) return spec.parallelFields.map((field) => ({ ...field }));
  if (roleId === "series") {
    if (spec.seriesFields?.length) return spec.seriesFields.map((field) => ({ ...field }));
    if (spec.series) return [{ ...spec.series }];
    if (spec.encodings.color?.type === "nominal" || spec.encodings.color?.type === "ordinal") {
      return [{ ...spec.encodings.color }];
    }
  }
  const encoding = spec.encodings[roleId];
  return encoding ? [{ ...encoding }] : [];
}

export function roleBindingMaterialization(
  spec: ChartSpec,
  roleId: ChartEncodingChannel,
): RoleSelectionMaterialization {
  const binding = spec.roleBindings?.[roleId];
  if (binding?.mode === "derived") return "fold";
  if (binding?.mode === "field-set") return binding.materialization;
  const fields = roleBindingSelectedFields(spec, roleId);
  if (roleId === "dimensions" && fields.length > 1) return "repeat";
  if ((roleId === "y" && (spec.valueFields?.length ?? 0) > 1)
    || (roleId === "theta" && (spec.angleFields?.length ?? 0) > 1)) return "fold";
  return "direct";
}

function modeForSelection(
  role: BlockRoleSpecification,
  selection: RoleBindingSelection,
): RoleBindingModeSpecification | null {
  const hasFieldMode = role.bindingModes.some((mode) => mode.kind === "field");
  const kind = selection.fields.length <= 1 && hasFieldMode ? "field" : selection.materialization;
  return role.bindingModes.find((mode) => mode.kind === kind
    && selection.fields.length <= mode.maxFields) ?? null;
}

function clearLegacyProjection(spec: ChartSpec, roleId: ChartEncodingChannel) {
  const next = { ...spec };
  if (roleId === "y") next.valueFields = undefined;
  if (roleId === "theta") next.angleFields = undefined;
  if (roleId === "dimensions") next.parallelFields = undefined;
  if (roleId === "series") {
    next.series = undefined;
    next.seriesFields = undefined;
  }
  return next;
}

function insertFoldTransform(transforms: ChartDataTransform[], transform: ChartFoldTransform) {
  const retained = transforms.filter((item) => item.id !== transform.id);
  const filters = retained.filter((item) => item.kind === "filter");
  const remaining = retained.filter((item) => item.kind !== "filter");
  return [...filters, transform, ...remaining];
}

function clearPriorDerivedBinding(
  input: ChartSpec,
  roleId: ChartEncodingChannel,
) {
  const prior = input.roleBindings?.[roleId];
  if (prior?.mode !== "derived") return input;
  const roleBindings = { ...input.roleBindings };
  const encodings = { ...input.encodings };
  const generatedFields = new Set<string>();
  Object.entries(roleBindings).forEach(([candidateRoleId, binding]) => {
    if (binding?.mode !== "derived" || binding.transformId !== prior.transformId) return;
    binding.fields.forEach((field) => generatedFields.add(field.field));
    delete roleBindings[candidateRoleId as ChartEncodingChannel];
    const encoding = encodings[candidateRoleId as ChartEncodingChannel];
    if (encoding && binding.fields.some((field) => field.field === encoding.field)) {
      delete encodings[candidateRoleId as ChartEncodingChannel];
    }
  });
  return {
    ...input,
    roleBindings,
    encodings,
    series: input.series && generatedFields.has(input.series.field) ? undefined : input.series,
    seriesFields: input.seriesFields?.some((field) => generatedFields.has(field.field))
      ? undefined
      : input.seriesFields,
    dataTransforms: input.dataTransforms?.filter((transform) => transform.id !== prior.transformId),
  };
}

function explicitBindingOccupiesRole(spec: ChartSpec, roleId: ChartEncodingChannel) {
  const binding = spec.roleBindings?.[roleId];
  if (binding) return binding.mode !== "derived";
  if (roleId === "series") return !!spec.series || !!spec.seriesFields?.length || !!spec.encodings.series;
  return !!spec.encodings[roleId];
}

/**
 * The single mutation compiler used by every multi-field editor. It validates
 * the exact selected columns against the block role and emits both canonical
 * role state and the temporary renderer projection at one boundary.
 */
/**
 * Compile one role selection against the immutable template specification.
 * This is the implementation used by ChartBlockTemplate; the wrapper above
 * remains only as a backwards-compatible boundary for older callers.
 */
export function updateChartRoleBindingForSpecification(
  specification: { roles: readonly BlockRoleSpecification[] },
  input: ChartSpec,
  dataset: Dataset,
  selection: RoleBindingSelection,
): RoleBindingMutationResult {
  const role = specification.roles.find((candidate) => candidate.id === selection.roleId) ?? null;
  if (!role) return { chartSpec: input, error: `Unknown role: ${selection.roleId}.` };
  const fields = Array.from(new Set(selection.fields));
  const availableColumns = [
    ...dataset.columns,
    ...(dataset.graph?.nodes.columns ?? []),
    ...(dataset.graph?.edges.columns ?? []),
  ];
  const columns = fields.flatMap((field) => {
    const column = availableColumns.find((candidate) => candidate.name === field);
    return column ? [column] : [];
  });
  if (columns.length !== fields.length) {
    return { chartSpec: input, error: "One or more selected fields are not present in this dataset." };
  }
  const incompatible = columns.find((column) => !isDataColumnTypeCompatible(role.accepts, column.type));
  if (incompatible) {
    return { chartSpec: input, error: `${incompatible.name} is not compatible with ${role.label}.` };
  }

  let spec = clearLegacyProjection(clearPriorDerivedBinding(input, selection.roleId), selection.roleId);
  const roleBindings = { ...spec.roleBindings };
  const encodings = { ...spec.encodings };
  const existingFoldId = foldTransformId(selection.roleId);
  let dataTransforms = (spec.dataTransforms ?? []).filter((transform) => transform.id !== existingFoldId);

  if (fields.length === 0) {
    delete roleBindings[selection.roleId];
    delete encodings[selection.roleId];
    return {
      chartSpec: {
        ...spec,
        roleBindings,
        encodings,
        dataTransforms: dataTransforms.length ? dataTransforms : undefined,
        scales: undefined,
        plotArea: undefined,
        renderer: undefined,
      },
    };
  }

  const mode = modeForSelection(role, { ...selection, fields });
  if (!mode) {
    return { chartSpec: input, error: `${role.label} does not allow this field selection mode.` };
  }
  const sourceEncodings: ChartEncoding[] = columns.map((column) => ({ field: column.name, type: column.type }));

  if (mode.kind === "field") {
    roleBindings[selection.roleId] = { mode: "field", fields: sourceEncodings };
    encodings[selection.roleId] = sourceEncodings[0];
    if (selection.roleId === "series") {
      spec.series = sourceEncodings[0];
      spec.seriesFields = sourceEncodings;
    }
  } else if (mode.kind === "repeat") {
    roleBindings[selection.roleId] = { mode: "field-set", materialization: "repeat", fields: sourceEncodings };
    encodings[selection.roleId] = sourceEncodings[0];
    // Temporary projection for renderers that have not yet consumed roleBindings.
    if (selection.roleId === "dimensions") spec.parallelFields = sourceEncodings;
  } else {
    const keyRoleId = mode.keyOutputRoleId as ChartEncodingChannel;
    const valueRoleId = mode.valueOutputRoleId as ChartEncodingChannel;
    if (explicitBindingOccupiesRole(spec, keyRoleId)) {
      return {
        chartSpec: input,
        error: `${role.label} fold would generate ${keyRoleId}, which already has an explicit binding.`,
      };
    }
    const outputs = foldOutputFields(selection.roleId);
    const transform: ChartFoldTransform = {
      id: existingFoldId,
      kind: "fold",
      sourceRoleId: selection.roleId,
      sourceFields: fields,
      keyOutputField: outputs.key,
      valueOutputField: outputs.value,
      lineage: { sourceFields: fields, operation: "fold" },
    };
    const keyEncoding: ChartEncoding = { field: outputs.key, type: "nominal" };
    const valueEncoding: ChartEncoding = { field: outputs.value, type: "quantitative" };
    const derivedBinding = (encoding: ChartEncoding): ChartRoleBinding => ({
      mode: "derived",
      materialization: "fold",
      transformId: transform.id,
      fields: [encoding],
    });
    roleBindings[keyRoleId] = derivedBinding(keyEncoding);
    roleBindings[valueRoleId] = derivedBinding(valueEncoding);
    encodings[keyRoleId] = keyEncoding;
    encodings[valueRoleId] = valueEncoding;
    dataTransforms = insertFoldTransform(dataTransforms, transform);
    if (keyRoleId === "series") {
      spec.series = keyEncoding;
      spec.seriesFields = [keyEncoding];
    }
  }

  return {
    chartSpec: {
      ...spec,
      defaultDataBinding: undefined,
      datasetId: dataset.id,
      roleBindings,
      encodings,
      dataTransforms: dataTransforms.length ? dataTransforms : undefined,
      scales: undefined,
      plotArea: undefined,
      renderer: undefined,
      dimensionDecisions: undefined,
      dimensionRecommendations: undefined,
    },
  };
}

/** Upgrade legacy role bindings at the render boundary without mutating saved state. */
export function adaptLegacyWideBindings(
  spec: ChartSpec,
  dataset: Dataset,
  specification: ChartBlockSpecification | null,
): ChartSpec {
  if (!specification) return spec;
  let adapted = spec;
  for (const role of specification.roles) {
    if (adapted.roleBindings?.[role.id as ChartEncodingChannel]) continue;
    const roleId = role.id as ChartEncodingChannel;
    const fields = roleBindingSelectedFields(adapted, roleId);
    const foldMode = role.bindingModes.find((mode) => mode.kind === "fold");
    const fieldMode = role.bindingModes.find((mode) => mode.kind === "field");
    const materialization = foldMode && fields.length >= foldMode.minFields
      ? "fold"
      : fieldMode && fields.length === 1
        ? "direct"
        : null;
    if (!materialization) continue;
    const result = updateChartRoleBindingForSpecification(specification, adapted, dataset, {
      roleId,
      fields,
      materialization,
    });
    if (!result.error) adapted = result.chartSpec;
  }
  return adapted;
}
