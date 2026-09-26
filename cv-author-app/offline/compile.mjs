#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {validatePositionAlignments} from './position-relations.mjs';
import { compileBasis } from './basis-contracts.mjs';
import { compileExtended } from './extended-contracts.mjs';
import { asNode, leafIds, anchorFields, validateComposition } from './composition.mjs';

// This intentionally small compiler fails closed outside its supported subset.
// It never changes the target annotation to fit a conveniently rendered image.
export const templates = {
  bar: { types: ['SingleBarChart'], channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  point: { types: ['Scatterplot'], channels: ['position.x', 'position.y', 'color', 'size', 'shape'], required: ['position.x', 'position.y'] },
  single_line: { types: ['LineGraph'], channels: ['position.x', 'position.y', 'position.theta', 'position.radius'], required: ['position.x', 'position.y'] },
  multi_line: { types: ['MultiLineChart'], channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  stacked_area: { types: ['StackedAreaChart'], channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  stacked_bar: { types: ['StackedBarChart'], channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  rect_heatmap: { types: ['MatrixDiagram'], channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  'pie/donut/radial_bar': { types: ['PieChart', 'DonutChart', 'RadialBarChart', 'RadialRectBarChart'], channels: ['position.theta', 'position.radius', 'color'], required: ['position.theta', 'color'] },
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (a, b) => a.length === b.length && a.every((value) => b.includes(value));

export function compileTarget(annotation, plan) {
  assert(annotation.schema_version === 'chart_encoding_variation_only_v3', 'Use the existing v3 schema_version, not v5 external_encodings');
  assert(Array.isArray(annotation.charts) && annotation.charts.length > 0 && annotation.charts.length <= 64, 'Target must have 1–64 charts');
  assert(plan.version === 1 && Array.isArray(plan.datasets) && Array.isArray(plan.charts), 'Plan requires version: 1, datasets, charts');
  validatePositionAlignments(annotation,plan);
  const chartIds = new Set();
  const columnTypes = new Map();
  for (const dataset of plan.datasets) {
    for (const column of dataset.columns ?? []) {
      assert(!columnTypes.has(column.name) || columnTypes.get(column.name) === column.type, `Shared field ${column.name} has inconsistent types`);
      columnTypes.set(column.name, column.type);
    }
  }
  const plans = new Map(plan.charts.map((chart) => [chart.id, chart]));
  assert(plans.size === plan.charts.length, 'Duplicate chart IDs in plan');
  const compiled = [];
  for (const target of annotation.charts) {
    assert(Object.keys(target).sort().join(',') === (target.variation === 'link' ? 'chart_id,encodings,link_targets,repetition_position,variation' : 'chart_id,encodings,repetition_position,variation'), 'Target chart must have exactly chart_id, variation, encodings, repetition_position');
    assert(/^C[1-9]\d*$/.test(target.chart_id) && !chartIds.has(target.chart_id), 'Invalid or duplicate chart_id');
    chartIds.add(target.chart_id);
    const template = templates[target.variation];

    assert(Array.isArray(target.repetition_position) && new Set(target.repetition_position).size === target.repetition_position.length, `${target.chart_id}: repetition_position must be a unique array`);
    const config = plans.get(target.chart_id);
    assert(config && !config.layoutOnly, `Missing visible chart plan for ${target.chart_id}`);
    const extended = compileBasis(target, config, plan) ?? compileExtended(target, config, plan);
    if (extended) { compiled.push(extended); continue; }
    assert(template, `Unsupported target variation: ${target.variation}; extend the compiler explicitly`);
    const chartType = config.chartType ?? template.types[0];
    assert(template.types.includes(chartType), `${target.chart_id}: ${chartType} does not implement ${target.variation}`);
    const source = plan.datasets.find((dataset) => dataset.id === config.datasetId);
    assert(source, `${target.chart_id}: dataset not found`);
    const fields = new Map(source.columns.map((column) => [column.name, column.type]));
    const encodings = {};
    const radialBar = ['RadialBarChart', 'RadialRectBarChart'].includes(chartType);
    const projected = config.projection === 'polar';
    assert(config.projection === undefined || (projected && chartType === 'LineGraph'), 'projection: polar currently supports LineGraph');
    const required = radialBar ? ['position.theta', 'position.radius', 'color']
      : projected ? ['position.theta', 'position.radius'] : template.required;
    if (radialBar) assert(target.encodings.color === target.encodings['position.theta'], 'Radial bar color must identify the same category as theta');
    if (target.variation === 'single_line') {
      const allowed = projected ? ['position.theta', 'position.radius'] : ['position.x', 'position.y'];
      assert(Object.keys(target.encodings).every((channel) => allowed.includes(channel)), 'Line projection must match its coordinate channels');
    }
    if (target.variation === 'pie/donut/radial_bar' && !radialBar) assert(!target.encodings['position.radius'], 'Data-driven Pie radius is not yet supported by target compilation');
    for (const [channel, field] of Object.entries(target.encodings)) {
      assert(template.channels.includes(channel), `${target.chart_id}: unsupported channel ${channel}`);
      assert(/^F[1-9]\d*$/.test(field) && fields.has(field), `${target.chart_id}: unknown field ${field}`);
      let nativeChannel = channel.replace('position.', '');
      if (target.variation === 'pie/donut/radial_bar' && channel === 'color') nativeChannel = 'segment';
      if (radialBar && channel === 'position.theta') nativeChannel = 'segment';
      if (projected && channel === 'position.theta') nativeChannel = 'x';
      if (projected && channel === 'position.radius') nativeChannel = 'y';
      if (['multi_line', 'stacked_area'].includes(target.variation) && channel === 'color') nativeChannel = 'series';
      encodings[nativeChannel] = { field, type: fields.get(field) };
    }
    for (const channel of required) assert(target.encodings[channel], `${target.chart_id}: ${channel} is required for this implementation`);
    for (const field of target.repetition_position) assert(/^F[1-9]\d*$/.test(field) && fields.has(field), `${target.chart_id}: missing repetition field ${field}`);
    if (radialBar) assert(['nominal', 'ordinal'].includes(encodings.segment.type) && encodings.radius.type === 'quantitative', 'Radial bar requires categorical theta and quantitative radius');
    compiled.push({ id: target.chart_id, ...(projected ? { projection: 'polar' } : {}), spec: { chartType, datasetId: config.datasetId, encodings } });
  }
  for (const config of plan.charts) {
    if (chartIds.has(config.id)) continue;
    assert(config.layoutOnly === true && config.spec?.chartType === 'Scatterplot', `Unannotated visible chart ${config.id}; only a hidden Scatterplot scaffold is allowed`);
    compiled.push({ id: config.id, layoutOnly: true, spec: structuredClone(config.spec) });
  }
  const byId = new Map(compiled.map((chart) => [chart.id, chart]));
  const inherited = new Map();
  const contexts = new Map();
  const scaffolds = new Set();
  function record(id, fields, polar) {
    assert(chartIds.has(id), `Visible chart ${id} has no target annotation`);
    assert(!inherited.has(id), `${id} occurs twice in composition; use facet for repeated templates`);
    if (byId.get(id)?.projection === 'polar') assert(polar, `${id}: polar line projection requires a Polar composition`);
    if (polar) assert((byId.get(id)?.spec.chartType==='OfflineBasisIdiom' && !!byId.get(id)?.spec.encodings.theta && !!byId.get(id)?.spec.encodings.radius) || ['PieChart', 'DonutChart', 'RadialBarChart', 'RadialRectBarChart'].includes(byId.get(id)?.spec.chartType)
      || byId.get(id)?.projection === 'polar', `${id}: unsupported Cartesian chart in a Polar composition`);
    inherited.set(id, [...new Set(fields)]);
    contexts.set(id, [...new Set(fields)]);
  }
  function traverse(input, fields = [], depth = 0, polar = false) {
    const node = asNode(input);
    assert(node && depth < 12, 'Missing or excessively deep composition');
    if (node.type === 'chart') record(node.chart, fields, polar);
    else if (node.type === 'linked') {
      traverse(node.child, fields, depth + 1, polar);
      node.links.forEach(child => traverse(child, fields, depth + 1, polar));
    } else if (node.type === 'network') {
      assert(!polar && byId.get(node.nodes)?.graph && byId.get(node.links)?.nodeChart === node.nodes, 'Network node/link pairing does not match target');
      record(node.nodes,fields,false); record(node.links,fields,false);
    } else if (node.type === 'layer') {
      const first=byId.get(node.children[0]),basis=first?.spec.chartType==='OfflineBasisIdiom';
      if(basis){
        const s=first.spec;
        assert(!polar && node.children.every(id=>{const t=byId.get(id)?.spec;return t?.chartType==='OfflineBasisIdiom'&&['geo_area','geo_point','geo_line'].includes(t.offlineVariation)&&JSON.stringify(t.offlineOptions.geometry)===JSON.stringify(s.offlineOptions.geometry);}), 'Basis geographic layers must share projection geometry');
      }else{
        assert(!polar && node.children.every(id => byId.get(id)?.geo), 'Layer currently supports geographic members only');
        const geo=first.geo;
        assert(node.children.every(id => JSON.stringify(byId.get(id).geo.bounds)===JSON.stringify(geo.bounds) && JSON.stringify(byId.get(id).geo.geometry)===JSON.stringify(geo.geometry)), 'Geographic layers must share geometry and bounds');
      }
      node.children.forEach(id=>record(id,fields,false));
    }
    else if (node.type === 'concat') {
      const nextPolar = ['radial', 'angular'].includes(node.direction);
      assert(!polar || nextPolar, 'Cartesian concat cannot consume a Polar cell');
      node.children.forEach((child) => traverse(child, fields, depth + 1, nextPolar));
    } else if (node.type === 'facet') {
      assert(columnTypes.has(node.field), `Unknown facet field ${node.field}`);
      const nextPolar = node.coordinateSystem === 'Polar';
      assert(!polar || nextPolar, 'Cartesian facet cannot consume a Polar cell');
      traverse(node.child, [...fields, node.field], depth + 1, nextPolar);
    } else if (node.type === 'nested') {
      assert(!polar, 'Nested anchors currently require Cartesian parent coordinates');
      const parentIds = leafIds(node.parent);
      const anchorId = node.anchorChart ?? parentIds[0];
      const parent = byId.get(anchorId);
      assert(parent, `Missing nested anchor ${anchorId}`);
      const position = anchorFields(parent.spec);
      if (node.parentVisible) {
        assert(!parent.layoutOnly, 'A layoutOnly scaffold cannot be a visible parent');
        assert(parent.spec.chartType !== 'Scatterplot', 'Visible point parents would be covered by children; use a hidden scaffold or a visible bar parent');
        traverse(node.parent, fields, depth + 1, false);
      } else {
        assert(parent.layoutOnly === true, 'Hidden nested parent must be an explicitly marked layout scaffold');
        scaffolds.add(anchorId);
        contexts.set(anchorId, [...new Set(fields)]);
      }
      traverse(node.child, [...(contexts.get(anchorId) ?? fields), ...position], depth + 1, false);
    } else throw new Error(`Unsupported composition ${node.type}`);
  }
  const composition = plan.composition ?? (annotation.charts.length === 1 ? { type: 'chart', chart: annotation.charts[0].chart_id } : null);
  assert(composition, 'Multiple charts require an explicit composition');
  validateComposition(composition, new Set(byId.keys()), new Set(plan.datasets.map((dataset) => dataset.id)));
  traverse(composition);
  for (const target of annotation.charts) {
    assert(inherited.has(target.chart_id), `${target.chart_id} is not rendered`);
    assert(sameSet(inherited.get(target.chart_id), target.repetition_position), `${target.chart_id}: composition position fields [${inherited.get(target.chart_id)}] disagree with target [${target.repetition_position}]`);
  }
  for (const chart of compiled) assert(chartIds.has(chart.id) || scaffolds.has(chart.id), `Unused scaffold ${chart.id}`);
  return { version: 1, width: plan.width ?? 900, height: plan.height ?? 640,
    background: plan.background ?? '#ffffff', datasets: structuredClone(plan.datasets), charts: compiled,
    composition: structuredClone(composition), appearance: structuredClone(plan.appearance ?? {}) };
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    output: { type: 'string', short: 'o' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('node cv-author-app/offline/compile.mjs target.annotation.json construction.plan.json -o example.spec.json\nUses v3 repetition_position. Dataset paths are resolved relative to the plan. Refuses to overwrite output.');
    return;
  }
  assert(positionals.length === 2 && values.output, 'Supply a target annotation, a construction plan, and -o output.spec.json');
  const annotation = JSON.parse(await readFile(positionals[0], 'utf8'));
  const plan = JSON.parse(await readFile(positionals[1], 'utf8'));
  const scene = compileTarget(annotation, plan);
  for (const dataset of scene.datasets) {
    if (dataset.file) dataset.file = path.relative(path.dirname(path.resolve(values.output)), path.resolve(path.dirname(positionals[1]), dataset.file));
  }
  await writeFile(values.output, `${JSON.stringify(scene, null, 2)}\n`, { flag: 'wx' });
  console.log(values.output);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Compile failed: ${error.message}`); process.exitCode = 1; });
}
