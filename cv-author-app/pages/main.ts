import './style.css';
import { buildRandomizedAnnotation, validateAnnotation } from '../offline/randomized-annotation.mjs';
import { rng } from '../offline/randomized-browser-constants.mjs';
import geometryText from '../offline/assets/manhattan.geojson?raw';
import '../offline/renderer.ts';

declare global { interface Window { offlineRenderer: { render(scene: any): string } } }
type Definition = { channels: string[]; required: string[] };
const TYPES: Record<string, Definition> = {
  bar: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  point: { channels: ['position.x', 'position.y', 'color', 'size', 'shape'], required: ['position.x', 'position.y'] },
  single_line: { channels: ['position.x', 'position.y'], required: ['position.x', 'position.y'] },
  multi_line: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  stacked_bar: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  grouped_bar: { channels: ['position.x', 'position.y', 'position.x_offset', 'position.y_offset', 'color'], required: ['position.x', 'position.y'] },
  rect_heatmap: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  'pie/donut/radial_bar': { channels: ['position.theta', 'position.radius', 'color'], required: ['position.theta', 'color'] },
  single_radar: { channels: ['position.theta', 'position.radius'], required: ['position.theta', 'position.radius'] },
  multi_radar: { channels: ['position.theta', 'position.radius', 'color'], required: ['position.theta', 'position.radius', 'color'] },
  single_boxplot: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  violin: { channels: ['position.x', 'position.y'], required: ['position.x', 'position.y'] },
  contour: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  parallel_coordinates: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  geo_point: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  geo_line: { channels: ['position.x', 'position.y', 'color', 'stroke.width'], required: ['position.x', 'position.y'] },
  geo_area: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
};
const typeNames = Object.keys(TYPES);
const $ = (id: string) => document.getElementById(id)!;
const annotation = $('annotation') as HTMLTextAreaElement;
const seed = $('seed') as HTMLInputElement;
const geometry = JSON.parse(geometryText);
const preview = $('preview');
let currentSvg = '';

function seedValue() {
  const raw = seed.value.trim();
  if (!raw) return Math.floor(Math.random() * 0x100000000);
  if (!/^\d+$/.test(raw) || Number(raw) > 0xffffffff) throw new Error('Seed must be an integer from 0 to 4294967295');
  return Number(raw);
}
function integer(random: () => number, min: number, max: number) { return min + Math.floor(random() * (max - min + 1)); }
function pick<T>(random: () => number, values: T[]) { return values[Math.floor(random() * values.length)]; }
function parseOptionalInteger(id: string, min: number, max: number, label: string) {
  const raw = ($(id) as HTMLInputElement).value.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}, or left empty`);
  return value;
}
function randomAnnotation(usedSeed: number) {
  const random = rng(usedSeed);
  const count = parseOptionalInteger('mg-count', 1, 7, 'MG count') ?? integer(random, 1, 7);
  const requestedSharing = parseOptionalInteger('sharing-count', 1, 7, 'Field sharing count');
  const charts = Array.from({ length: count }, (_, index) => {
    const variation = pick(random, typeNames);
    const definition = TYPES[variation];
    const optional = definition.channels.filter(channel => !definition.required.includes(channel));
    const channels = [...definition.required, ...optional.filter(() => random() < .45)];
    const maxRepetition = count >= 6 ? 1 : 2;
    const repetitionCount = random() < (count >= 6 ? .3 : .42) ? integer(random, 1, maxRepetition) : 0;
    return { chart_id: `C${index + 1}`, variation, channels, repetitionCount };
  });
  let nextField = 1;
  const fieldMaps = charts.map(chart => Object.fromEntries(chart.channels.map(channel => [channel, `F${nextField++}`])));
  const repetitionMaps = charts.map(chart => Array.from({ length: chart.repetitionCount }, () => `F${nextField++}`));
  const allPairs = Array.from({ length: count }, (_, left) => Array.from({ length: count - left - 1 }, (_, offset) => [left, left + offset + 1] as [number, number])).flat();
  const sharingCount = Math.min(requestedSharing ?? integer(random, 1, Math.min(7, allPairs.length)), allPairs.length);
  const shuffledPairs = [...allPairs].sort(() => random() - .5).slice(0, sharingCount);
  for (const [left, right] of shuffledPairs) {
    const family = (chartIndex: number, channel: string) => {
      if (charts[chartIndex].variation.startsWith('geo_') && ['position.x', 'position.y'].includes(channel)) return 'geo-position';
      if (channel === 'position.theta') return 'angular';
      if (channel === 'position.radius' || channel === 'size') return 'quantitative';
      if (channel.startsWith('position.')) return 'position';
      return channel === 'text' || channel === 'color' || channel === 'shape' || channel === 'stroke.color' ? 'categorical' : channel;
    };
    const compatible = Object.keys(fieldMaps[left]).flatMap(leftChannel => Object.keys(fieldMaps[right]).filter(rightChannel => family(left, leftChannel) === family(right, rightChannel)).map(rightChannel => [leftChannel, rightChannel] as [string, string]));
    if (compatible.length) {
      const [leftChannel, rightChannel] = pick(random, compatible);
      fieldMaps[right][rightChannel] = fieldMaps[left][leftChannel];
    } else if (repetitionMaps[left].length && repetitionMaps[right].length) {
      repetitionMaps[right][integer(random, 0, repetitionMaps[right].length - 1)] = pick(random, repetitionMaps[left]);
    }
  }
  // When two repetition slots line up with a host's two positional fields,
  // keep that relationship explicit so the renderer can draw a nested view.
  const positionFields = (index: number) => ['position.x', 'position.y'].map(channel => fieldMaps[index][channel]).filter(Boolean);
  const nestedPairs = charts.flatMap((child, childIndex) => charts.flatMap((host, hostIndex) => {
    if (childIndex === hostIndex || child.repetitionCount < 2 || repetitionMaps[hostIndex].length || !['point', 'single_line', 'bar', 'rect_heatmap'].includes(host.variation)) return [];
    const hostPositions = positionFields(hostIndex);
    return hostPositions.length >= 2 ? [{ childIndex, hostIndex, hostPositions }] : [];
  }));
  if (nestedPairs.length && random() < .78) {
    const nested = pick(random, nestedPairs);
    repetitionMaps[nested.childIndex] = [...nested.hostPositions];
  }
  const resultCharts = charts.map((chart, index) => ({ chart_id: chart.chart_id, variation: chart.variation, encodings: fieldMaps[index], external_encodings: { position: repetitionMaps[index] } }));
  if (count >= 2 && random() < .6) {
    const repeatedTargets = charts.map((chart, index) => ({ index, repeated: repetitionMaps[index].length > 0 })).filter(target => target.repeated);
    const oneGroup = repeatedTargets.length > 0 && random() < .48;
    const targets = oneGroup
      ? [pick(random, repeatedTargets).index]
      : pick(random, Array.from({ length: count }, (_, left) => Array.from({ length: count - left - 1 }, (_, offset) => [left, left + offset + 1] as [number, number])).flat());
    const linkEncodings: Record<string, string> = {};
    if (random() < .72) linkEncodings['stroke.color'] = `F${nextField++}`;
    if (random() < .72) linkEncodings['stroke.width'] = `F${nextField++}`;
    resultCharts.push({
      chart_id: `C${count + 1}`,
      variation: 'link',
      encodings: linkEncodings,
      external_encodings: { position: [] },
      link_targets: targets.map(index => `C${index + 1}`),
    } as any);
  }
  const result = { charts: resultCharts };
  validateAnnotation(result);
  return { result, sharingCount };
}
function show(value: any) { annotation.value = JSON.stringify(value, null, 2); }
function render() {
  const value = JSON.parse(annotation.value); validateAnnotation(value);
  const usedSeed = seedValue(); const result = buildRandomizedAnnotation(value, { seed: usedSeed, geometry });
  currentSvg = window.offlineRenderer.render(result.scene); preview.innerHTML = currentSvg;
  const node = preview.querySelector('svg'); node?.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  $('status').textContent = `Rendered · seed ${usedSeed} · ${result.scene.width} × ${result.scene.height}`;
}
function download(name: string, type: string, text: string) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
show({ charts: [{ chart_id: 'C1', variation: 'point', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' }, external_encodings: { position: [] } }] });
$('mg-count').addEventListener('input', () => { $('mg-count-value').textContent = ($('mg-count') as HTMLInputElement).value; });
$('sharing-count').addEventListener('input', () => { $('sharing-count-value').textContent = ($('sharing-count') as HTMLInputElement).value; });
$('generate-annotation').onclick = () => { try { const usedSeed = seedValue(); const { result, sharingCount } = randomAnnotation(usedSeed); show(result); const mgCount = result.charts.filter(chart => chart.variation !== 'link').length; const linkCount = result.charts.filter(chart => chart.variation === 'link').length; $('status').textContent = `Schema-valid annotation · ${mgCount} MGs · ${sharingCount} shared fields${linkCount ? ' · 1 link' : ''} · seed ${usedSeed}`; } catch (error) { $('status').textContent = `Error: ${String(error).replace(/^Error: /, '')}`; } };
$('render').onclick = () => { try { render(); } catch (error) { $('status').textContent = `Error: ${String(error).replace(/^Error: /, '')}`; } };
$('format').onclick = () => { try { show(JSON.parse(annotation.value)); } catch (error) { $('status').textContent = `JSON error: ${String(error)}`; } };
$('download-json').onclick = () => download('annotation.json', 'application/json', annotation.value);
$('download-svg').onclick = () => { if (currentSvg) download(`randomized-${seed.value || 'svg'}.svg`, 'image/svg+xml', currentSvg); };
