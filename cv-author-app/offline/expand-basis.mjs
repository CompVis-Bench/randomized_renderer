#!/usr/bin/env node
import {mkdir,readFile,writeFile,readdir,appendFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {loadBasis,buildExpansion,expansionKinds,expansionLabels,densityProfile} from './basis-expansion.mjs';
import {createRenderer,loadScene} from './render.mjs';
import {reviewDocument} from './review.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
const {values}=parseArgs({options:{out:{type:'string',default:'outputs/composite-1100'},basis:{type:'string',default:'data'},count:{type:'string',default:'100'},seed:{type:'string',default:'240924'},kinds:{type:'string'},resume:{type:'boolean'},'plan-only':{type:'boolean'},help:{type:'boolean'}}});
async function main(){
 if(values.help){console.log('node cv-author-app/offline/expand-basis.mjs --out outputs/composite-1100 [--count 100] [--seed 240924] [--kinds 1,2,...,11] [--resume] [--plan-only]');return;}
 const out=path.resolve(values.out),specDir=out+'-specs',count=Number(values.count),seed=Number(values.seed),kinds=values.kinds?values.kinds.split(',').map(n=>Number(n)-1):expansionKinds.map((_,i)=>i);
 if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(seed)||kinds.some(k=>!Number.isInteger(k)||k<0||k>10)||new Set(kinds).size!==kinds.length)throw new Error('Invalid count, seed or kinds');
 const basis=await loadBasis(values.basis),geometry=JSON.parse(await readFile(new URL('./assets/manhattan.geojson',import.meta.url),'utf8'));
 const jobs=kinds.flatMap(k=>Array.from({length:count},(_,i)=>({kind:k,index:i})));
 for(const dir of [out,specDir]){try{if((await readdir(dir)).length&&!values.resume)throw new Error(`Refusing nonempty output: ${dir}; use --resume for the same job`);}catch(e){if(e.code!=='ENOENT')throw e;}}
 const config={count,seed,kinds,density_profile:densityProfile,show_field_labels:false,basis_manifest_sha256:hash(await readFile(path.join(values.basis,'manifest.json')))};
 if(values.resume){const saved=JSON.parse(await readFile(path.join(specDir,'run.json'),'utf8'));if(JSON.stringify(saved)!==JSON.stringify(config))throw new Error('Resume configuration differs');}
 let renderer=values['plan-only']?null:await createRenderer();
 let renderedSinceRestart=0;
 try{
  await mkdir(path.join(out,'images'),{recursive:true});await mkdir(path.join(out,'annotations'),{recursive:true});await mkdir(specDir,{recursive:true});
  if(!values.resume)await writeFile(path.join(specDir,'run.json'),json(config),{flag:'wx'});
  const samples=[],coverage=[];
  for(const [j,descriptor] of jobs.entries()){
   const job=buildExpansion(basis,descriptor.kind,descriptor.index,seed,geometry);
   const {annotation,plan,scene,provenance}=job,id=annotation.sample_id;
   const specPath=path.join(specDir,`${id}.spec.json`),annotationPath=`annotations/${id}.json`,imagePath=`images/${id}.png`;
   for(const [p,obj] of [[specPath,scene],[path.join(specDir,`${id}.plan.json`),plan],[path.join(specDir,`${id}.provenance.json`),provenance],[path.join(out,annotationPath),annotation]]){
    const content=json(obj);if(values.resume){try{if(await readFile(p,'utf8')!==content)throw new Error(`Resume content mismatch: ${p}`);continue;}catch(e){if(e.code!=='ENOENT')throw e;}}
    await writeFile(p,content,{flag:'wx'});
   }
   if(!renderer)continue;
   let png,svg;const svgPath=path.join(specDir,`${id}.svg`);
   if(values.resume){try{png=await readFile(path.join(out,imagePath));svg=await readFile(svgPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;png=null;}}
   if(!png){
    // Large canvas backing stores can outlive individual browser evaluations.
    // Recycle the browser regularly while retaining deterministic specs on disk.
    if(renderedSinceRestart>=25){await renderer.close();renderer=await createRenderer();renderedSinceRestart=0;}
    const loaded=await loadScene(specPath);let result;
    try{result=await renderer.render(loaded);}catch(error){
     if(!/Target page, context or browser has been closed|Target crashed|Page crashed/.test(error.message))throw error;
     await renderer.close().catch(()=>{});renderer=await createRenderer();renderedSinceRestart=0;
     result=await renderer.render(loaded);
    }
    renderedSinceRestart++;png=result.png;svg=result.svg;
    if(/(?:NaN|Infinity)/.test(svg))throw new Error(`${id}: invalid SVG coordinate`);
    await writeFile(path.join(out,imagePath),png);await writeFile(svgPath,svg);
   }
   const missing=annotation.charts.filter(c=>!svg.includes(`data-offline-chart="${c.chart_id}"`));if(missing.length)throw new Error(`${id}: missing rendered charts`);
   samples.push({sample_id:id,image:imagePath,image_sha256:hash(png),annotation:annotationPath,annotation_sha256:hash(json(annotation))});
   coverage.push({sample_id:id,recipe:provenance.operation,seed:provenance.seed,source_samples:provenance.sources.map(s=>s.sample_id),variations:annotation.charts.map(c=>c.variation),repetition_dimensions:annotation.charts.map(c=>c.repetition_position.length),width:scene.width,height:scene.height,spec_sha256:hash(json(scene)),svg_sha256:hash(svg),row_counts:provenance.row_counts,density_profile:densityProfile.name,renderer:'offline-basis-d3-v1',provenance:`${id}.provenance.json`});
   if((j+1)%10===0||j===jobs.length-1)console.log(`[${j+1}/${jobs.length}] ${id} ${scene.width}×${scene.height}`);
  }
  if(!renderer){console.log(`Prepared ${jobs.length} target/plan/spec files`);return;}
  const manifest={dataset_id:`basis_expanded_${samples.length}_s${seed}`,format_version:'chart_encoding_variation_only_v3',annotation_version:'basis_preserving_expansion_v3',status:'generated_pending_review',sample_count:samples.length,categories:kinds.map(k=>({id:k+1,operation:expansionKinds[k],description:expansionLabels[k],count})),samples};
  const sourceFiles=['parallel-orientation.mjs','parallel-renderer.ts','bar-variation.mjs','quality-rules.mjs','basis-expansion.mjs','basis-contracts.mjs','basis-renderer.ts','expand-basis.mjs','compile.mjs','composition.mjs','renderer.ts','render.mjs','../package-lock.json','assets/manhattan.geojson'];
  const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,hash(await readFile(new URL(f,import.meta.url)))])));
  await writeFile(path.join(out,'manifest.json'),json(manifest));await writeFile(path.join(out,'annotation_guidelines.md'),await readFile(new URL('./annotation_guidelines.md',import.meta.url)));
  await writeFile(path.join(specDir,'coverage.json'),json({versions:renderer.versions,config,source_hashes:sources,basis_source_count:new Set(coverage.flatMap(c=>c.source_samples)).size,notes:'Synthetic data and reconstructed layouts. New D3 adapters are explicitly identified, not claimed as native VisBricks exports. Source annotations are preserved under field/chart ID maps. Human visual review remains required.',samples:coverage}));
  await writeFile(path.join(specDir,'review.html'),reviewDocument(samples,coverage,out,specDir));
  console.log(`Completed ${samples.length} samples: ${out}`);
 }finally{await renderer?.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
