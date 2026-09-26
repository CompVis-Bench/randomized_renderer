import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {varyLinks,linkSeed,linkRevision} from './link-variation.mjs';
import {compileTarget} from './compile.mjs';
import {compileNested} from './nested-contracts.mjs';
import {createRenderer,loadScene} from './render.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
const stage=path.resolve(process.env.LINK_STAGE??'outputs/.link-stage'),limit=Number(process.env.LINK_LIMIT??Infinity),jobs=[];
for(const dataset of ['composite-1100','nested-500']){
 const input=path.resolve('outputs',dataset),m=await read(input+'/manifest.json'),cv=await read(input+'-specs/coverage.json');
 for(const sample of m.samples){
  const id=sample.sample_id,dir=input+'-specs/'+id,annotation=await read(dir+'.render-annotation.json');
  if(!annotation.charts.some(c=>c.variation==='link'))continue;
  const job={annotation,plan:await read(dir+'.plan.json'),provenance:await read(dir+'.provenance.json')};
  const changes=varyLinks(job);jobs.push({dataset,input,sample,job,changes,manifest:m,coverage:cv});
 }
}
// Balance styles within each relationship, and globally. One style per link MG.
const styles=new Map();let next=0;
for(const relation of ['rmg-rmg','within-rmg','mg-rmg','mg-mg']){
 const entries=jobs.flatMap(j=>j.changes.filter(c=>c.relation===relation).map(c=>({key:j.sample.sample_id+'/'+c.chart})));
 entries.sort((a,b)=>linkSeed(a.key)-linkSeed(b.key));
 for(const e of entries)styles.set(e.key,next++%2?'bezier':'straight');
}
const reports=new Map(),done=new Map();let renderer=await createRenderer(),n=0;
try{
 for(const j of jobs.slice(0,limit)){
  const {dataset,input,sample,job,manifest,coverage}=j,id=sample.sample_id,out=stage+'/'+dataset,specs=out+'-specs';
  await mkdir(out+'/images',{recursive:true});await mkdir(out+'/annotations',{recursive:true});await mkdir(specs,{recursive:true});
  if(!reports.has(dataset)){reports.set(dataset,{revision:linkRevision,samples:[],issues:[],styles:{},relations:{}});done.set(dataset,{manifest:{...manifest,samples:[]},coverage:{...coverage,samples:[]}});}
  const report=reports.get(dataset),d=done.get(dataset);
  for(const c of j.changes){c.style=styles.get(id+'/'+c.chart);const cfg=job.plan.charts.find(x=>x.id===c.chart);(cfg.basis??cfg.options).link.style=c.style;report.styles[c.style]=(report.styles[c.style]??0)+1;report.relations[c.relation]=(report.relations[c.relation]??0)+1;}
  let scene=(dataset==='nested-500'?compileNested:compileTarget)(job.annotation,job.plan);const specPath=specs+'/'+id+'.spec.json';
  await writeFile(specPath,json(scene));
  if(n&&n%20===0){await renderer.close();renderer=await createRenderer();}
  if(dataset==='composite-1100'){
   const preview=await renderer.renderSvg(await loadScene(specPath));
   for(const c of j.changes){
    const cfg=job.plan.charts.find(x=>x.id===c.chart),ds=job.plan.datasets.find(d=>d.id===cfg.datasetId),visible=new Set();
    for(const m of preview.matchAll(/<path\b[^>]*data-link-chart="([^"]+)"[^>]*>/g))if(m[1]===c.chart)visible.add(m[0].match(/data-row="([^"]+)"/)[1]);
    ds.rows=ds.rows.filter(r=>visible.has(String(r._row)));if(!ds.rows.length)throw new Error(id+': empty links after visibility filtering');
    cfg.basis.link.materialized=true;c.candidate_edges=c.edges;c.edges=ds.rows.length;
   }
   job.provenance.row_counts=Object.fromEntries(job.plan.datasets.map(d=>[d.id,d.rows.length]));
   scene=compileTarget(job.annotation,job.plan);await writeFile(specPath,json(scene));
  }
  const rendered=await renderer.render(await loadScene(specPath));
  await writeFile(out+'/'+sample.image,rendered.png);
  // Preserve the v5 source until the image-grounded label projection below.
  await writeFile(out+'/'+sample.annotation,await readFile(input+'/'+sample.annotation));
  for(const [ext,value] of [['plan',job.plan],['render-annotation',job.annotation],['provenance',job.provenance]])await writeFile(specs+'/'+id+'.'+ext+'.json',json(value));
  await writeFile(specs+'/'+id+'.svg',rendered.svg);
  d.manifest.samples.push({...sample,image_sha256:hash(rendered.png)});
  d.coverage.samples.push({...coverage.samples.find(s=>s.sample_id===id),spec_sha256:hash(json(scene)),svg_sha256:hash(rendered.svg),composition:scene.composition,row_count:job.plan.datasets.reduce((n,d)=>n+d.rows.length,0)});
  report.samples.push({id,original_image_sha256:sample.image_sha256,original_annotation_sha256:sample.annotation_sha256,changes:j.changes});
  console.log(`${++n}/${Math.min(limit,jobs.length)} ${id} ${j.changes.map(c=>c.relation+':'+c.style).join(', ')}`);
 }
 for(const [dataset,d] of done){const out=stage+'/'+dataset;d.manifest.sample_count=d.manifest.samples.length;await writeFile(out+'/manifest.json',json(d.manifest));await writeFile(out+'-specs/coverage.json',json(d.coverage));await writeFile(out+'-specs/link-revision.json',json(reports.get(dataset)));}
}finally{await renderer.close();}
