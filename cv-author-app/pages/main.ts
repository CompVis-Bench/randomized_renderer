import './style.css';
import { buildRandomizedAnnotation } from '../offline/randomized-annotation.mjs';
import { rng } from '../offline/randomized-browser-constants.mjs';
import geometryText from '../offline/assets/manhattan.geojson?raw';
import '../offline/renderer.ts';

declare global { interface Window { offlineRenderer: { render(scene: any): string } } }
const templates = [
  { variation: 'bar', encodings: { 'position.x': 'F1', 'position.y': 'F2' } },
  { variation: 'point', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' } },
  { variation: 'single_line', encodings: { 'position.x': 'F1', 'position.y': 'F2' } },
  { variation: 'stacked_bar', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' } },
  { variation: 'rect_heatmap', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' } },
  { variation: 'pie/donut/radial_bar', encodings: { 'position.theta': 'F1', color: 'F2' } },
];
const example = { charts: [{ chart_id: 'C1', variation: 'point', encodings: { 'position.x': 'F1', 'position.y': 'F2', color: 'F3' }, external_encodings: { position: [] } }] };
const $ = (id: string) => document.getElementById(id)!;
const annotation = $('annotation') as HTMLTextAreaElement;
const seed = $('seed') as HTMLInputElement;
const preview = $('preview');
const geometry = JSON.parse(geometryText);
let currentSvg = '';
function randomAnnotation(value: number) {
  const random = rng(value); const count = random() < .72 ? 1 : 2; const charts: any[] = []; const used = new Set<string>();
  for (let index = 0; index < count; index++) { let t: any; do t = templates[Math.floor(random() * templates.length)]; while (used.has(t.variation)); used.add(t.variation); const offset = index * 3;
    charts.push({ chart_id: `C${index + 1}`, variation: t.variation, encodings: Object.fromEntries(Object.entries(t.encodings).map(([k, f]) => [k, `F${Number(String(f).slice(1)) + offset}`])), external_encodings: { position: [] } }); }
  return { charts };
}
function seedValue() { const raw = seed.value.trim(); if (!raw) return Math.floor(Math.random() * 0x100000000); if (!/^\d+$/.test(raw) || Number(raw) > 0xffffffff) throw new Error('Seed 必须是 0 到 4294967295 的整数'); return Number(raw); }
function show(value: any) { annotation.value = JSON.stringify(value, null, 2); }
function render() { const value = JSON.parse(annotation.value); const usedSeed = seedValue(); const result = buildRandomizedAnnotation(value, { seed: usedSeed, geometry }); currentSvg = window.offlineRenderer.render(result.scene); preview.innerHTML = currentSvg; const node = preview.querySelector('svg'); node?.removeAttribute('width'); node?.removeAttribute('height'); node?.setAttribute('preserveAspectRatio', 'xMidYMid meet'); $('status').textContent = `已生成 · seed ${usedSeed} · ${result.scene.width} × ${result.scene.height}`; }
function randomize() { const usedSeed = seedValue(); show(randomAnnotation(usedSeed)); $('status').textContent = `已生成随机 annotation · seed ${usedSeed}`; }
function download(name: string, type: string, text: string) { const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([text], { type })); link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); }
show(example);
$('randomize').onclick = () => { try { randomize(); } catch (e) { $('status').textContent = String(e); } };
$('render').onclick = () => { try { render(); } catch (e) { $('status').textContent = `错误：${String(e).replace(/^Error: /, '')}`; } };
$('format').onclick = () => { try { show(JSON.parse(annotation.value)); } catch (e) { $('status').textContent = `JSON 错误：${String(e)}`; } };
$('download-json').onclick = () => download('annotation.json', 'application/json', annotation.value);
$('download-svg').onclick = () => { if (currentSvg) download(`randomized-${seed.value || 'svg'}.svg`, 'image/svg+xml', currentSvg); };
