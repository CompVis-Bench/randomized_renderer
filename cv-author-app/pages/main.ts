import './style.css';
import { buildRandomizedAnnotation, validateAnnotation } from '../offline/randomized-annotation.mjs';
import geometryText from '../offline/assets/manhattan.geojson?raw';
import '../offline/renderer.ts';

declare global { interface Window { offlineRenderer: { render(scene: any): string } } }
type TypeDefinition = { channels: string[]; required: string[] };
const TYPES: Record<string, TypeDefinition> = {
  bar: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  point: { channels: ['position.x', 'position.y', 'color', 'size', 'shape'], required: ['position.x', 'position.y'] },
  single_line: { channels: ['position.x', 'position.y'], required: ['position.x', 'position.y'] },
  multi_line: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  stacked_bar: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  grouped_bar: { channels: ['position.x', 'position.y', 'position.x_offset', 'position.y_offset', 'color'], required: ['position.x', 'position.y'] },
  rect_heatmap: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y', 'color'] },
  'pie/donut/radial_bar': { channels: ['position.theta', 'position.radius', 'color'], required: ['position.theta', 'color'] },
  single_boxplot: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  violin: { channels: ['position.x', 'position.y'], required: ['position.x', 'position.y'] },
  contour: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  parallel_coordinates: { channels: ['position.x', 'position.y', 'color'], required: ['position.x', 'position.y'] },
  treemap: { channels: ['size', 'color'], required: ['size'] },
  word_cloud: { channels: ['text', 'size', 'color'], required: ['text'] },
};
const example = { charts: [{ chart_id: 'C1', variation: 'point', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' }, external_encodings: { position: [] } }] };
const $ = (id: string) => document.getElementById(id)!;
const annotation = $('annotation') as HTMLTextAreaElement;
const seed = $('seed') as HTMLInputElement;
const preview = $('preview');
const geometry = JSON.parse(geometryText);
let currentSvg = '';
let channelSelections: string[][] = [];

function seedValue() { const raw = seed.value.trim(); if (!raw) return Math.floor(Math.random() * 0x100000000); if (!/^\d+$/.test(raw) || Number(raw) > 0xffffffff) throw new Error('Seed must be an integer from 0 to 4294967295'); return Number(raw); }
function show(value: any) { annotation.value = JSON.stringify(value, null, 2); }
function typeOptions(selected: string) { return Object.keys(TYPES).map(type => `<option value="${type}" ${type === selected ? 'selected' : ''}>${type}</option>`).join(''); }
function renderMGControls() {
  const count = Math.max(1, Math.min(5, Number(($('mg-count') as HTMLInputElement).value) || 1));
  ($('mg-count') as HTMLInputElement).value = String(count);
  while (channelSelections.length < count) channelSelections.push([]);
  channelSelections = channelSelections.slice(0, count);
  const currentTypes = [...document.querySelectorAll<HTMLSelectElement>('[data-mg-type]')].map(node => node.value);
  const types = Array.from({ length: count }, (_, i) => currentTypes[i] ?? Object.keys(TYPES)[i % Object.keys(TYPES).length]);
  $('mg-configs').innerHTML = types.map((type, i) => { const definition = TYPES[type]; const selected = new Set([...definition.required, ...channelSelections[i].filter(channel => definition.channels.includes(channel))]); channelSelections[i] = [...selected]; return `<div class="mg-row"><div class="mg-title"><strong>MG ${i + 1}</strong><select data-mg-type="${i}">${typeOptions(type)}</select></div><div class="channel-list">${definition.channels.map(channel => `<label class="channel"><input type="checkbox" data-channel="${i}" value="${channel}" ${selected.has(channel) ? 'checked' : ''} ${definition.required.includes(channel) ? 'disabled' : ''}><code>${channel}</code>${definition.required.includes(channel) ? '<small>required</small>' : ''}</label>`).join('')}</div></div>`; }).join('');
  renderSharing();
}
function renderSharing() { const count = Number(($('mg-count') as HTMLInputElement).value) || 1; $('sharing-config').innerHTML = Array.from({ length: count }, (_, i) => Array.from({ length: count - i - 1 }, (_, offset) => { const j = i + offset + 1; return `<label><input type="checkbox" data-share="${i}-${j}"><span>MG ${i + 1} ↔ MG ${j + 1}</span></label>`; }).join('')).join(''); }
function selectedChannels(index: number, type: string) { const definition = TYPES[type]; const values = [...document.querySelectorAll<HTMLInputElement>(`[data-channel="${index}"]`)].filter(node => node.checked).map(node => node.value); return [...new Set([...definition.required, ...values])]; }
function buildAnnotation() {
  const count = Number(($('mg-count') as HTMLInputElement).value) || 1;
  const repetition = ($('repetition') as HTMLInputElement).checked;
  const repetitionCount = repetition ? Math.max(1, Math.min(3, Number(($('rep-count') as HTMLInputElement).value) || 1)) : 0;
  const types = [...document.querySelectorAll<HTMLSelectElement>('[data-mg-type]')].map(node => node.value);
  const channels = types.map((type, i) => selectedChannels(i, type));
  const fields = channels.map(items => Object.fromEntries(items.map(channel => [channel, ''])));
  let nextField = 1;
  for (const map of fields) for (const channel of Object.keys(map)) map[channel] = `F${nextField++}`;
  for (const node of document.querySelectorAll<HTMLInputElement>('[data-share]:checked')) { const [left, right] = node.dataset.share!.split('-').map(Number); const leftChannel = channels[left].find(channel => channels[right].includes(channel)) ?? channels[left][0]; const rightChannel = channels[right].find(channel => channel === leftChannel) ?? channels[right][0]; fields[right][rightChannel] = fields[left][leftChannel]; }
  const repetitionFields = Array.from({ length: repetitionCount }, () => `F${nextField++}`);
  const charts = types.map((variation, i) => ({ chart_id: `C${i + 1}`, variation, encodings: fields[i], external_encodings: { position: repetitionFields } }));
  const result = { charts }; validateAnnotation(result); show(result); return result;
}
function render() { const value = JSON.parse(annotation.value); validateAnnotation(value); const usedSeed = seedValue(); const result = buildRandomizedAnnotation(value, { seed: usedSeed, geometry }); currentSvg = window.offlineRenderer.render(result.scene); preview.innerHTML = currentSvg; const node = preview.querySelector('svg'); node?.removeAttribute('width'); node?.removeAttribute('height'); node?.setAttribute('preserveAspectRatio', 'xMidYMid meet'); $('status').textContent = `Rendered · seed ${usedSeed} · ${result.scene.width} × ${result.scene.height}`; }
function download(name: string, type: string, text: string) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
show(example); renderMGControls();
($('mg-count') as HTMLInputElement).oninput = renderMGControls;
($('repetition') as HTMLInputElement).onchange = () => { ($('rep-count') as HTMLInputElement).disabled = !($('repetition') as HTMLInputElement).checked; };
$('mg-configs').onchange = event => { const target = event.target as HTMLSelectElement; if (target.matches('[data-mg-type]')) renderMGControls(); else if (target.matches('[data-channel]')) { const index = Number(target.dataset.channel); channelSelections[index] = selectedChannels(index, [...document.querySelectorAll<HTMLSelectElement>('[data-mg-type]')][index].value); } };
$('generate-annotation').onclick = () => { try { buildAnnotation(); $('status').textContent = 'Schema-valid annotation generated'; } catch (error) { $('status').textContent = `Error: ${String(error).replace(/^Error: /, '')}`; } };
$('render').onclick = () => { try { render(); } catch (error) { $('status').textContent = `Error: ${String(error).replace(/^Error: /, '')}`; } };
$('format').onclick = () => { try { show(JSON.parse(annotation.value)); } catch (error) { $('status').textContent = `JSON error: ${String(error)}`; } };
$('download-json').onclick = () => download('annotation.json', 'application/json', annotation.value);
$('download-svg').onclick = () => { if (currentSvg) download(`randomized-${seed.value || 'svg'}.svg`, 'image/svg+xml', currentSvg); };
