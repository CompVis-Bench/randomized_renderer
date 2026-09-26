import { galleryTargets, buildGalleryRecipe } from './gallery-recipes.mjs';
import { complexTargets, buildComplexRecipe } from './complex-recipes.mjs';
// Targets are declared before data/style construction. They define coverage.
export const targetRecipes = {
  bar: { level: 1, charts: [{ chart_id: 'C1', variation: 'bar', encodings: { 'position.x': 'F1', 'position.y': 'F2' }, repetition_position: [] }] },
  scatter: { level: 1, charts: [{ chart_id: 'C1', variation: 'point', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' }, repetition_position: [] }] },
  'scatter-shape': { level: 1, charts: [{ chart_id: 'C1', variation: 'point', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3', shape: 'F4' }, repetition_position: [] }] },
  concat: { level: 2, charts: [
    { chart_id: 'C1', variation: 'bar', encodings: { 'position.x': 'F1', 'position.y': 'F2' }, repetition_position: [] },
    { chart_id: 'C2', variation: 'bar', encodings: { 'position.x': 'F3', 'position.y': 'F4' }, repetition_position: [] },
  ] },
  facet: { level: 3, charts: [{ chart_id: 'C1', variation: 'bar', encodings: { 'position.x': 'F1', 'position.y': 'F2' }, repetition_position: ['F3'] }] },
  nested: { level: 4, charts: [{ chart_id: 'C1', variation: 'pie/donut/radial_bar', encodings: { 'position.theta': 'F3', color: 'F4' }, repetition_position: ['F1', 'F2'] }] },
  'facet-nested': { level: 5, charts: [{ chart_id: 'C1', variation: 'pie/donut/radial_bar', encodings: { 'position.theta': 'F3', color: 'F4' }, repetition_position: ['F1', 'F2', 'F5'] }] },
  ...complexTargets,
  ...galleryTargets,
};

export const galleryRecipeNames = Object.keys(galleryTargets);
export const complexRecipeNames = Object.keys(complexTargets);
export const basicRecipeNames = Object.keys(targetRecipes).filter((name) => !complexRecipeNames.includes(name) && !galleryRecipeNames.includes(name));

export const palettes = [
  ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377'],
  ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00'],
  ['#5E3C99', '#E66101', '#1B9E77', '#D95F02', '#7570B3', '#E7298A'],
  ['#346B84', '#BA4A53', '#4A805B', '#AA7832', '#7760A1', '#248E93'],
];
const gradients = [
  ['#EFF3FF', '#BDD7E7', '#6BAED6', '#3182BD', '#08519C'],
  ['#FFFFD4', '#FED98E', '#FE9929', '#D95F0E', '#993404'],
  ['#F2F0F7', '#CBC9E2', '#9E9AC8', '#756BB1', '#54278F'],
  ['#EDF8E9', '#BAE4B3', '#74C476', '#31A354', '#006D2C'],
];
const shapeNames = ['circle', 'square', 'diamond', 'triangle', 'cross', 'star'];
function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6D2B79F5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
const column = (name, type) => ({ name, type });
const dataset = (id, columns, rows, primaryKey) => ({ id, columns, rows, primaryKey });
const encoding = (field) => ({ field, type: 'quantitative' });

export function buildRecipe(name, variant = 0, seed = 23) {
  if (!targetRecipes[name]) throw new Error(`Unknown recipe ${name}`);
  const random = randomGenerator(seed);
  const integer = (min, max) => Math.floor(random() * (max - min + 1)) + min;
  const fields = {};
  const plan = { version: 1, width: 900, height: 620, datasets: [], charts: [],
    appearance: { palette: palettes[variant % palettes.length], gradient: gradients[variant % gradients.length],
      pointShape: shapeNames[variant % shapeNames.length], fontSize: [11, 12, 10][variant % 3] } };
  if (galleryTargets[name]) return buildGalleryRecipe(name, variant, seed, plan.appearance, random);
  if (complexTargets[name]) return buildComplexRecipe(name, variant, seed, plan.appearance, random);
  const chart = (id, datasetId, chartType) => ({ id, datasetId, ...(chartType ? { chartType } : {}) });
  if (['bar', 'facet', 'concat'].includes(name)) {
    fields.F1 = 'category'; fields.F2 = 'measured_amount';
    const categories = Array.from({ length: integer(4, 7) }, (_, i) => `Item ${i + 1}`);
    const rows = categories.map((F1) => ({ F1, F2: integer(10, 90) }));
    plan.datasets.push(dataset('bars', [column('F1', 'nominal'), column('F2', 'quantitative')], rows, ['F1']));
    plan.charts.push(chart('C1', 'bars'));
    if (name === 'concat') {
      fields.F3 = 'independent_category'; fields.F4 = 'independent_measure';
      plan.width = 1100; plan.height = 520;
      plan.datasets.push(dataset('other-bars', [column('F3', 'nominal'), column('F4', 'quantitative')],
        ['A', 'B', 'C', 'D'].map((F3) => ({ F3, F4: integer(15, 120) })), ['F3']));
      plan.charts.push(chart('C2', 'other-bars'));
      plan.composition = { type: 'concat', direction: variant % 2 ? 'vertical' : 'horizontal', gap: 24,
        children: [{ type: 'chart', chart: 'C1' }, { type: 'chart', chart: 'C2' }] };
      if (variant % 2) { plan.width = 720; plan.height = 960; }
    }
    if (name === 'facet') {
      fields.F3 = 'panel_category'; plan.width = 1000; plan.height = 760;
      plan.datasets[0] = dataset('bars', [...plan.datasets[0].columns, column('F3', 'nominal')],
        ['North', 'South', 'East', 'West'].flatMap((F3) => categories.map((F1) => ({ F1, F2: integer(10, 90), F3 }))), ['F3', 'F1']);
      plan.composition = { type: 'facet', datasetId: 'bars', field: 'F3', columns: 2, child: { type: 'chart', chart: 'C1' } };
    }
  } else if (name.startsWith('scatter')) {
    Object.assign(fields, { F1: 'horizontal_measure', F2: 'vertical_measure', F3: 'color_category' });
    const withShape = name === 'scatter-shape';
    if (withShape) fields.F4 = 'independent_shape_category';
    const columns = [column('F1', 'quantitative'), column('F2', 'quantitative'), column('F3', 'nominal')];
    if (withShape) columns.push(column('F4', 'nominal'));
    const rows = Array.from({ length: 24 }, (_, i) => ({ F1: i * 4 + integer(0, 2), F2: integer(8, 96), F3: ['A', 'B', 'C'][i % 3],
      ...(withShape ? { F4: ['Type I', 'Type II', 'Type III'][Math.floor(i / 3) % 3] } : {}) }));
    plan.datasets.push(dataset('points', columns, rows, ['F1']));
    plan.charts.push(chart('C1', 'points'));
  } else {
    Object.assign(fields, { F1: 'horizontal_measure', F2: 'vertical_measure', F3: 'slice_amount', F4: 'slice_category' });
    const faceted = name === 'facet-nested';
    if (faceted) { fields.F5 = 'outer_panel_category'; plan.width = 1200; plan.height = 660; }
    const positions = [];
    const slices = [];
    for (const panel of faceted ? ['Group A', 'Group B'] : [null]) {
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const anchor = { F1: 15 + col * 32 + integer(0, 5), F2: 15 + row * 32 + integer(0, 5), ...(faceted ? { F5: panel } : {}) };
          positions.push(anchor);
          for (const F4 of ['Part A', 'Part B', 'Part C']) slices.push({ ...anchor, F3: integer(5, 65), F4 });
        }
      }
    }
    const columns = [column('F1', 'quantitative'), column('F2', 'quantitative'), ...(faceted ? [column('F5', 'nominal')] : [])];
    const primaryKey = [...(faceted ? ['F5'] : []), 'F1', 'F2'];
    plan.datasets.push(dataset('positions', columns, positions, primaryKey),
      dataset('slices', [...columns, column('F3', 'quantitative'), column('F4', 'nominal')], slices, [...primaryKey, 'F4']));
    plan.charts.push({ id: 'anchor', layoutOnly: true, spec: { chartType: 'Scatterplot', datasetId: 'positions', encodings: { x: encoding('F1'), y: encoding('F2') } } },
      chart('C1', 'slices', variant % 2 ? 'DonutChart' : 'PieChart'));
    plan.composition = { type: 'nested', parent: 'anchor', child: 'C1', size: faceted ? 48 : 64 };
    if (faceted) plan.composition = { type: 'facet', datasetId: 'positions', field: 'F5', columns: 2, child: plan.composition };
  }
  const annotation = { schema_version: 'chart_encoding_variation_only_v3', sample_id: `synthetic-${name}-${variant}`,
    charts: structuredClone(targetRecipes[name].charts),
    data_fields: Object.entries(fields).map(([field_id, image_role]) => ({ field_id, image_role })),
    image_observation: name.includes('nested')
      ? '重复饼/环图由 F1、F2 定位；布局散点已隐藏，不作为独立 point 系统。外层分面存在时继承 F5。固定样式不增加编码字段。'
      : '由预先指定的目标标注构造。repetition_position 仅记录重复模板的位置字段；固定调色盘、字体和统一点形状不是额外数据编码。',
  };
  return { annotation, plan, level: targetRecipes[name].level };
}
