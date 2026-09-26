import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {varyParallelGeometry} from './parallel-variation.mjs';import {reflowParallelGeometry} from './parallel-layout.mjs';import {compileTarget} from './compile.mjs';import {createRenderer,loadScene} from './render.mjs';
const input=path.resolve('outputs/composite-1100'),out=path.resolve('outputs/.parallel-stage/composite-1100'),specDir=out+'-specs',read=async f=>JSON.parse(await readFile(f,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
await mkdir(path.join(out,'images'),{recursive:true});await mkdir(path.join(out,'annotations'),{recursive:true});await mkdir(specDir,{recursive:true});
const manifest=await read(path.join(input,'manifest.json')),coverage=await read(path.join(input+'-specs','coverage.json')),jobs=[];
for(const sample of manifest.samples){const annotation=await read(path.join(input,sample.annotation));if(annotation.charts.some(c=>c.variation==='parallel_coordinates'))jobs.push({sample,annotation});}
const rank=[...jobs].sort((a,b)=>hash(`parallel-style-924/${a.sample.sample_id}`).localeCompare(hash(`parallel-style-924/${b.sample.sample_id}`))),styles=new Map(rank.map((j,i)=>[j.sample.sample_id,i<Math.floor(rank.length/2)?'bezier':'straight']));
const selected=[],cv=[],report={revision:'parallel-geometry-v2-2026-09-24',scope:'composite-1100 only',style_unit:'one style per image',samples:[]};let renderer=await createRenderer();
try{for(const {sample,annotation} of jobs){const id=sample.sample_id,job={annotation,plan:await read(path.join(input+'-specs',id+'.plan.json')),provenance:await read(path.join(input+'-specs',id+'.provenance.json'))};
 const changes=varyParallelGeometry(job,()=>styles.get(id));reflowParallelGeometry(job);
 const spec=compileTarget(annotation,job.plan),specPath=path.join(specDir,id+'.spec.json');await writeFile(specPath,json(spec));
 if(report.samples.length&&report.samples.length%20===0){await renderer.close();renderer=await createRenderer();}
 const rendered=await renderer.render(await loadScene(specPath));
 await writeFile(path.join(out,sample.image),rendered.png);await writeFile(path.join(out,sample.annotation),json(annotation));await writeFile(path.join(specDir,id+'.plan.json'),json(job.plan));await writeFile(path.join(specDir,id+'.provenance.json'),json(job.provenance));await writeFile(path.join(specDir,id+'.svg'),rendered.svg);
 selected.push({...sample,image_sha256:hash(rendered.png),annotation_sha256:hash(json(annotation))});cv.push({...coverage.samples.find(s=>s.sample_id===id),width:spec.width,height:spec.height,spec_sha256:hash(json(spec)),svg_sha256:hash(rendered.svg),composition:spec.composition,row_count:job.plan.datasets.reduce((n,t)=>n+t.rows.length,0)});
 report.samples.push({id,changes,original_image_sha256:sample.image_sha256,image_sha256:hash(rendered.png),width:spec.width,height:spec.height});console.log(`${report.samples.length}/${jobs.length} ${id} ${changes[0].axis_count} axes ${styles.get(id)}`);
 }
 report.styles={straight:[...styles.values()].filter(s=>s==='straight').length,bezier:[...styles.values()].filter(s=>s==='bezier').length};
 await writeFile(path.join(out,'manifest.json'),json({...manifest,sample_count:selected.length,samples:selected}));await writeFile(path.join(specDir,'coverage.json'),json({...coverage,samples:cv}));await writeFile(path.join(specDir,'parallel-revision.json'),json(report));console.log(JSON.stringify({...report,samples:report.samples.length}));
}finally{await renderer.close();}
