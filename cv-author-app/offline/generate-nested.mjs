import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {loadGeographies} from './nested-geography.mjs';
import {buildNested,nestedFamilies,operationNames} from './nested-recipes.mjs';
import {createRenderer,loadScene} from './render.mjs';
import {loadBasis} from './basis-expansion.mjs';
import {reviewDocument} from './review.mjs';
const json=v=>JSON.stringify(v,null,2)+'\n',hash=v=>createHash('sha256').update(v).digest('hex');
const {values}=parseArgs({options:{out:{type:'string',default:'outputs/nested-500'},count:{type:'string',default:'25'},families:{type:'string'},variants:{type:'string'},seed:{type:'string',default:'924500'},resume:{type:'boolean'},refresh:{type:'boolean'},'plan-only':{type:'boolean'}}});
const out=path.resolve(values.out),specDir=out+'-specs',seed=Number(values.seed),count=Number(values.count);
const families=values.families?values.families.split(',').map(Number):nestedFamilies.map((_,i)=>i);
const variants=values.variants?values.variants.split(',').map(Number):Array.from({length:count},(_,i)=>i);
if(families.some(i=>!Number.isInteger(i)||i<0||i>=20)||variants.some(i=>!Number.isInteger(i)||i<0||i>=25)||!Number.isInteger(seed))throw new Error('Invalid parameters');
if(values.refresh&&values.resume)throw new Error('Choose refresh or resume');
for(const dir of [out,specDir]){try{if((await readdir(dir)).length&&!values.resume&&!values.refresh)throw new Error(`Output exists: ${dir}`);}catch(e){if(e.code!=='ENOENT')throw e;}}
const geo=await loadGeographies(),basis=await loadBasis('data'),jobs=families.flatMap(f=>variants.map(v=>[f,v]));
const codeFiles=['parallel-orientation.mjs','parallel-renderer.ts','bar-variation.mjs','quality-rules.mjs','nested-contracts.mjs','nested-layout.mjs','nested-geography.mjs','nested-recipes.mjs','nested-renderer.ts','generate-nested.mjs','render.mjs','renderer.ts','../package-lock.json'];
const codeHashes=Object.fromEntries(await Promise.all(codeFiles.map(async f=>[f,hash(await readFile(new URL(f,import.meta.url)))])));
const config={seed,families,variants,code_hashes:codeHashes};
await mkdir(path.join(out,'images'),{recursive:true});await mkdir(path.join(out,'annotations'),{recursive:true});await mkdir(specDir,{recursive:true});
if(values.resume){if(JSON.stringify(JSON.parse(await readFile(path.join(specDir,'run.json'))))!==JSON.stringify(config))throw new Error('Resume configuration or code differs');}
else {if(values.refresh){const previous=JSON.parse(await readFile(path.join(specDir,'run.json')));for(const key of ['seed','families','variants'])if(JSON.stringify(previous[key])!==JSON.stringify(config[key]))throw new Error('Refresh may only replace the exact same sample IDs/seed');}await writeFile(path.join(specDir,'run.json'),json(config));}
await writeFile(path.join(specDir,'geographic-sources.json'),json({...geo.source,regions:geo.regions.map(r=>({id:r.id,name:r.name,subdivisions:r.geometry.features.length}))}));
let renderer=values['plan-only']?null:await createRenderer();const samples=[],coverage=[],checks=[];
try{
 for(const [i,[f,v]] of jobs.entries()){
  const job=buildNested(f,v,geo.regions,basis,seed),{annotation,plan,scene,provenance}=job,id=annotation.sample_id;
  const imagePath=`images/${id}.png`,annotationPath=`annotations/${id}.json`,specPath=path.join(specDir,`${id}.spec.json`);
  for(const [file,data] of [[path.join(out,annotationPath),annotation],[specPath,scene],[path.join(specDir,`${id}.plan.json`),plan],[path.join(specDir,`${id}.provenance.json`),provenance]]){
   const content=json(data);if(values.resume){try{if(await readFile(file,'utf8')!==content)throw new Error('Resume content mismatch');continue;}catch(e){if(e.code!=='ENOENT')throw e;}}await writeFile(file,content,{flag:values.refresh?'w':'wx'});
  }
  if(!renderer)continue;
  let png,svg;try{if(values.resume){png=await readFile(path.join(out,imagePath));svg=await readFile(path.join(specDir,`${id}.svg`),'utf8');}}catch(e){if(e.code!=='ENOENT')throw e;png=null;}
  if(!png){
   if(i&&i%30===0){await renderer.close();renderer=await createRenderer();}
   const loaded=await loadScene(specPath),result=await renderer.render(loaded);({png,svg}=result);
   await writeFile(path.join(out,imagePath),png);await writeFile(path.join(specDir,`${id}.svg`),svg);
  }
  const missing=annotation.charts.filter(c=>!svg.includes(`data-offline-chart="${c.chart_id}"`));if(missing.length)throw new Error(`${id}: missing rendered templates`);
  const nestedCount=(svg.match(/data-offline-nested-anchor=/g)||[]).length;if(!nestedCount)throw new Error(`${id}: no actual nested placements`);
  const texts=[...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]+>/g,''));if(texts.some(t=>/\b[FC]\d+\b|chart|boxplot|heatmap/i.test(t)))throw new Error(`${id}: forbidden visible labels`);
  const regions=provenance.geographies,sourceSamples=[...new Set(Object.values(provenance.variation_sources).flat())];
  samples.push({sample_id:id,image:imagePath,image_sha256:hash(png),annotation:annotationPath,annotation_sha256:hash(json(annotation))});
  coverage.push({sample_id:id,recipe:provenance.family,operation:provenance.operation,source_samples:sourceSamples,variations:annotation.charts.map(c=>c.variation),repetition_dimensions:annotation.charts.map(c=>c.repetition_position.length),geographies:regions,width:scene.width,height:scene.height,row_count:provenance.row_count,physical_nested_instances:nestedCount,provenance:`${id}.provenance.json`,spec_sha256:hash(json(scene)),svg_sha256:hash(svg)});
  checks.push({sample_id:id,nested_instances:nestedCount,template_count:annotation.charts.length,nonfinite:false,visible_identifiers:false});
  if((i+1)%5===0||i===jobs.length-1)console.log(`[${i+1}/${jobs.length}] ${id} ${scene.width}×${scene.height} anchors=${nestedCount}`);
 }
 if(renderer){
  if(new Set(samples.map(s=>s.image_sha256)).size!==samples.length)throw new Error('Duplicate PNG outputs');
  const manifest={dataset_id:`nested_composites_${samples.length}_s${seed}`,format_version:'chart_encoding_variation_only_v3',annotation_version:'spatial_nested_v1',status:'generated_pending_review',sample_count:samples.length,categories:families.map(f=>({id:f+1,operation:nestedFamilies[f],count:variants.length})),samples};
  await writeFile(path.join(out,'manifest.json'),json(manifest));
  await writeFile(path.join(specDir,'coverage.json'),json({config,renderer:'offline-nested-d3-v1',versions:renderer.versions,geography_source:geo.source,notes:'True spatial anchoring. Novel explicit constructions; not source pixel reconstructions. Historical boundaries, synthetic statistical values. Human semantic review remains available.',samples:coverage}));
  await writeFile(path.join(specDir,'checks.json'),json({samples:checks.length,passed:true,checks}));
  await writeFile(path.join(specDir,'review.html'),reviewDocument(samples,coverage,out,specDir));
  await writeFile(path.join(out,'annotation_guidelines.md'),await readFile(new URL('./annotation_guidelines.md',import.meta.url)));
 }
 console.log(`Completed ${jobs.length}: ${out}`);
}finally{await renderer?.close();}
