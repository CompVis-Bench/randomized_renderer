export const asNode = (value) => typeof value === 'string' ? { type: 'chart', chart: value } : value;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const keys = (node, allowed) => {
  for (const key of Object.keys(node)) assert(allowed.includes(key), `${node.type}: unknown property ${key}`);
};

export function leafIds(input) {
  const node = asNode(input);
  if (node.type === 'chart') return [node.chart];
  if (node.type === 'linked') return [...leafIds(node.child), ...node.links.flatMap(leafIds)];
  if (node.type === 'network') return [node.nodes, node.links];
  if (node.type === 'layer') return node.children;
  if (node.type === 'concat') return node.children.flatMap(leafIds);
  if (node.type === 'facet') return leafIds(node.child);
  if (node.type === 'nested') return [...leafIds(node.parent), ...leafIds(node.child)];
  throw new Error(`Unsupported composition type: ${node.type}`);
}

export function validateComposition(input, chartIds, datasetIds, depth = 0) {
  const node = asNode(input);
  assert(depth < 12 && object(node), 'Composition must be an object with depth < 12');
  const descend = (child) => validateComposition(child, chartIds, datasetIds, depth + 1);
  if (node.type === 'chart') {
    keys(node, ['type', 'chart']);
    assert(chartIds.has(node.chart), `Unknown chart in composition: ${node.chart}`);
  } else if (node.type === 'linked') {
    keys(node, ['type','child','links']);
    assert(Array.isArray(node.links) && node.links.length > 0, 'linked requires link subtrees');
    descend(node.child); node.links.forEach(descend);
  } else if (node.type === 'network') {
    keys(node, ['type','nodes','links']);
    assert(chartIds.has(node.nodes) && chartIds.has(node.links) && node.nodes !== node.links, 'Network requires distinct node and link chart references');
  } else if (node.type === 'layer') {
    keys(node, ['type','children']);
    assert(Array.isArray(node.children) && node.children.length >= 2 && node.children.every(id=>chartIds.has(id)), 'Layer requires chart IDs');
  } else if (node.type === 'concat') {
    keys(node, ['type', 'direction', 'gap', 'children', 'radialBoundaries', 'angleOffset', 'angleSpan', 'innerRadiusRatio', 'weights', 'alignment']);
    if(node.alignment !== undefined) { const a=node.alignment; assert(a && typeof a.field==='string' && ['x','y','theta'].includes(a.axis) && ['category','number'].includes(a.kind) && Array.isArray(a.domain) && a.domain.length>=2, 'Invalid position alignment'); assert(node.direction===({x:'vertical',y:'horizontal',theta:'radial'})[a.axis], 'Alignment direction disagrees with shared axis'); }
    if(node.weights !== undefined) assert(['horizontal','vertical'].includes(node.direction) && Array.isArray(node.weights) && node.weights.length===node.children.length && node.weights.every(v=>Number.isFinite(v)&&v>0), 'concat weights must be positive and match children');
    assert(['horizontal', 'vertical', 'radial', 'angular'].includes(node.direction), 'Unknown concat direction');
    assert(Array.isArray(node.children) && node.children.length >= 2, 'concat requires at least two children');
    node.children.forEach(descend);
    if (node.radialBoundaries !== undefined) {
      assert(node.direction === 'radial' && Array.isArray(node.radialBoundaries)
        && node.radialBoundaries.length === node.children.length + 1
        && node.radialBoundaries.at(-1) === 1
        && node.radialBoundaries.every((value, i, values) => Number.isFinite(value) && value >= 0 && value <= 1 && (i === 0 || value - values[i - 1] >= 0.03)),
      'radialBoundaries must have n+1 ascending entries, bands >= 0.03 and end at 1');
    }
  } else if (node.type === 'facet') {
    keys(node, ['type', 'field', 'datasetId', 'columns', 'gap', 'labelHeight', 'child', 'coordinateSystem', 'direction', 'angleOffset', 'angleSpan', 'innerRadiusRatio', 'flow', 'wrap', 'border', 'budgetReflow']);
    assert(datasetIds.has(node.datasetId) && typeof node.field === 'string', 'facet requires datasetId and field');
    assert(node.labelHeight === undefined || (Number.isFinite(node.labelHeight) && node.labelHeight >= 12 && node.labelHeight <= 48), 'facet.labelHeight must be in [12, 48]');
    assert(node.columns === undefined || (Number.isInteger(node.columns) && node.columns > 0), 'facet.columns must be positive');
    assert(node.coordinateSystem === undefined || ['Cartesian', 'Polar'].includes(node.coordinateSystem), 'Invalid facet coordinateSystem');
    if (node.coordinateSystem === 'Polar') assert(['radial', 'angular'].includes(node.direction), 'Polar facet requires radial or angular direction');
    else assert(node.direction === undefined, 'Cartesian facet uses columns, not direction');
    descend(node.child);
  } else if (node.type === 'nested') {
    keys(node, ['type', 'parent', 'child', 'anchorChart', 'parentVisible', 'size', 'width', 'height', 'offsetX', 'offsetY', 'childAxes']);
    descend(node.parent);
    descend(node.child);
    const parentIds = leafIds(node.parent);
    const childIds = leafIds(node.child);
    assert(!childIds.some((id) => parentIds.includes(id)), 'Nested parent and child must reference distinct charts');
    const anchor = node.anchorChart ?? (parentIds.length === 1 ? parentIds[0] : null);
    assert(anchor && parentIds.includes(anchor), 'Composite parent requires anchorChart belonging to the parent');
    for (const key of ['size', 'width', 'height']) assert(node[key] === undefined || (Number.isFinite(node[key]) && node[key] >= 16 && node[key] <= 1200), `nested.${key} must be in [16, 1200]`);
    for (const key of ['offsetX', 'offsetY']) assert(node[key] === undefined || Number.isFinite(node[key]), `nested.${key} must be finite`);
    for (const key of ['parentVisible', 'childAxes']) assert(node[key] === undefined || typeof node[key] === 'boolean', `nested.${key} must be boolean`);
    if (!node.parentVisible) assert(asNode(node.parent).type === 'chart', 'Hidden parent must be a single layout scaffold');
  } else throw new Error(`Unsupported composition type: ${node.type}`);
  assert(node.gap === undefined || (Number.isFinite(node.gap) && node.gap >= 0), 'composition gap must be nonnegative');
  assert(node.angleOffset === undefined || Number.isFinite(node.angleOffset), 'angleOffset must be finite');
  assert(node.angleSpan === undefined || (Number.isFinite(node.angleSpan) && node.angleSpan > 0 && node.angleSpan <= 360), 'angleSpan must be in (0, 360]');
  assert(node.innerRadiusRatio === undefined || (Number.isFinite(node.innerRadiusRatio) && node.innerRadiusRatio >= 0 && node.innerRadiusRatio < 0.95), 'innerRadiusRatio must be in [0, 0.95)');
}

export function anchorFields(spec) {
  if(spec.chartType === 'OfflineBasisIdiom') {
    assert(spec.offlineAnchorFields?.length, 'Basis nested parent needs position bindings');
    return spec.offlineAnchorFields;
  }
  if(spec.chartType === 'Dendrogram') return spec.offlineAnchorFields;
  if(spec.chartType === 'ScatterplotLayer') return [spec.encodings.x.field,spec.encodings.y.field];
  assert(['Scatterplot', 'SingleBarChart'].includes(spec.chartType), `Nested anchors currently support Scatterplot and SingleBarChart, not ${spec.chartType}`);
  const fields = [spec.encodings.x?.field, spec.encodings.y?.field];
  assert(fields.every(Boolean), 'Nested anchor requires X and Y bindings');
  return [...new Set(fields)];
}
