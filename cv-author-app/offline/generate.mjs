#!/usr/bin/env node
import {applyNativeQuality} from './native-quality.mjs';
import {rng} from './basis-expansion.mjs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { compileTarget } from './compile.mjs';
import { buildRecipe, targetRecipes, basicRecipeNames, complexRecipeNames, galleryRecipeNames } from './recipes.mjs';
import { loadScene, createRenderer } from './render.mjs';
import { reviewDocument } from './review.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const { values } = parseArgs({ options: {
  out: { type: 'string', default: 'outputs/dataset-preview' }, 'spec-dir': { type: 'string' },
  variants: { type: 'string', default: '3' }, seed: { type: 'string', default: '23' },
  recipes: { type: 'string' }, suite: { type: 'string', default: 'basic' }, svg: { type: 'boolean' }, review: { type: 'boolean' }, scale: { type: 'string', default: '1' }, help: { type: 'boolean', short: 'h' },
} });
async function requireEmpty(directory) {
  try { if ((await readdir(directory)).length) throw new Error(`Refusing nonempty output directory: ${directory}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function main() {
  if (values.help) {
    console.log(`node cv-author-app/offline/generate.mjs --out outputs/dataset-preview --variants 3 --seed 23
  [--suite basic|complex|gallery|all] [--recipes ${Object.keys(targetRecipes).join(',')}]
  [--scale 2] [--spec-dir PATH] [--svg] [--review]

Generates v3 annotations, PNGs, manifest.json. Construction plans/specs, optional
SVGs/review.html and coverage.json are saved in a separate sibling directory.
Never overwrites data.`);
    return;
  }
  const variants = Number(values.variants);
  const seed = Number(values.seed);
  const scale = Number(values.scale);
  if (!Number.isInteger(variants) || variants < 1 || variants > 100) throw new Error('variants must be in [1, 100]');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('seed must be an unsigned 32-bit integer');
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4) throw new Error('scale must be in (0, 4]');
  if (!['basic', 'complex', 'gallery', 'all'].includes(values.suite)) throw new Error('suite must be basic, complex, gallery, or all');
  const names = values.recipes ? values.recipes.split(',') : values.suite === 'basic' ? basicRecipeNames : values.suite === 'complex' ? complexRecipeNames : values.suite === 'gallery' ? galleryRecipeNames : Object.keys(targetRecipes);
  if (!names.length || new Set(names).size !== names.length || names.some((name) => !targetRecipes[name])) throw new Error('Unknown or duplicate recipe');
  const out = path.resolve(values.out);
  const specDir = path.resolve(values['spec-dir'] ?? `${values.out}-specs`);
  if (out === specDir || specDir.startsWith(`${out}${path.sep}`) || out.startsWith(`${specDir}${path.sep}`)) throw new Error('Dataset and spec directories must be separate');
  await requireEmpty(out);
  await requireEmpty(specDir);
  // Do not even create an output tree until the offline renderer can launch.
  const renderer = await createRenderer();
  try {
    await mkdir(path.join(out, 'images'), { recursive: true });
    await mkdir(path.join(out, 'annotations'), { recursive: true });
    await mkdir(specDir, { recursive: true });
    const samples = [];
    const coverage = [];
    for (const [recipeIndex, name] of names.entries()) {
      for (let variant = 0; variant < variants; variant += 1) {
        const caseSeed = (seed + Object.keys(targetRecipes).indexOf(name) * 100003 + variant * 1009) >>> 0;
        const { annotation, plan, level } = applyNativeQuality(buildRecipe(name, variant, caseSeed),rng(caseSeed+731991));
        const id = `synthetic-${name}-s${seed}-${String(variant + 1).padStart(3, '0')}`;
        annotation.sample_id = id;
        // Compile from the target, then render; never infer labels from the PNG.
        const scene = compileTarget(annotation, plan);
        const specPath = path.join(specDir, `${id}.spec.json`);
        await writeFile(specPath, json(scene), { flag: 'wx' });
        await writeFile(path.join(specDir, `${id}.plan.json`), json(plan), { flag: 'wx' });
        const result = await renderer.render(await loadScene(specPath), scale);
        if (values.svg) await writeFile(path.join(specDir, `${id}.svg`), result.svg, { flag: 'wx' });
        const imagePath = `images/${id}.png`;
        const annotationPath = `annotations/${id}.json`;
        const annotationText = json(annotation);
        await writeFile(path.join(out, imagePath), result.png, { flag: 'wx' });
        await writeFile(path.join(out, annotationPath), annotationText, { flag: 'wx' });
        samples.push({ sample_id: id, image: imagePath, image_sha256: digest(result.png), annotation: annotationPath, annotation_sha256: digest(annotationText) });
        coverage.push({ sample_id: id, recipe: name, complexity_level: level, seed: caseSeed,
          palette: plan.appearance.palette, point_shape: plan.appearance.pointShape,
          native_chart_types: scene.charts.filter((chart) => !chart.layoutOnly && !chart.geo && !chart.nodeChart && !chart.spec.chartType.startsWith('Offline')).map((chart) => chart.spec.chartType),
          render_backends: scene.charts.filter(chart=>!chart.layoutOnly).map(chart=>({chart_id:chart.id,backend:chart.spec.chartType==='OfflineBasisIdiom'?'offline-basis-d3-v1':chart.parallel?.axisOrientation==='horizontal'?'offline-parallel-d3-v1':chart.geo?'offline-geographic-mercator':chart.nodeChart?'native-force-links':'native-visbricks'})),
          composition: scene.composition,
          variations: annotation.charts.map((chart) => chart.variation),
          repetition_dimensions: annotation.charts.map((chart) => chart.repetition_position.length),
          spec_sha256: digest(json(scene)), width: result.width, height: result.height });
        console.log(`[${recipeIndex * variants + variant + 1}/${names.length * variants}] ${id}`);
      }
    }
    const manifest = { dataset_id: `visbricks_synthetic_seed_${seed}`, format_version: 'chart_encoding_variation_only_v3',
      annotation_version: 'synthetic_target_v3', status: 'generated_pending_review', sample_count: samples.length, samples };
    await writeFile(path.join(out, 'annotation_guidelines.md'),
      await readFile(new URL('./annotation_guidelines.md', import.meta.url)), { flag: 'wx' });
    await writeFile(path.join(out, 'manifest.json'), json(manifest), { flag: 'wx' });
    const rendererSource = JSON.parse(await readFile(new URL('./vendor/source.json', import.meta.url), 'utf8'));
    const sourceFiles = ['parallel-orientation.mjs','parallel-renderer.ts','bar-variation.mjs','quality-rules.mjs', 'native-quality.mjs', 'renderer.ts', 'render.mjs', 'composition.mjs', 'compile.mjs', 'recipes.mjs', 'complex-recipes.mjs', 'gallery-recipes.mjs', 'extended-contracts.mjs', 'extended-renderer.ts', 'assets/source.json', 'assets/manhattan.geojson', 'generate.mjs', 'review.mjs', 'vendor/source.json', '../package-lock.json'];
    const offlineSources = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, digest(await readFile(new URL(file, import.meta.url)))])));
    await writeFile(path.join(specDir, 'coverage.json'), json({ seed, renderer_source: rendererSource.commit,
      versions: renderer.versions, offline_sources_sha256: offlineSources,
      note: 'Prototype coverage levels describe these construction recipes, not a validated universal complexity metric. Visual review is required.', samples: coverage }), { flag: 'wx' });
    if (values.review) await writeFile(path.join(specDir, 'review.html'), reviewDocument(samples, coverage, out, specDir), { flag: 'wx' });
    console.log(`Dataset: ${out}\nSpecs and coverage: ${specDir}`);
  } finally { await renderer.close(); }
}
main().catch((error) => { console.error(`Generation failed: ${error.message}`); process.exitCode = 1; });
