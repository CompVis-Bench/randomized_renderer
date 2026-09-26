import type { SvgCandidate } from "../types";
import { DeclarativeChartBlockTemplate } from "../chart-blocks/ChartBlockTemplate";
import type { ChartBlockSpecification } from "../chart-blocks/model";

export const deckglLightMapStyleUrl = "mapbox://styles/shifuchen/cmtmopiqi00eo01sn25fq6efl";
export const deckglDarkMapStyleUrl = "mapbox://styles/shifuchen/clhswk0lv000y01pgc15v0wfv";

export type GeographicTemplateFamily = "point" | "line" | "area";

export type GeographicBlockDataContract = {
  geometryJoin: {
    required: true;
    geometrySource: "geojson-feature-id";
    rowFieldRoleId: "key";
  };
  optionalRoles: readonly ["color", "size"];
};

const geographicLayerFamilies: Record<string, GeographicTemplateFamily> = {
  ArcLayer: "line",
  BitmapLayer: "area",
  ColumnLayer: "point",
  ContourLayer: "area",
  GeoJsonLayer: "area",
  GridCellLayer: "area",
  GridLayer: "area",
  HeatmapLayer: "area",
  HexagonLayer: "area",
  IconLayer: "point",
  LineLayer: "line",
  MVTLayer: "area",
  PathLayer: "line",
  PointCloudLayer: "point",
  PolygonLayer: "area",
  ScatterplotLayer: "point",
  ScreenGridLayer: "area",
  TerrainLayer: "area",
  TileLayer: "area",
  TripsLayer: "line",
  GreatCircleLayer: "line",
  TextLayer: "point",
  SolidPolygonLayer: "area",
  SimpleMeshLayer: "point",
  ScenegraphLayer: "point",
};

export function getGeographicLayerFamily(layerType: string): GeographicTemplateFamily {
  return geographicLayerFamilies[layerType] ?? "point";
}

/** Uniform PNG screenshots generated from the app's Mapbox + deck.gl renderer. */
const deckglExampleImageSlugs: Record<string, string> = {
  ArcLayer: "arc-layer.png",
  BitmapLayer: "bitmap-layer.png",
  ColumnLayer: "column-layer.png",
  ContourLayer: "contour-layer.png",
  GeoJsonLayer: "geojson-layer.png",
  GridCellLayer: "grid-cell-layer.png",
  GridLayer: "grid-layer.png",
  HeatmapLayer: "heatmap-layer.png",
  HexagonLayer: "hexagon-layer.png",
  IconLayer: "icon-layer.png",
  LineLayer: "line-layer.png",
  MVTLayer: "mvt-layer.png",
  PathLayer: "path-layer.png",
  PointCloudLayer: "point-cloud-layer.png",
  PolygonLayer: "polygon-layer.png",
  ScatterplotLayer: "scatterplot-layer.png",
  ScreenGridLayer: "screen-grid-layer.png",
  TerrainLayer: "terrain-layer.png",
  TileLayer: "tile-layer.png",
  TripsLayer: "trips-layer.png",
  GreatCircleLayer: "great-circle-layer.png",
  TextLayer: "text-layer.png",
  SolidPolygonLayer: "solid-polygon-layer.png",
  SimpleMeshLayer: "simple-mesh-layer.png",
  ScenegraphLayer: "scenegraph-layer.png",
};

export function deckglExampleImageUrl(layerType: string) {
  const slug = deckglExampleImageSlugs[layerType];
  return `/deckgl-examples/${slug ?? "scatterplot-layer.png"}?v=20260904-2`;
}

export const geographicLayerTypes = [
  "ArcLayer",
  "BitmapLayer",
  "ColumnLayer",
  "ContourLayer",
  "GeoJsonLayer",
  "GridCellLayer",
  "GridLayer",
  "HeatmapLayer",
  "HexagonLayer",
  "IconLayer",
  "LineLayer",
  "MVTLayer",
  "PathLayer",
  "PointCloudLayer",
  "PolygonLayer",
  "ScatterplotLayer",
  "ScreenGridLayer",
  "TerrainLayer",
  "TileLayer",
  "TripsLayer",
  "GreatCircleLayer",
  "TextLayer",
  "SolidPolygonLayer",
  "SimpleMeshLayer",
  "ScenegraphLayer",
] as const;

function geographicBlockSpecification(layerType: (typeof geographicLayerTypes)[number]): ChartBlockSpecification<GeographicBlockDataContract> {
  const family = getGeographicLayerFamily(layerType);
  return {
    schemaVersion: 1,
    id: `chart-block:deckgl:${layerType}`,
    revision: 1,
    chartType: layerType,
    aliases: [],
    label: layerType,
    families: [`geographic-${family}`],
    dataShape: "geographic",
    data: {
      geometryJoin: { required: true, geometrySource: "geojson-feature-id", rowFieldRoleId: "key" },
      optionalRoles: ["color", "size"],
    },
    roles: [
      { id: "key", label: "GeoJSON ID", kind: "identity", channel: "key", required: true, accepts: ["nominal", "ordinal", "quantitative"], minFields: 1, maxFields: 1, bindingModes: [{ kind: "field", minFields: 1, maxFields: 1 }], editor: { label: "GeoJSON ID", emptyLabel: "Not bound", configurable: true } },
      { id: "color", label: "Color", kind: "style", channel: "color", required: false, accepts: ["nominal", "ordinal", "quantitative"], minFields: 0, maxFields: 1, bindingModes: [{ kind: "field", minFields: 0, maxFields: 1 }], editor: { label: "Color", emptyLabel: "Static", configurable: true } },
      { id: "size", label: "Size", kind: "style", channel: "size", required: false, accepts: ["quantitative"], minFields: 0, maxFields: 1, bindingModes: [{ kind: "field", minFields: 0, maxFields: 1 }], editor: { label: "Size", emptyLabel: "Static", configurable: true } },
    ],
    coordinateSystem: "Geographic",
    spatialReferences: [
      {
        id: "geo-projection",
        kind: "geographic-projection",
        semantic: "projection",
        exposure: "internal",
        compatibility: "geographic-projection",
        roleIds: ["key"],
        placement: { channel: "geographic" },
        domainResolver: { kind: "geographic-projection" },
        presentation: { baseline: "none", ticks: "none", labels: "none" },
      },
      {
        id: "feature-anchors",
        kind: "anchor-set",
        semantic: "mark-anchor",
        exposure: "internal",
        compatibility: "geographic-projection",
        roleIds: ["key"],
        placement: { channel: "anchor" },
      },
    ],
    structuralTargets: [{ id: "features", markRole: family, repeated: true, contextRoleIds: ["key"], anchorReferenceId: "feature-anchors" }],
    composition: {
      layer: { enabled: true },
      concat: { enabled: false },
      facet: { enabled: false },
      nested: { asParent: family === "point", asChild: true },
      capabilities: ["deckgl-layer-stack", "geojson-id-join"],
      dropAreas: [
        { id: "layer-body", operation: "layer", geometry: { kind: "body-inset", insetPx: 10 }, sharedReferenceIds: [], exclusiveGroup: "composition" },
        { id: "nested-feature", operation: "nested", geometry: { kind: "structural-target", targetId: "features" }, sharedReferenceIds: [], exclusiveGroup: "nested" },
        { id: "enter", operation: "enter", geometry: { kind: "enter-portal", maximumDiameterPx: 72 }, sharedReferenceIds: [], exclusiveGroup: "navigation" },
      ],
    },
    renderer: { kind: "deckgl", key: layerType, version: 1 },
    catalog: {
      candidateId: `deckgl-layer:${layerType}`,
      label: layerType,
      previewKey: layerType,
      defaultSize: { width: 480, height: 270 },
    },
  };
}

export const geographicChartBlockTemplates = geographicLayerTypes
  .map((layerType) => new DeclarativeChartBlockTemplate(geographicBlockSpecification(layerType)));

export const geographicChartBlockSpecifications = geographicChartBlockTemplates
  .map((template) => template.specification);

export const geographicLayerDefinitions: SvgCandidate[] = geographicChartBlockSpecifications.map((specification) => {
  const layerType = specification.chartType;
  const canvasPlaceholder = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="transparent"/></svg>`;
  return {
    id: specification.catalog.candidateId,
    name: specification.catalog.label,
    chartType: layerType,
    coordinateSystem: specification.coordinateSystem,
    // The catalog uses the generated screenshot. The transparent SVG remains
    // only as the geometry placeholder required by the canvas node model.
    src: deckglExampleImageUrl(layerType),
    // The visible canvas map is rendered by Mapbox + deck.gl. This markup is
    // only a transparent geometry placeholder for the existing CanvasNode model.
    svgMarkup: canvasPlaceholder,
    library: "deck.gl",
    layerType,
    // Start geographic templates with the neutral light basemap. Users can
    // switch to the dark basemap from the encoding inspector.
    mapStyleUrl: deckglLightMapStyleUrl,
    renderMode: "static-layer",
    defaultWidth: specification.catalog.defaultSize.width,
  } satisfies SvgCandidate;
});
