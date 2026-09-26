// Stage a complete, balanced revision. Publishing is a separate directory swap
// after the standard geometry/quality audits pass.
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildNested} from './nested-recipes.mjs';
import {loadGeographies} from './nested-geography.mjs';
import {loadBasis} from './basis-expansion.mjs';
import {orientParallelCharts} from './parallel-orientation.mjs';
import {varyBarDirections,barKinds,barFamily} from './bar-variation.mjs';
import {compileNested} from './nested-contracts.mjs';
import {compileTarget} from './compile.mjs';
import {createRenderer,loadScene} from './render.mjs';
import {reviewDocument} from './review.mjs';
const json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const name=process.argv[2];
if(!['composite-1100','nested-500','dataset-preview','dataset-complex','dataset-gallery'].includes(name))throw new Error('Specify a current generated dataset');
const input=path.resolve('outputs',name),out=path.resolve('outputs/.variation-stage',name),specDir=out+'-specs';
if((await readdir(out).catch(()=>[])).length)throw new Error('Staging directory must be empty');
await mkdir(path.dirname(out),{recursive:true});await cp(input,out,{recursive:true});await cp(input+'-specs',specDir,{recursive:true});
const manifest=await read(path.join(out,'manifest.json')),coverage=await read(path.join(specDir,'coverage.json'));
const nested=name==='nested-500',regions=nested?(await loadGeographies()).regions:null,basis=nested?await loadBasis('data'):null;
const rank=items=>[...items].sort((a,b)=>hash(`variation-924:${a}`).localeCompare(hash(`variation-924:${b}`)));
const descriptors=new Map(),types=new Map(),parallel=[],bars=[];
// First collect nested template IDs, then allocate equal quotas including fixed
// density histograms. A remainder of one is unavoidable for an odd population.
if(nested){
 const candidates=[];let fixed=0;
 for(const sample of manifest.samples){const p=await read(path.join(specDir,sample.sample_id+'.provenance.json'));descriptors.set(sample.sample_id,p);const job=buildNested(p.family_index,p.variant,regions,basis,924500);
  for(const c of job.annotation.charts.filter(c=>barKinds.includes(c.variation))){const cfg=job.plan.charts.find(d=>d.id===c.chart_id);if(cfg.options.distribution)fixed++;else candidates.push(`${sample.sample_id}/${c.chart_id}`);}
 }
 const total=candidates.length+fixed,quotas=barKinds.map((_,i)=>Math.floor(total/3)+(i<total%3?1:0));quotas[0]-=fixed;
 const assignments=barKinds.flatMap((k,i)=>Array.from({length:quotas[i]},()=>k));rank(candidates).forEach((key,i)=>types.set(key,assignments[i]));
}
for(const sample of manifest.samples){
 const id=sample.sample_id;let job;
 if(nested){const p=descriptors.get(id),barTypes=Object.fromEntries([...types].filter(([key])=>key.startsWith(id+'/')).map(([key,value])=>[key.split('/')[1],value]));job=buildNested(p.family_index,p.variant,regions,basis,924500,barTypes);}
 else job={annotation:await read(path.join(out,sample.annotation)),plan:await read(path.join(specDir,id+'.plan.json')),provenance:await read(path.join(specDir,id+'.provenance.json')).catch(()=>({}))};
 for(const c of job.annotation.charts)if(c.variation==='parallel_coordinates')parallel.push(`${id}/${c.chart_id}`);
 await writeFile(path.join(out,sample.annotation),json(job.annotation));await writeFile(path.join(specDir,id+'.plan.json'),json(job.plan));await writeFile(path.join(specDir,id+'.provenance.json'),json(job.provenance));
}
const parallelChoices=new Map(rank(parallel).map((key,i)=>[key,i<Math.floor(parallel.length/2)?'horizontal':'vertical']));
let fixedHorizontal=0;
for(const sample of manifest.samples){
 const id=sample.sample_id,job={annotation:await read(path.join(out,sample.annotation)),plan:await read(path.join(specDir,id+'.plan.json')),provenance:await read(path.join(specDir,id+'.provenance.json'))};
 orientParallelCharts(job,cid=>parallelChoices.get(`${id}/${cid}`));
 varyBarDirections(job,()=> 'vertical');
 for(const c of job.annotation.charts.filter(c=>barFamily.has(c.variation))){const cfg=job.plan.charts.find(d=>d.id===c.chart_id),opts=cfg.basis??cfg.options;bars.push({key:`${id}/${c.chart_id}`,fixed:!!opts.orientationConstraint,direction:opts.barOrientation});if(opts.orientationConstraint&&opts.barOrientation==='horizontal')fixedHorizontal++;}
 await writeFile(path.join(out,sample.annotation),json(job.annotation));await writeFile(path.join(specDir,id+'.plan.json'),json(job.plan));await writeFile(path.join(specDir,id+'.provenance.json'),json(job.provenance));
}
const free=rank(bars.filter(b=>!b.fixed).map(b=>b.key)),needed=Math.floor(bars.length/2)-fixedHorizontal;
if(needed<0||needed>free.length)throw new Error('Cannot satisfy balanced orientations with structural constraints');
const barChoices=new Map(free.map((key,i)=>[key,i<needed?'horizontal':'vertical']));
let renderer=await createRenderer(),changed=0;
try{
 for(const [index,sample] of manifest.samples.entries()){
  const id=sample.sample_id,job={annotation:await read(path.join(out,sample.annotation)),plan:await read(path.join(specDir,id+'.plan.json')),provenance:await read(path.join(specDir,id+'.provenance.json'))};
  varyBarDirections(job,cid=>barChoices.get(`${id}/${cid}`));
  const affected=nested||job.annotation.charts.some(c=>barFamily.has(c.variation)||c.variation==='parallel_coordinates');
  if(!affected)continue;
  const scene=(nested?compileNested:compileTarget)(job.annotation,job.plan),specPath=path.join(specDir,id+'.spec.json');
  job.provenance.variation_revision='balanced-directions-and-bars-2026-09-24';
  await writeFile(specPath,json(scene));await writeFile(path.join(specDir,id+'.plan.json'),json(job.plan));await writeFile(path.join(specDir,id+'.provenance.json'),json(job.provenance));
  if(changed&&changed%25===0){await renderer.close();renderer=await createRenderer();}
  const result=await renderer.render(await loadScene(specPath));
  await writeFile(path.join(out,sample.image),result.png);await writeFile(path.join(out,sample.annotation),json(job.annotation));await writeFile(path.join(specDir,id+'.svg'),result.svg);
  sample.image_sha256=hash(result.png);sample.annotation_sha256=hash(json(job.annotation));
  const cv=coverage.samples.find(c=>c.sample_id===id);
  Object.assign(cv,{width:scene.width,height:scene.height,variations:job.annotation.charts.map(c=>c.variation),repetition_dimensions:job.annotation.charts.map(c=>c.repetition_position.length),spec_sha256:hash(json(scene)),svg_sha256:hash(result.svg),provenance:id+'.provenance.json',composition:scene.composition});
  if(nested)Object.assign(cv,{row_count:job.plan.datasets.reduce((sum,d)=>sum+d.rows.length,0),physical_nested_instances:(result.svg.match(/data-offline-nested-anchor=/g)??[]).length});
  if(cv.render_backends)cv.render_backends=scene.charts.filter(c=>!c.layoutOnly).map(c=>({chart_id:c.id,backend:c.spec.chartType==='OfflineBasisIdiom'?'offline-basis-d3-v1':c.parallel?.axisOrientation==='horizontal'?'offline-parallel-d3-v1':c.geo?'offline-geographic-mercator':c.nodeChart?'native-force-links':'native-visbricks'}));
  changed++;if(changed%10===0)console.log(`${name}: rendered ${changed}, scanned ${index+1}/${manifest.samples.length}`);
 }
 const files=['parallel-orientation.mjs','parallel-renderer.ts','bar-variation.mjs','basis-expansion.mjs','basis-renderer.ts','nested-recipes.mjs','nested-renderer.ts','native-quality.mjs','extended-contracts.mjs','renderer.ts','refresh-variations.mjs'];
 const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(new URL(f,import.meta.url)))])));
 const revision={revision:'balanced-directions-and-bars-2026-09-24',changed_samples:changed,parallel_axes:{horizontal:Math.floor(parallel.length/2),vertical:Math.ceil(parallel.length/2)},bar_directions:{horizontal:Math.floor(bars.length/2),vertical:Math.ceil(bars.length/2)},fixed_bar_directions:bars.filter(b=>b.fixed).length,source_hashes:sources};
 manifest.status='generated_pending_review';coverage.variation_revision=revision;
 await writeFile(path.join(out,'manifest.json'),json(manifest));await writeFile(path.join(specDir,'coverage.json'),json(coverage));await writeFile(path.join(specDir,'variation-revision.json'),json(revision));
 await writeFile(path.join(specDir,'review.html'),reviewDocument(manifest.samples,coverage.samples,out,specDir));
 console.log(JSON.stringify(revision));
}finally{await renderer.close();}
