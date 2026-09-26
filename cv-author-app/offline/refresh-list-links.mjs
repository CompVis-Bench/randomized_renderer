import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {listCandidates,applyListLinks,listLinkRevision} from './list-links.mjs';import {linkSeed} from './link-variation.mjs';import {compileTarget} from './compile.mjs';import {createRenderer,loadScene} from './render.mjs';
const root=path.resolve('outputs'),input=root+'/composite-1100',out=path.resolve(process.env.LIST_STAGE??'outputs/.list-link-stage')+'/composite-1100',specs=out+'-specs';
const read=async f=>JSON.parse(await readFile(f,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
const manifest=await read(input+'/manifest.json'),coverage=await read(input+'-specs/coverage.json'),all=[];
for(const sample of manifest.samples){const id=sample.sample_id,job={annotation:await read(input+'-specs/'+id+'.render-annotation.json'),plan:await read(input+'-specs/'+id+'.plan.json'),provenance:await read(input+'-specs/'+id+'.provenance.json')};all.push({sample,job,candidates:listCandidates(job),existing:job.annotation.charts.filter(c=>c.variation==='link').length});}
const eligible=all.filter(j=>j.candidates.length>=2&&j.job.annotation.charts.filter(c=>c.variation!=='link').length<=4).sort((a,b)=>Number(!!b.existing)-Number(!!a.existing)||linkSeed(a.sample.sample_id)-linkSeed(b.sample.sample_id));
if(eligible.length<100)throw new Error(`Only ${eligible.length} list candidates`);
const selection=new Map(eligible.slice(0,100).map((j,i)=>[j.sample.sample_id,i%2?'top-bottom':'left-right']));
const jobs=all.filter(j=>j.existing||selection.has(j.sample.sample_id));
console.log(JSON.stringify({eligible:eligible.length,selected:selection.size,jobs:jobs.length,removed:jobs.length-100,retained_existing:eligible.slice(0,100).filter(j=>j.existing).length}));
for(const d of [out+'/images',out+'/annotations',specs])await mkdir(d,{recursive:true});
const report={revision:listLinkRevision,scope:'composite-1100; nested-500 unchanged',selection:Object.fromEntries(selection),samples:[],issues:[]},samples=[],cv=[];
const signature=hash((await Promise.all(['list-links.mjs','basis-renderer.ts','refresh-list-links.mjs'].map(f=>readFile(new URL(f,import.meta.url),'utf8')))).join('\n'));
let renderer=await createRenderer(),rendered=0;
try{for(const j of jobs.slice(0,Number(process.env.LIST_LIMIT??Infinity))){
 const {sample,job}=j,id=sample.sample_id,enabled=selection.has(id),change=applyListLinks(job,{enabled,orientation:selection.get(id),pair:j.candidates.slice(0,2)}),checkpoint=specs+'/'+id+'.list-checkpoint.json';
 let item;try{item=await read(checkpoint);if(item.signature!==signature||item.original_image_sha256!==sample.image_sha256||item.original_annotation_sha256!==sample.annotation_sha256)item=null;}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!item){
  const scene=compileTarget(job.annotation,job.plan),sp=specs+'/'+id+'.spec.json';await writeFile(sp,json(scene));
  if(rendered&&rendered%20===0){await renderer.close();renderer=await createRenderer();}rendered++;
  const result=await renderer.render(await loadScene(sp));await writeFile(out+'/'+sample.image,result.png);await copyFile(input+'/'+sample.annotation,out+'/'+sample.annotation);
  for(const [ext,x] of [['plan',job.plan],['render-annotation',job.annotation],['provenance',job.provenance]])await writeFile(specs+'/'+id+'.'+ext+'.json',json(x));await writeFile(specs+'/'+id+'.svg',result.svg);
  item={signature,original_image_sha256:sample.image_sha256,original_annotation_sha256:sample.annotation_sha256,sample:{...sample,image_sha256:hash(result.png)},coverage:{...coverage.samples.find(s=>s.sample_id===id),width:scene.width,height:scene.height,spec_sha256:hash(json(scene)),svg_sha256:hash(result.svg),composition:scene.composition,row_count:job.plan.datasets.reduce((n,d)=>n+d.rows.length,0)},change};await writeFile(checkpoint,json(item));
 }
 samples.push(item.sample);cv.push(item.coverage);report.samples.push({id,original_image_sha256:item.original_image_sha256,original_annotation_sha256:item.original_annotation_sha256,change:item.change});
 console.log(`${samples.length}/${jobs.length} ${id} ${change.action} ${change.orientation??''}`);
}
 await writeFile(out+'/manifest.json',json({...manifest,sample_count:samples.length,samples}));await writeFile(specs+'/coverage.json',json({...coverage,samples:cv}));await writeFile(specs+'/list-link-revision.json',json(report));
}finally{await renderer.close();}
