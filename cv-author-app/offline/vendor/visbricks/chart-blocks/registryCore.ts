import type { ChartBlockTemplate } from "./ChartBlockTemplate";

export class ChartBlockRegistry {
  private readonly byId = new Map<string, ChartBlockTemplate>();
  private readonly byChartType = new Map<string, ChartBlockTemplate>();
  private readonly byCandidateId = new Map<string, ChartBlockTemplate>();

  register(template: ChartBlockTemplate) {
    const { specification } = template;
    validateSpecification(specification);
    if (this.byId.has(specification.id)) {
      throw new Error(`Duplicate chart block id: ${specification.id}`);
    }
    this.byId.set(specification.id, template);
    if (this.byCandidateId.has(specification.catalog.candidateId)) {
      throw new Error(`Duplicate chart block candidate id: ${specification.catalog.candidateId}`);
    }
    this.byCandidateId.set(specification.catalog.candidateId, template);
    [specification.chartType, ...specification.aliases].forEach((name) => {
      const normalized = normalizeBlockName(name);
      const existing = this.byChartType.get(normalized);
      if (existing && existing !== template) {
        throw new Error(`Duplicate chart block alias: ${name}`);
      }
      this.byChartType.set(normalized, template);
    });
    return template;
  }

  getById(id: string) {
    return this.byId.get(id) ?? null;
  }

  getByChartType(chartType: string) {
    return this.byChartType.get(normalizeBlockName(chartType)) ?? null;
  }

  getByCandidateId(candidateId: string) {
    return this.byCandidateId.get(candidateId) ?? null;
  }

  values() {
    return [...this.byId.values()];
  }
}

function validateSpecification(specification: ChartBlockTemplate["specification"]) {
  if (!specification.id || !specification.chartType || !specification.renderer.key || !specification.families.length) {
    throw new Error(`Incomplete chart block specification: ${specification.id || specification.chartType}`);
  }
  const unique = (values: readonly string[], kind: string) => {
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${kind} in ${specification.id}`);
  };
  const roleIds = specification.roles.map((role) => role.id);
  const referenceIds = specification.spatialReferences.map((reference) => reference.id);
  const targetIds = specification.structuralTargets.map((target) => target.id);
  unique(roleIds, "role id");
  unique(referenceIds, "spatial reference id");
  unique(targetIds, "structural target id");
  specification.roles.forEach((role) => {
    if (!role.bindingModes.length) throw new Error(`Role ${role.id} has no binding mode in ${specification.id}`);
    role.bindingModes.forEach((mode) => {
      if (mode.minFields < 0 || mode.maxFields < mode.minFields) {
        throw new Error(`Invalid ${mode.kind} cardinality for ${role.id} in ${specification.id}`);
      }
      if (mode.kind !== "fold") return;
      if (!roleIds.includes(mode.keyOutputRoleId) || !roleIds.includes(mode.valueOutputRoleId)) {
        throw new Error(`Unknown fold output role for ${role.id} in ${specification.id}`);
      }
    });
  });
  specification.spatialReferences.forEach((reference) => reference.roleIds?.forEach((roleId) => {
    if (!roleIds.includes(roleId)) throw new Error(`Unknown role ${roleId} in ${specification.id}`);
  }));
  specification.structuralTargets.forEach((target) => {
    if (!referenceIds.includes(target.anchorReferenceId)) {
      throw new Error(`Unknown anchor reference ${target.anchorReferenceId} in ${specification.id}`);
    }
    target.contextRoleIds.forEach((roleId) => {
      if (!roleIds.includes(roleId)) throw new Error(`Unknown target context role ${roleId} in ${specification.id}`);
    });
  });
  specification.composition.dropAreas.forEach((area) => {
    area.sharedReferenceIds.forEach((referenceId) => {
      if (!referenceIds.includes(referenceId)) throw new Error(`Unknown drop reference ${referenceId} in ${specification.id}`);
    });
    if (area.geometry.kind === "structural-target" && !targetIds.includes(area.geometry.targetId)) {
      throw new Error(`Unknown drop target ${area.geometry.targetId} in ${specification.id}`);
    }
  });
}

export function normalizeBlockName(value: string) {
  return value.replace(/[\s_-]/g, "").toLowerCase();
}
