import type { ChartAxisChannel, ChartSpec, CoordinateGuide } from "../types";

function defaultAxisVisibility(spec: ChartSpec | null | undefined, channel: ChartAxisChannel) {
  const normalized = spec?.chartType.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized === "chord" && (channel === "theta" || channel === "radius")) return false;
  return true;
}

function legacyAxisVisibility(guide: CoordinateGuide | null | undefined, channel: ChartAxisChannel) {
  if (guide?.type === "Cartesian") {
    if (channel === "x") return guide.showXLine;
    if (channel === "y") return guide.showYLine;
  }
  if (guide?.type === "Polar") {
    if (channel === "theta") return guide.showThetaLine;
    if (channel === "radius") return guide.showRadiusLine;
  }
  return undefined;
}

function legacyLabelVisibility(guide: CoordinateGuide | null | undefined, channel: ChartAxisChannel) {
  if (guide?.type === "Cartesian") {
    if (channel === "x") return guide.showXLabels;
    if (channel === "y") return guide.showYLabels;
  }
  if (guide?.type === "Polar" && (channel === "theta" || channel === "radius")) {
    return guide.showDiscreteLabels;
  }
  return undefined;
}

export function chartAxisVisible(
  spec: ChartSpec | null | undefined,
  guide: CoordinateGuide | null | undefined,
  channel: ChartAxisChannel,
) {
  const config = spec?.axes?.[channel];
  return config?.visible
    ?? legacyAxisVisibility(guide, channel)
    ?? defaultAxisVisibility(spec, channel);
}

export function chartAxisLabelsVisible(
  spec: ChartSpec | null | undefined,
  guide: CoordinateGuide | null | undefined,
  channel: ChartAxisChannel,
) {
  const config = spec?.axes?.[channel];
  return config?.labelsVisible
    ?? legacyLabelVisibility(guide, channel)
    ?? defaultAxisVisibility(spec, channel);
}
