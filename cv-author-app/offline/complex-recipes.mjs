// Explicit annotation targets: complexity never changes the target after rendering.
const target = (chart_id, variation, encodings, repetition_position = []) => ({ chart_id, variation, encodings, repetition_position });
const pie = 'pie/donut/radial_bar';
export const complexTargets = {
  'polar-concat': { level: 6, charts: [
    target('C1', pie, { 'position.theta': 'F1', color: 'F2' }),
    target('C2', pie, { 'position.theta': 'F3', 'position.radius': 'F4', color: 'F3' }),
  ] },
  'polar-facet': { level: 6, charts: [
    target('C1', pie, { 'position.theta': 'F1', 'position.radius': 'F2', color: 'F1' }, ['F3', 'F4']),
  ] },
  'polar-line-facet': { level: 6, charts: [
    target('C1', 'single_line', { 'position.theta': 'F1', 'position.radius': 'F2' }, ['F3', 'F4']),
  ] },
  'nested-bars-pies': { level: 8, charts: [
    target('C1', 'bar', { 'position.x': 'F3', 'position.y': 'F4' }, ['F1', 'F2']),
    target('C2', pie, { 'position.theta': 'F5', color: 'F6' }, ['F1', 'F2', 'F3', 'F4']),
  ] },
  'multi-facet-bar-pie': { level: 7, charts: [
    target('C1', 'bar', { 'position.x': 'F1', 'position.y': 'F2' }, ['F5', 'F6']),
    target('C2', pie, { 'position.theta': 'F3', color: 'F1' }, ['F5', 'F6']),
  ] },
  'concat-then-nested': { level: 7, charts: [
    target('C1', 'bar', { 'position.x': 'F3', 'position.y': 'F4' }, ['F1', 'F2']),
    target('C2', pie, { 'position.theta': 'F5', color: 'F3' }, ['F1', 'F2']),
  ] },
  'nested-after-concat': { level: 7, charts: [
    target('C1', 'bar', { 'position.x': 'F1', 'position.y': 'F2' }),
    target('C2', 'bar', { 'position.x': 'F3', 'position.y': 'F4' }),
    target('C3', pie, { 'position.theta': 'F5', color: 'F6' }, ['F1', 'F2']),
  ] },
};

export function buildComplexRecipe(name, variant, seed, appearance, random) {
  const integer = (min, max) => Math.floor(random() * (max - min + 1)) + min;
  const plan = { version: 1, width: 1100, height: 1000, datasets: [], charts: [], appearance: { ...appearance, fontSize: 13, pieLabels: true } };
  const fields = {};
  const descriptions = {};
  const types = {};
  const define = (id, type, role) => { fields[id] = role; types[id] = type; };
  const table = (id, names, rows, primaryKey = names) => {
    plan.datasets.push({ id, columns: names.map((name) => ({ name, type: types[name] })), rows, primaryKey });
  };
  const chart = (id, datasetId, chartType) => plan.charts.push({ id, datasetId, ...(chartType ? { chartType } : {}) });
  const chartNode = (chart) => ({ type: 'chart', chart });
  const pieType = variant % 2 ? 'DonutChart' : 'PieChart';
  const makeAnchor = (rows) => {
    table('positions', ['F1', 'F2'], rows);
    plan.charts.push({ id: 'anchor', layoutOnly: true, spec: { chartType: 'Scatterplot', datasetId: 'positions',
      encodings: { x: { field: 'F1', type: 'quantitative' }, y: { field: 'F2', type: 'quantitative' } } } });
  };

  if (name === 'polar-concat') {
    define('F1', 'quantitative', 'inner_slice_amount'); define('F2', 'nominal', 'inner_slice_category');
    define('F3', 'nominal', 'radial_bar_category'); define('F4', 'quantitative', 'radial_bar_magnitude');
    table('pie', ['F1', 'F2'], ['A', 'B', 'C', 'D'].map((F2) => ({ F1: integer(12, 80), F2 })), ['F2']);
    table('radial', ['F3', 'F4'], ['I', 'II', 'III', 'IV'].map((F3) => ({ F3, F4: integer(25, 95) })), ['F3']);
    chart('C1', 'pie', pieType); chart('C2', 'radial', variant % 2 ? 'RadialRectBarChart' : 'RadialBarChart');
    plan.composition = { type: 'concat', direction: variant % 2 ? 'angular' : 'radial', angleOffset: -90,
      ...(variant % 2 ? {} : { radialBoundaries: [0, 0.5, 1] }), children: [chartNode('C1'), chartNode('C2')] };
    descriptions[name] = '两个独立极坐标系统以共同圆心沿半径或角度拼接。Concat 本身不增加 repetition_position；两组颜色的字段身份保持独立。';
  } else if (name === 'polar-facet' || name === 'polar-line-facet') {
    const line = name === 'polar-line-facet';
    define('F1', line ? 'quantitative' : 'nominal', line ? 'within_sector_step' : 'within_sector_category');
    define('F2', 'quantitative', 'within_band_magnitude'); define('F3', 'nominal', 'angular_panel_factor'); define('F4', 'nominal', 'radial_panel_factor');
    const rows = [];
    for (const F3 of ['North', 'East', 'South', 'West']) for (const F4 of ['Early', 'Late']) {
      for (let k = 0; k < (line ? 8 : 4); k += 1) rows.push({ F1: line ? k + 1 : `Q${k + 1}`, F2: integer(10, 95), F3, F4 });
    }
    table('polar-cells', ['F1', 'F2', 'F3', 'F4'], rows, ['F3', 'F4', 'F1']);
    chart('C1', 'polar-cells', line ? 'LineGraph' : variant % 2 ? 'RadialRectBarChart' : 'RadialBarChart');
    if (line) plan.charts[0].projection = 'polar';
    plan.composition = { type: 'facet', coordinateSystem: 'Polar', direction: 'angular', field: 'F3', datasetId: 'polar-cells',
      innerRadiusRatio: 0.16, angleOffset: -90,
      child: { type: 'facet', coordinateSystem: 'Polar', direction: 'radial', field: 'F4', datasetId: 'polar-cells', child: chartNode('C1') } };
    descriptions[name] = '四个角向分面乘两个径向分面，同一个模板重复八次。内部 theta/radius 是 F1/F2，实例定位仅使用 F3/F4，不因屏幕有两个轴就额外增加字段。';
  } else if (name === 'nested-bars-pies' || name === 'concat-then-nested') {
    define('F1', 'quantitative', 'outer_horizontal_measure'); define('F2', 'quantitative', 'outer_vertical_measure');
    define('F3', 'nominal', 'local_bar_category'); define('F4', 'quantitative', 'local_bar_amount');
    define('F5', 'quantitative', 'slice_amount');
    const deep = name === 'nested-bars-pies';
    if (deep) define('F6', 'nominal', 'slice_category');
    plan.width = 1600; plan.height = 1200;
    const anchors = [15, 80].flatMap((F1) => [20, 82].map((F2) => ({ F1, F2 })));
    makeAnchor(anchors);
    const bars = [];
    const slices = [];
    for (const anchor of anchors) for (const F3 of ['One', 'Two', 'Three']) {
      const F4 = integer(24, 82);
      bars.push({ ...anchor, F3, F4 });
      if (deep) for (const F6 of ['A', 'B', 'C']) slices.push({ ...anchor, F3, F4, F5: integer(10, 65), F6 });
      else slices.push({ ...anchor, F3, F5: integer(10, 65) });
    }
    table('bars', ['F1', 'F2', 'F3', 'F4'], bars, ['F1', 'F2', 'F3']);
    table('slices', deep ? ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'] : ['F1', 'F2', 'F3', 'F5'], slices, deep ? ['F1', 'F2', 'F3', 'F6'] : ['F1', 'F2', 'F3']);
    chart('C1', 'bars'); chart('C2', 'slices', pieType);
    const child = deep
      ? { type: 'nested', parent: 'C1', parentVisible: true, child: 'C2', width: 52, height: 52, offsetY: -14 }
      : { type: 'concat', direction: 'horizontal', gap: 8, children: [chartNode('C1'), chartNode('C2')] };
    plan.composition = { type: 'nested', parent: 'anchor', child, width: deep ? 360 : 460, height: 310, childAxes: true };
    descriptions[name] = deep
      ? '第一层把柱图嵌到 F1/F2 定位的实例；第二层把饼图嵌到每根柱端。柱图仅继承 F1/F2，饼图还继承柱类别 F3 和柱端数值 F4；原始外层散点隐藏。'
      : '先将独立柱图与饼图 Concat 成一个组合单元，再将整个单元 Nested 到 F1/F2 的每个位置。两模板都只继承 F1/F2；柱类别与饼颜色明确共享 F3。';
  } else if (name === 'multi-facet-bar-pie') {
    define('F1', 'nominal', 'shared_category'); define('F2', 'quantitative', 'bar_amount'); define('F3', 'quantitative', 'slice_amount');
    define('F5', 'nominal', 'outer_region'); define('F6', 'nominal', 'inner_scenario');
    plan.width = 1600; plan.height = 1100;
    const rows = [];
    for (const F5 of ['Region A', 'Region B']) for (const F6 of ['Before', 'After']) {
      for (const F1 of ['A', 'B', 'C', 'D']) rows.push({ F1, F2: integer(15, 90), F3: integer(10, 65), F5, F6 });
    }
    table('panels', ['F1', 'F2', 'F3', 'F5', 'F6'], rows, ['F5', 'F6', 'F1']);
    chart('C1', 'panels'); chart('C2', 'panels', pieType);
    plan.composition = { type: 'facet', datasetId: 'panels', field: 'F5', columns: 2, gap: 40,
      child: { type: 'facet', datasetId: 'panels', field: 'F6', columns: 1, gap: 28,
        child: { type: 'concat', direction: 'horizontal', gap: 12, children: [chartNode('C1'), chartNode('C2')] } } };
    descriptions[name] = 'Region 外层分面、Before/After 内层分面，每个单元包含柱图和饼图。两个模板继承相同 F5/F6；共享类别 F1，数值 F2 与 F3 独立。';
  } else if (name === 'nested-after-concat') {
    define('F1', 'nominal', 'left_bar_category'); define('F2', 'quantitative', 'left_bar_amount');
    define('F3', 'nominal', 'right_bar_category'); define('F4', 'quantitative', 'right_bar_amount');
    define('F5', 'quantitative', 'slice_amount'); define('F6', 'nominal', 'slice_category');
    plan.width = 1500; plan.height = 800;
    const left = ['A', 'B', 'C', 'D'].map((F1) => ({ F1, F2: integer(20, 95) }));
    table('left', ['F1', 'F2'], left, ['F1']);
    table('right', ['F3', 'F4'], ['I', 'II', 'III'].map((F3) => ({ F3, F4: integer(20, 95) })), ['F3']);
    table('slices', ['F1', 'F2', 'F5', 'F6'], left.flatMap((row) => ['X', 'Y', 'Z'].map((F6) => ({ ...row, F5: integer(10, 80), F6 }))), ['F1', 'F6']);
    chart('C1', 'left'); chart('C2', 'right'); chart('C3', 'slices', pieType);
    plan.composition = { type: 'nested', parentVisible: true, anchorChart: 'C1', width: 64, height: 64, offsetY: -18,
      parent: { type: 'concat', direction: 'horizontal', children: [chartNode('C1'), chartNode('C2')] }, child: 'C3' };
    descriptions[name] = '先组合两张独立柱图，再对组合中的 C1 柱端执行 Nested。两张柱图不重复；只有饼图由 C1 的类别 F1 与数值 F2 定位，不继承邻近 C2 的字段。';
  } else throw new Error(`Unknown complex recipe ${name}`);

  return { level: complexTargets[name].level, plan, annotation: {
    schema_version: 'chart_encoding_variation_only_v3', sample_id: `synthetic-${name}-${variant}`,
    charts: structuredClone(complexTargets[name].charts),
    data_fields: Object.entries(fields).map(([field_id, image_role]) => ({ field_id, image_role })),
    image_observation: descriptions[name],
  } };
}
