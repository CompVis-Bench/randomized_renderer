import type { ChartSpec, Dataset } from "../types";
import type {
  BlockValidationResult,
  ChartBlockFieldBinding,
  ChartBlockInstanceSpec,
  ChartBlockSpecification,
  TreeDirection,
} from "./model";
import { resolveBlockSurface } from "./spatial";
import { validateChartBlockInstance } from "./validation";
import {
  updateChartRoleBindingForSpecification,
  type RoleBindingMutationResult,
  type RoleBindingSelection,
} from "./bindings";

function bindingsFromLegacyChartSpec(spec: ChartSpec): Record<string, ChartBlockFieldBinding[]> {
  const result: Record<string, ChartBlockFieldBinding[]> = {};
  Object.entries(spec.roleBindings ?? {}).forEach(([roleId, binding]) => {
    if (!binding) return;
    result[roleId] = binding.fields.map((field) => ({
      field: field.field,
      declaredType: field.type,
    }));
  });
  Object.entries(spec.encodings).forEach(([roleId, encoding]) => {
    if (!encoding || result[roleId]) return;
    result[roleId] = [{ field: encoding.field, declaredType: encoding.type }];
  });
  if (spec.valueFields?.length) {
    result.y = spec.valueFields.map((encoding) => ({
      field: encoding.field,
      declaredType: encoding.type,
    }));
  }
  if (spec.angleFields?.length) {
    result.theta = spec.angleFields.map((encoding) => ({
      field: encoding.field,
      declaredType: encoding.type,
    }));
  }
  if (spec.seriesFields?.length) {
    result.series = spec.seriesFields.map((encoding) => ({
      field: encoding.field,
      declaredType: encoding.type,
    }));
  } else if (spec.series) {
    result.series = [{ field: spec.series.field, declaredType: spec.series.type }];
  }
  return result;
}

function legacyTreeDirection(spec: ChartSpec): TreeDirection | undefined {
  const value = spec.markGroups?.find((group) => group.role === "node")?.sharedConfig.treeDirection
    ?? spec.markGroups?.[0]?.sharedConfig.treeDirection;
  return value === "left" || value === "down" || value === "up" || value === "right"
    ? value
    : undefined;
}

/**
 * Runtime behavior for one immutable chart-block definition. Class instances
 * stay in the registry; authored state remains the plain JSON returned here.
 */
export abstract class ChartBlockTemplate<TDataContract = unknown> {
  abstract readonly specification: ChartBlockSpecification<TDataContract>;

  createInstance(datasetId: string): ChartBlockInstanceSpec {
    return {
      schemaVersion: 1,
      blockId: this.specification.id,
      blockRevision: this.specification.revision,
      datasetId,
      bindings: {},
      dataTransforms: [],
      coordinateState: {},
      appearance: {},
      options: {},
    };
  }

  /** Plain authored state created from this template's immutable definition. */
  createChartSpec(datasetId: string): ChartSpec {
    const instance = this.createInstance(datasetId);
    return {
      chartType: this.specification.chartType,
      blockId: instance.blockId,
      blockRevision: instance.blockRevision,
      datasetId: instance.datasetId,
      encodings: {},
      roleBindings: {},
      dataTransforms: [],
    };
  }

  configureRoleBinding(
    spec: ChartSpec,
    dataset: Dataset,
    selection: RoleBindingSelection,
  ): RoleBindingMutationResult {
    return updateChartRoleBindingForSpecification(this.specification, spec, dataset, selection);
  }

  validateChartSpec(spec: ChartSpec, dataset: Dataset): BlockValidationResult {
    return this.validate(this.fromLegacyChartSpec(spec), dataset);
  }

  validate(instance: ChartBlockInstanceSpec, dataset: Dataset): BlockValidationResult {
    return validateChartBlockInstance(this.specification, instance, dataset);
  }

  resolveSurface(spec?: ChartSpec | null) {
    return resolveBlockSurface(this.specification, spec);
  }

  fromLegacyChartSpec(spec: ChartSpec): ChartBlockInstanceSpec {
    return {
      schemaVersion: 1,
      blockId: this.specification.id,
      blockRevision: this.specification.revision,
      datasetId: spec.datasetId,
      bindings: bindingsFromLegacyChartSpec(spec),
      dataTransforms: [...(spec.dataTransforms ?? [])],
      coordinateState: {
        treeDirection: legacyTreeDirection(spec),
        axisSwapped: spec.axisSwapped,
        angleSpan: spec.polarArea?.angleSpan,
      },
      appearance: {
        axes: spec.axes,
        styleTokens: spec.styleTokens,
        markGroups: spec.markGroups,
      },
      options: {},
    };
  }
}

export class DeclarativeChartBlockTemplate<TDataContract = unknown> extends ChartBlockTemplate<TDataContract> {
  constructor(readonly specification: ChartBlockSpecification<TDataContract>) {
    super();
  }
}
