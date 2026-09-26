import { coreChartBlockTemplates } from "../utils/chartContracts";
import { geographicChartBlockTemplates } from "../utils/geographicLayerCards";
import { ChartBlockRegistry } from "./registryCore";

export const chartBlockRegistry = new ChartBlockRegistry();

[...coreChartBlockTemplates, ...geographicChartBlockTemplates]
  .forEach((template) => chartBlockRegistry.register(template));

export function getChartBlockTemplate(blockId: string) {
  return chartBlockRegistry.getById(blockId);
}

export function getChartBlockTemplateByChartType(chartType: string) {
  return chartBlockRegistry.getByChartType(chartType);
}

export function getChartBlockTemplateByCandidateId(candidateId: string) {
  return chartBlockRegistry.getByCandidateId(candidateId);
}

export function getChartBlockSpecification(chartType: string) {
  return getChartBlockTemplateByChartType(chartType)?.specification ?? null;
}

export function getChartBlockSpecifications() {
  return chartBlockRegistry.values().map((template) => template.specification);
}
