import type { ChartSpec } from "../types";
import type {
  AxisBoundary,
  ChartBlockSpecification,
  DropAreaSpecification,
  ReferencePlacement,
  ResolvedBlockSurface,
  ResolvedSpatialReference,
  TreeDirection,
} from "./model";

export function treeDirectionFromChartSpec(spec: ChartSpec | null | undefined): TreeDirection {
  const value = spec?.markGroups?.find((group) => group.role === "node")?.sharedConfig.treeDirection
    ?? spec?.markGroups?.[0]?.sharedConfig.treeDirection;
  return value === "left" || value === "down" || value === "up" ? value : "right";
}

function resolvedPlacement(
  reference: ChartBlockSpecification["spatialReferences"][number],
  direction: TreeDirection,
): ReferencePlacement | null {
  return reference.placementByTreeDirection?.[direction] ?? reference.placement ?? null;
}

export function resolveBlockSurface(
  specification: ChartBlockSpecification,
  chartSpec?: ChartSpec | null,
): ResolvedBlockSurface {
  const direction = treeDirectionFromChartSpec(chartSpec);
  const references = specification.spatialReferences.flatMap((reference): ResolvedSpatialReference[] => {
    const placement = resolvedPlacement(reference, direction);
    return placement ? [{ ...reference, placement }] : [];
  });
  const referenceIds = new Set(references.map((reference) => reference.id));
  const dropAreas = specification.composition.dropAreas.filter((area) =>
    (!area.treeDirections || area.treeDirections.includes(direction))
    && area.sharedReferenceIds.every((referenceId) => referenceIds.has(referenceId)));
  return {
    blockId: specification.id,
    coordinateSystem: specification.coordinateSystem,
    references,
    dropAreas,
  };
}

export function resolvedReferenceChannel(
  specification: ChartBlockSpecification,
  referenceId: string,
  chartSpec?: ChartSpec | null,
) {
  return resolveBlockSurface(specification, chartSpec).references
    .find((reference) => reference.id === referenceId)?.placement.channel;
}

export function blockAllowsDropArea(
  specification: ChartBlockSpecification,
  chartSpec: ChartSpec | null | undefined,
  operation: DropAreaSpecification["operation"],
  boundary?: AxisBoundary,
) {
  return resolveBlockSurface(specification, chartSpec).dropAreas.some((area) => {
    if (area.operation !== operation) return false;
    if (!boundary) return true;
    if (area.geometry.kind === "outside-annulus" || area.geometry.kind === "outside-angular-band") {
      return area.geometry.boundary === boundary;
    }
    if (area.geometry.kind !== "outside-edge-band") return false;
    return area.geometry.boundary === boundary;
  });
}
