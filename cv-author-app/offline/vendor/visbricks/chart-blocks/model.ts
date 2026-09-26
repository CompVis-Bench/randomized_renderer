import type {
  ChartDataTransform,
  ChartEncodingChannel,
  ChartSpec,
  CoordinateChannel,
  CoordinateSystem,
  DataColumnType,
  Dataset,
} from "../types";

export type BlockFamilyId =
  | "barchart"
  | "areachart"
  | "point"
  | "linechart"
  | "radar"
  | "heatmap"
  | "arc"
  | "tree"
  | "network"
  | "chord"
  | "sankey"
  | "calendar"
  | "boxplot"
  | "wordcloud"
  | "geographic-point"
  | "geographic-line"
  | "geographic-area";

export type BlockDataShape = "tabular" | "hierarchy" | "graph" | "geographic";

export type RoleBindingModeSpecification =
  | {
    kind: "field";
    minFields: 0 | 1;
    maxFields: 1;
  }
  | {
    kind: "fold";
    minFields: number;
    maxFields: number;
    keyOutputRoleId: string;
    valueOutputRoleId: string;
    /** Renderer-neutral hint for presenting the generated key/value series. */
    presentation?: "series" | "grouped-series" | "stacked-series";
  }
  | {
    kind: "repeat";
    minFields: number;
    maxFields: number;
  };

export type BlockRoleSpecification = {
  id: string;
  label: string;
  kind: "dimension" | "measure" | "series" | "style" | "identity";
  channel: ChartEncodingChannel;
  required: boolean;
  accepts: readonly DataColumnType[];
  minFields: number;
  maxFields: number;
  bindingModes: readonly RoleBindingModeSpecification[];
  editor: {
    label: string;
    emptyLabel: "Not bound" | "Static";
    configurable: boolean;
    categoricalExclusive?: boolean;
  };
  requiresPartition?: boolean;
  minCardinality?: number;
  maxCardinality?: number;
};

export type AxisBoundary = "left" | "right" | "top" | "bottom" | "inner" | "outer" | "start" | "end";
export type TreeDirection = "right" | "left" | "down" | "up";

export type ReferencePlacement = {
  channel: CoordinateChannel | "geographic" | "anchor";
  boundary?: AxisBoundary;
  concatDirection?: "horizontal" | "vertical" | "radial" | "angular";
  concatPosition?: "before" | "after";
};

export type SpatialReferenceSpecification = {
  id: string;
  kind: "axis" | "derived-axis" | "geographic-projection" | "anchor-set" | "inherited";
  semantic: "position" | "tree-leaf" | "hierarchy-depth" | "mark-anchor" | "projection" | "inherited-position";
  exposure: "external" | "internal" | "conditional";
  compatibility:
    | "categorical-exact"
    | "quantitative-structural"
    | "type-exact"
    | "tree-leaf-domain"
    | "hierarchy-depth"
    | "geographic-projection"
    | "inherited-position";
  roleIds?: readonly string[];
  placement?: ReferencePlacement;
  placementByTreeDirection?: Readonly<Record<TreeDirection, ReferencePlacement>>;
  domainResolver?:
    | { kind: "encoding"; roleId: string }
    | { kind: "terminal-leaves"; keyRoleId: string; parentRoleId: string; orderRoleIds: readonly string[] }
    | { kind: "hierarchy-depth"; keyRoleId: string; parentRoleId: string }
    | { kind: "geographic-projection" }
    | { kind: "inherited-position" };
  presentation?: {
    baseline: "axis" | "none";
    ticks: "scale" | "terminal-node-centers" | "none";
    labels: "scale" | "terminal-node-labels" | "none";
  };
  conditionalPartnerCapability?: string;
};

export type DropAreaGeometrySpecification =
  | { kind: "body-inset"; insetPx: number }
  | {
    kind: "outside-edge-band";
    referenceId: string;
    boundary: "left" | "right" | "top" | "bottom";
    gapPx: number;
    minimumThicknessPx: number;
    maximumFraction: number;
  }
  | {
    kind: "outside-annulus";
    referenceId: string;
    boundary: "inner" | "outer";
    gapPx: number;
    minimumThicknessPx: number;
    maximumFraction: number;
  }
  | {
    kind: "outside-angular-band";
    referenceId: string;
    boundary: "start" | "end";
    gapPx: number;
    minimumThicknessPx: number;
    maximumAngle: number;
  }
  | { kind: "enter-portal"; maximumDiameterPx: number }
  | { kind: "structural-target"; targetId: string };

export type DropAreaSpecification = {
  id: string;
  operation: "layer" | "concat" | "nested" | "enter";
  geometry: DropAreaGeometrySpecification;
  sharedReferenceIds: readonly string[];
  exclusiveGroup: "composition" | "navigation" | "nested";
  treeDirections?: readonly TreeDirection[];
  requiresPartnerCapability?: string;
};

export type StructuralTargetSpecification = {
  id: string;
  markRole: string;
  parentTargetId?: string;
  repeated: boolean;
  contextRoleIds: readonly string[];
  anchorReferenceId: string;
};

export type BlockCompositionSpecification = {
  layer: { enabled: boolean };
  concat: { enabled: boolean };
  facet: { enabled: boolean };
  nested: { asParent: boolean; asChild: boolean };
  capabilities: readonly string[];
  dropAreas: readonly DropAreaSpecification[];
};

export type BlockCatalogSpecification = {
  candidateId: string;
  label: string;
  previewKey: string;
  defaultSize: { width: number; height: number };
  familyOrder?: Partial<Record<BlockFamilyId, number>>;
  hidden?: boolean;
  unavailable?: boolean;
};

export type SeriesPresentationSpecification = {
  roleId: "series";
  layout: "single" | "grouped" | "stacked" | "line" | "area" | "radar";
  legend: boolean;
  itemProperties: readonly ("color" | "lineStyle" | "strokeWidth")[];
};

export type ChartBlockSpecification<TDataContract = unknown> = {
  schemaVersion: 1;
  id: string;
  revision: number;
  chartType: string;
  aliases: readonly string[];
  label: string;
  families: readonly BlockFamilyId[];
  dataShape: BlockDataShape;
  data: TDataContract;
  roles: readonly BlockRoleSpecification[];
  seriesPresentation?: SeriesPresentationSpecification;
  coordinateSystem: CoordinateSystem;
  spatialReferences: readonly SpatialReferenceSpecification[];
  structuralTargets: readonly StructuralTargetSpecification[];
  composition: BlockCompositionSpecification;
  renderer: {
    kind: "svg" | "deckgl";
    key: string;
    version: number;
  };
  catalog: BlockCatalogSpecification;
};

export type ChartBlockFieldBinding = {
  table?: "rows" | "nodes" | "edges";
  field: string;
  declaredType: DataColumnType;
  aggregation?: "sum" | "mean" | "count";
};

export type ChartBlockInstanceSpec = {
  schemaVersion: 1;
  blockId: string;
  blockRevision: number;
  datasetId: string;
  bindings: Record<string, ChartBlockFieldBinding[]>;
  dataTransforms: ChartDataTransform[];
  coordinateState: {
    treeDirection?: TreeDirection;
    axisSwapped?: boolean;
    angleSpan?: number;
    angleOffset?: number;
    innerRadiusRatio?: number;
    outerRadiusRatio?: number;
  };
  appearance: {
    axes?: ChartSpec["axes"];
    styleTokens?: ChartSpec["styleTokens"];
    markGroups?: ChartSpec["markGroups"];
  };
  options: Record<string, unknown>;
};

export type BlockValidationStatus =
  | "VALID"
  | "DIMENSION_OVERFLOW"
  | "DIMENSION_UNDERFLOW"
  | "TYPE_MISMATCH"
  | "UNRESOLVABLE";

export type BlockValidationResult = {
  status: BlockValidationStatus;
  issues: string[];
};

export type ResolvedSpatialReference = SpatialReferenceSpecification & {
  placement: ReferencePlacement;
  domain?: readonly string[] | readonly number[] | [number, number];
};

export type ResolvedBlockSurface = {
  blockId: string;
  coordinateSystem: CoordinateSystem;
  references: ResolvedSpatialReference[];
  dropAreas: readonly DropAreaSpecification[];
};

export type ChartBlockValidationInput = {
  instance: ChartBlockInstanceSpec;
  dataset: Dataset;
};
