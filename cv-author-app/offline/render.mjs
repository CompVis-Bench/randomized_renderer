#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { chromium } from 'playwright';
import Papa from 'papaparse';
import {validateAnnotation,validateRandomizedScene} from './randomized-annotation.mjs';
import { validateComposition } from './composition.mjs';
import { validateNestedComposition } from './nested-contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.dirname(here);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function onlyKeys(object, allowed, label) {
  assert(isObject(object), `${label} must be an object`);
  for (const key of Object.keys(object)) assert(allowed.includes(key), `${label}: unknown property ${key}`);
}

function dimension(value, label, max = 16384) {
  assert(Number.isInteger(value) && value >= 32 && value <= max, `${label} must be an integer in [32, ${max}]`);
  return value;
}

export async function loadScene(filename) {
  const scene = JSON.parse(await readFile(filename, 'utf8'));
  assert(!scene.charts?.some((chart) => chart.variation),
    'This is an annotation, not a render spec. Supply datasets and charts[].spec (see examples).');
  onlyKeys(scene, ['version', 'width', 'height', 'background', 'datasets', 'charts', 'composition', 'appearance'], 'scene');
  assert(scene.version === 1, 'scene.version must be 1');
  dimension(scene.width, 'width');
  dimension(scene.height, 'height');
  scene.background ??= '#ffffff';
  assert(typeof scene.background === 'string', 'background must be a CSS color');
  assert(Array.isArray(scene.datasets) && scene.datasets.length > 0, 'datasets must be a nonempty array');
  const datasetIds = new Set();
  for (const dataset of scene.datasets) {
    onlyKeys(dataset, ['id', 'name', 'columns', 'primaryKey', 'rows', 'file'], 'dataset');
    assert(typeof dataset.id === 'string' && dataset.id.length > 0 && !datasetIds.has(dataset.id), 'dataset.id must be unique and nonempty');
    datasetIds.add(dataset.id);
    assert((dataset.file !== undefined) !== (dataset.rows !== undefined), `${dataset.id}: supply exactly one of rows or file`);
    if (dataset.file !== undefined) {
      assert(typeof dataset.file === 'string' && !/^[a-z]+:\/\//i.test(dataset.file), 'dataset.file must be a local CSV or JSON file');
      const dataPath = path.resolve(path.dirname(filename), dataset.file);
      const raw = await readFile(dataPath, 'utf8');
      const extension = path.extname(dataPath).toLowerCase();
      if (extension === '.csv') {
        const parsed = Papa.parse(raw, { header: true, skipEmptyLines: 'greedy' });
        assert(parsed.errors.length === 0, `${dataset.file}: invalid CSV: ${parsed.errors.map((e) => e.message).join('; ')}`);
        dataset.rows = parsed.data;
      } else if (extension === '.json') {
        dataset.rows = JSON.parse(raw);
      } else throw new Error('dataset.file must have a .csv or .json extension');
      delete dataset.file;
    }
    assert(Array.isArray(dataset.rows) && dataset.rows.length > 0 && dataset.rows.every(isObject), `${dataset.id}: rows must be a nonempty array of objects`);
    assert(Array.isArray(dataset.columns) && dataset.columns.length > 0, `${dataset.id}: columns must specify field names and types`);
    const columnNames = new Set();
    for (const column of dataset.columns) {
      assert(typeof column.name === 'string' && column.name.length > 0 && !columnNames.has(column.name), `${dataset.id}: duplicate or invalid column name`);
      columnNames.add(column.name);
      assert(['nominal', 'ordinal', 'quantitative', 'temporal'].includes(column.type), `${dataset.id}.${column.name}: invalid column type`);
    }
    dataset.primaryKey ??= [];
    assert(Array.isArray(dataset.primaryKey) && dataset.primaryKey.every((key) => columnNames.has(key)), `${dataset.id}: primaryKey fields must exist`);
    dataset.name ??= dataset.id;
    dataset.rows = dataset.rows.map((row, rowIndex) => Object.fromEntries(dataset.columns.map((column) => {
      const value = row[column.name];
      assert(value !== undefined && value !== null && ['string', 'number', 'boolean'].includes(typeof value), `${dataset.id} row ${rowIndex}: missing or non-scalar field ${column.name}`);
      if (column.type === 'quantitative') assert(String(value).trim() !== '' && Number.isFinite(Number(value)), `${dataset.id} row ${rowIndex}: ${column.name} must be numeric`);
      if (column.type === 'temporal') assert(Number.isFinite(Date.parse(String(value))), `${dataset.id} row ${rowIndex}: ${column.name} must be a date`);
      return [column.name, String(value)];
    })));
    if (dataset.primaryKey.length) {
      const keys = dataset.rows.map((row) => JSON.stringify(dataset.primaryKey.map((key) => row[key])));
      assert(new Set(keys).size === keys.length, `${dataset.id}: primaryKey is not unique`);
    }
  }
  assert(Array.isArray(scene.charts) && scene.charts.length > 0, 'charts must be a nonempty array');
  const chartIds = new Set();
  for (const [index, chart] of scene.charts.entries()) {
    onlyKeys(chart, ['id', 'x', 'y', 'width', 'height', 'spec', 'coordinateGuide', 'layoutOnly', 'projection', 'graph', 'nodeChart', 'parallel', 'geo'], `charts[${index}]`);
    chart.id ??= `chart-${index + 1}`;
    assert(typeof chart.id === 'string' && /^[A-Za-z][\w-]*$/.test(chart.id) && !chartIds.has(chart.id), 'chart.id must be a unique identifier (letters, digits, _ or -)');
    chartIds.add(chart.id);
    chart.x ??= 24;
    chart.y ??= 24;
    chart.width ??= scene.width - 48;
    chart.height ??= scene.height - 48;
    dimension(chart.width, `${chart.id}.width`);
    dimension(chart.height, `${chart.id}.height`);
    assert(Number.isFinite(chart.x) && Number.isFinite(chart.y) && chart.x >= 0 && chart.y >= 0
      && chart.x + chart.width <= scene.width && chart.y + chart.height <= scene.height,
    `${chart.id}: chart frame must be inside the scene`);
    assert(isObject(chart.spec) && typeof chart.spec.chartType === 'string' && isObject(chart.spec.encodings), `${chart.id}: spec requires chartType, datasetId, encodings`);
    assert(datasetIds.has(chart.spec.datasetId), `${chart.id}: unknown datasetId ${chart.spec.datasetId}`);
  }
  if (scene.appearance) onlyKeys(scene.appearance, ['palette', 'gradient', 'pointShape', 'fontSize', 'pieLabels', 'showFieldLabels'], 'appearance');
  if (scene.composition) {
    if(scene.composition.type==='randomized'){
      const annotation={charts:scene.charts.map(c=>({chart_id:c.id,variation:c.spec.offlineVariation,encodings:Object.fromEntries(Object.entries(c.spec.encodings).map(([k,v])=>[['x','y','x2','y2','theta','radius','x_offset','y_offset'].includes(k)?'position.'+k:k,v.field])),external_encodings:c.spec.external,...(c.spec.offlineVariation==='link'?{link_targets:c.spec.offlineLinkTargets}:{})}))};
      validateAnnotation(annotation);validateRandomizedScene(annotation,scene);
    } else if(scene.charts.every(chart=>chart.spec.chartType==='OfflineNestedIdiom')) validateNestedComposition(scene.composition,chartIds);
    else validateComposition(scene.composition, chartIds, datasetIds);
  }
  return scene;
}

export async function createRenderer() {
  // Build only into memory; no dev server, .env loading, dist output or remote requests.
  const bundle = await build({
    root: app, configFile: false, envFile: false, logLevel: 'silent',
    build: { write: false, minify: false, sourcemap: false,
      lib: { entry: path.join(here, 'renderer.ts'), name: 'VisBricksOffline', formats: ['iife'] },
    },
  });
  const output = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output);
  const chunks = output.filter((item) => item.type === 'chunk');
  assert(chunks.length === 1, 'Expected one self-contained renderer bundle');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(`Cannot launch Chromium. Install it once with: npx playwright install chromium\n${error.message}`);
  }
  try {
    const context = await browser.newContext({ offline: true, locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    await page.addScriptTag({ content: chunks[0].code });
    return {
      close: () => browser.close(),
      versions: { node: process.version, chromium: browser.version() },
      listTypes: () => page.evaluate(() => window.offlineRenderer.listTypes()),
      async renderSvg(scene) { return page.evaluate(scene => window.offlineRenderer.render(scene), scene); },
      async render(scene, scale = 1) {
        assert(Number.isFinite(scale) && scale > 0 && scale <= 4, 'scale must be in (0, 4]');
        const width = Math.round(scene.width * scale);
        const height = Math.round(scene.height * scale);
        assert(width > 0 && height > 0 && width <= 16384 && height <= 16384 && width * height <= 64000000, 'PNG dimensions must be <= 16384 and total pixels <= 64 million');
        const result = await page.evaluate(async ({ scene, width, height }) => {
          const svg = window.offlineRenderer.render(scene);
          const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
          if (doc.querySelector('parsererror')) throw new Error('Renderer produced malformed SVG');
          if (doc.querySelector('script, foreignObject, image, use')) throw new Error('SVG must be self-contained vector content');
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const image = new Image();
          const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
          try {
            image.src = url;
            await image.decode();
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Canvas 2D is unavailable');
            context.drawImage(image, 0, 0, width, height);
            const data = canvas.toDataURL('image/png');
            if (!data.startsWith('data:image/png;base64,')) throw new Error('PNG encoding failed');
            return { svg, png: data.slice(data.indexOf(',') + 1) };
          } finally { URL.revokeObjectURL(url); }
        }, { scene, width, height });
        return { svg: result.svg, png: Buffer.from(result.png, 'base64'), width, height };
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function exists(filename) {
  try { await access(filename); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    output: { type: 'string', short: 'o' }, 'out-dir': { type: 'string' },
    scale: { type: 'string', default: '1' }, svg: { type: 'boolean' },
    overwrite: { type: 'boolean' }, 'list-types': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`Offline VisBricks spec → PNG
  node cv-author-app/offline/render.mjs example.spec.json -o outputs/example.png [--scale 2] [--svg]
  node cv-author-app/offline/render.mjs specs/ --out-dir outputs/ [--overwrite]
  node cv-author-app/offline/render.mjs --list-types

Directories include only *.spec.json (non-recursive). CSV/JSON paths are relative
to the spec file. Original annotation JSON is not a render spec. Existing outputs
are protected unless --overwrite is supplied. No development server is used.`);
    return;
  }
  const scale = Number(values.scale);
  assert(Number.isFinite(scale) && scale > 0 && scale <= 4, 'scale must be in (0, 4]');
  const inputs = [];
  for (const input of positionals) {
    const filename = path.resolve(input);
    if ((await stat(filename)).isDirectory()) {
      for (const item of (await readdir(filename)).sort()) if (item.endsWith('.spec.json')) inputs.push(path.join(filename, item));
    } else inputs.push(filename);
  }
  assert(values['list-types'] || inputs.length > 0, 'Supply a spec file or directory; use --help for examples');
  assert(!(values.output && values['out-dir']), 'Use either --output or --out-dir');
  assert(!values.output || inputs.length === 1, '--output requires exactly one input');
  const jobs = [];
  const targets = new Set();
  for (const input of inputs) {
    const name = path.basename(input).replace(/(?:\.spec)?\.json$/i, '');
    const output = path.resolve(values.output ?? path.join(values['out-dir'] ?? 'outputs', `${name}.png`));
    assert(output.toLowerCase().endsWith('.png'), 'Output must have a .png extension');
    const files = [output, ...(values.svg ? [output.replace(/\.png$/i, '.svg')] : [])];
    for (const file of files) {
      assert(!targets.has(file), `Duplicate output path: ${file}`);
      targets.add(file);
      assert(values.overwrite || !(await exists(file)), `Output exists: ${file}; use --overwrite to replace it`);
    }
    jobs.push({ input, output, scene: await loadScene(input) });
  }
  const renderer = await createRenderer();
  try {
    if (values['list-types']) console.log(JSON.stringify(await renderer.listTypes(), null, 2));
    for (const job of jobs) {
      const result = await renderer.render(job.scene, scale);
      await mkdir(path.dirname(job.output), { recursive: true });
      await writeFile(job.output, result.png, { flag: values.overwrite ? 'w' : 'wx' });
      if (values.svg) await writeFile(job.output.replace(/\.png$/i, '.svg'), result.svg, { flag: values.overwrite ? 'w' : 'wx' });
      console.log(JSON.stringify({ input: job.input, output: job.output, width: result.width, height: result.height,
        pngSha256: hash(result.png), resolvedSpecSha256: hash(JSON.stringify(job.scene)) }));
    }
  } finally { await renderer.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Render failed: ${error.message}`); process.exitCode = 1; });
}
