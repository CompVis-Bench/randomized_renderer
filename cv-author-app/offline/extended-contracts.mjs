// Explicit v3 contracts for structural, graph, parallel, and geographic charts.
const assert = (ok, message) => { if (!ok) throw new Error(message); };
export function compileExtended(target, config, plan) {
  const kind = target.variation;
  const force = kind === 'point' && config.chartType === 'ForceDirectedGraph';
  if (!force && !['tree', 'dendrogram', 'treemap', 'sunburst', 'parallel_coordinates', 'geo_point', 'geo_area', 'link'].includes(kind)) return null;
  const source = plan.datasets.find(d => d.id === config.datasetId);
  assert(source, `${target.chart_id}: missing dataset`);
  const fields = new Map(source.columns.map(c => [c.name, c.type]));
  const binding = field => { assert(fields.has(field), `Unknown structural field ${field}`); return {field, type: fields.get(field)}; };
  const e = target.encodings;
  const allowed = force ? ['color', 'size'] : kind === 'link' ? [] : kind === 'treemap' ? ['size', 'color'] : kind === 'sunburst' ? ['position.theta','position.radius','color'] : ['position.x','position.y','color', ...(['geo_point'].includes(kind) ? ['size','shape'] : [])];
  for (const [channel, field] of Object.entries(e)) {
    assert(allowed.includes(channel), `${target.chart_id}: unsupported channel ${channel}`);
    assert(/^F[1-9]\d*$/.test(field) && fields.has(field), `${target.chart_id}: unknown field ${field}`);
  }
  for (const field of target.repetition_position) assert(fields.has(field), `Missing repetition field ${field}`);
  const encodings = {};
  for (const channel of ['color','size','shape']) if (e[channel]) encodings[channel] = binding(e[channel]);
  const chart = { id: target.chart_id, spec: { chartType: config.chartType, datasetId: source.id, encodings } };
  if (force) {
    assert(config.graph && plan.datasets.some(d => d.id === config.graph.edges), 'Force graph requires an edge table');
    encodings.key = binding(config.graph.key);
    const edges = plan.datasets.find(d => d.id === config.graph.edges);
    for (const channel of ['source','target']) {
      const field = config.graph[channel];
      assert(edges.columns.some(c => c.name === field), `Missing graph ${channel}`);
      encodings[channel] = {field,type:'nominal'};
    }
    chart.graph = structuredClone(config.graph);
    chart.spec.markGroups = [{id:`${chart.id}-nodes`,role:'node',sharedConfig:{size:9,nodeLabelsVisible:false,linkDistance:95,chargeStrength:-320}},{id:`${chart.id}-links`,role:'link',sharedConfig:{width:1.5,opacity:0.6}}];
  } else if (kind === 'link') {
    assert(Object.keys(e).length === 0 && target.link_targets?.length === 1, 'Only unencoded single-network links are supported');
    assert(config.nodeChart === target.link_targets[0], 'link_targets must match the constructed network');
    assert(plan.charts.find(c=>c.id===config.nodeChart)?.chartType === 'ForceDirectedGraph', 'Links require a ForceDirectedGraph node target');
    chart.spec.chartType = 'OfflineGraphLinks'; chart.nodeChart = config.nodeChart;
  } else if (['tree','dendrogram','treemap','sunburst'].includes(kind)) {
    const h = config.hierarchy;
    assert(h, 'Hierarchy requires explicit key/parent construction bindings');
    encodings.key = binding(h.key); encodings.parent = binding(h.parent);
    chart.spec.chartType = kind === 'treemap' ? 'Treemap' : kind === 'sunburst' ? 'Sunburst' : 'Dendrogram';
    if (kind === 'treemap') { assert(e.size && e.color, 'Treemap needs area and color'); encodings.value = binding(e.size); delete encodings.size; }
    else {
      const depth = kind === 'sunburst' ? e['position.radius'] : e['position.y'];
      assert(depth && h.depth === depth, 'Hierarchy depth annotation must match the construction depth field');
      binding(depth);
      // Validate declared depth rather than accepting an unrelated numeric column.
      assert(Array.isArray(source.rows), 'Hierarchy depth validation requires inline construction rows');
      const rows = source.rows; const byKey = new Map(rows.map(r=>[String(r[h.key]),r]));
      assert(byKey.size === rows.length, 'Hierarchy keys must be unique per table');
      for (const row of rows) {
        let level=0, cursor=row; const seen=new Set();
        while (byKey.has(String(cursor[h.parent]))) {
          assert(!seen.has(cursor[h.key]), 'Hierarchy cycle'); seen.add(cursor[h.key]);
          cursor=byKey.get(String(cursor[h.parent])); level++;
        }
        assert(Number(row[depth])===level, 'Hierarchy depth does not match parent structure');
      }
      if(kind === 'sunburst') { assert(e['position.theta'], 'Sunburst requires angular value'); encodings.value=binding(e['position.theta']); }
      else {
        assert(e['position.x'] === h.key, 'Tree horizontal field denotes node identity ordered by hierarchy');
        chart.spec.offlineAnchorFields = [e['position.x'], depth];
      }
    }
    chart.spec.markGroups=[{id:`${chart.id}-nodes`,role:'node',sharedConfig:{treeDirection:'down',nodeLabelsVisible:kind==='treemap',leafLabelsVisible:kind==='treemap',size:4,tile: config.tile ?? 'binary'}}];
  } else if (kind === 'parallel_coordinates') {
    assert(e['position.x'] && e['position.y'], 'Parallel coordinates require dimension and value fields');
    const orientation=config.parallel?.axisOrientation??'vertical';
    const dimension=e[orientation==='horizontal'?'position.y':'position.x'],value=e[orientation==='horizontal'?'position.x':'position.y'];
    assert(fields.get(value)==='quantitative', 'Parallel values must be quantitative');
    binding(config.recordKey);
    chart.spec.chartType='ParallelCoordinatesPlot';
    chart.parallel={dimension,value,recordKey:config.recordKey,axisOrientation:orientation};
  } else {
    chart.spec.chartType = kind==='geo_area' ? 'PolygonLayer' : 'ScatterplotLayer';
    assert(config.geo?.geometry && config.geo?.bounds, 'Offline geographic charts require local geometry and explicit bounds');
    chart.geo=structuredClone(config.geo);
    if(kind==='geo_point') {
      assert(e['position.x'] && e['position.y'], 'Geo points require longitude and latitude');
      encodings.x=binding(e['position.x']); encodings.y=binding(e['position.y']);
    } else { assert(e.color && Object.keys(e).length===1, 'Offline geo_area currently supports color only'); binding(config.geo.key); }
  }
  return chart;
}
