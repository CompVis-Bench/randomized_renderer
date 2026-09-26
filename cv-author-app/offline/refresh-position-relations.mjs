import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import path from 'node:path';import {createHash} from 'node:crypto';
import {refinePositionRelations,positionRevision} from './position-relations.mjs';
import {removeReplacedScatterPoints} from './nested-layout.mjs';
import {compileTarget} from './compile.mjs';import {compileNested} from './nested-contracts.mjs';
import {createRenderer,loadScene} from './render.mjs';
const dataset=process.argv[2]??'composite-1100',limit=Number(process.argv[3]??Infinity);
const input=path.resolve('outputs',dataset),out=path.resolve(process.argv[4]??'outputs/.position-stage',dataset),specs=out+'-specs';
const read=async f=>JSON.parse(await readFile(f,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
for(const d of [out+'/images',out+'/annotations',specs])await mkdir(d,{recursive:true});
const manifest=await read(input+'/manifest.json'),coverage=await read(input+'-specs/coverage.json');
const samples=[],cv=[],report={revision:positionRevision,dataset,samples:[],issues:[]};let renderer=await createRenderer(),rendered=0;
if(dataset==='nested-500')report.render_revision='nested-internal-anchors-and-axis-insets-v1';
try{for(const sample of manifest.samples.slice(0,limit)){
 const id=sample.sample_id;
 try{
  const checkpoint=specs+'/'+id+'.position.json';let item;
  try{item=await read(checkpoint);if(item.original_image_sha256!==sample.image_sha256||item.original_annotation_sha256!==sample.annotation_sha256)throw new Error('Stale position checkpoint');}
  catch(e){if(e.code!=='ENOENT')throw e;
   const a=await read(input+'/'+sample.annotation),raw=await read(input+'-specs/'+id+'.plan.json');
   const job={annotation:a,plan:raw.plan??raw,provenance:await read(input+'-specs/'+id+'.provenance.json').catch(e=>{if(e.code==='ENOENT')return {};throw e;})};
   const revision=refinePositionRelations(job);
   const removedScatterPoints=dataset==='nested-500'?removeReplacedScatterPoints(job):[];
   if(dataset==='nested-500')job.provenance.nested_render_revision=report.render_revision;
   const scene=(dataset==='nested-500'?compileNested:compileTarget)(a,job.plan);
   const specPath=specs+'/'+id+'.spec.json';await writeFile(specPath,json(scene));
   if(rendered&&rendered%30===0){await renderer.close();renderer=await createRenderer();}rendered++;
   const loaded=await loadScene(specPath),svg=await renderer.renderSvg(loaded),oldSvg=await readFile(input+'-specs/'+id+'.svg','utf8');
   // Field IDs occur only in machine-readable attributes (visible IDs are prohibited).
   const canonical=s=>s.replace(/ data-[\w:-]+="[^"]*"/g,attribute=>attribute.replace(/F\d+/g,'FIELD'));
   const samePixels=canonical(svg)===canonical(oldSvg);
   let png;if(samePixels)png=await readFile(input+'/'+sample.image);else png=(await renderer.render(loaded)).png;
   await writeFile(out+'/'+sample.image,png);await writeFile(out+'/'+sample.annotation,json(a));
   await writeFile(specs+'/'+id+'.plan.json',json(job.plan));await writeFile(specs+'/'+id+'.provenance.json',json(job.provenance));await writeFile(specs+'/'+id+'.svg',svg);
   const entry={...sample,image_sha256:hash(png),annotation_sha256:hash(json(a))};
   const c={...coverage.samples.find(s=>s.sample_id===id),width:scene.width,height:scene.height,variations:a.charts.map(c=>c.variation),repetition_dimensions:a.charts.map(c=>c.repetition_position.length),spec_sha256:hash(json(scene)),svg_sha256:hash(svg),composition:scene.composition};
   item={sample:entry,coverage:c,original_image_sha256:sample.image_sha256,original_annotation_sha256:sample.annotation_sha256,rerendered:!samePixels,alignments:revision.alignments,splits:revision.splits.length,retained:revision.retained.length,rejected:revision.rejected??[],removed_scatter_points:removedScatterPoints};
   await writeFile(checkpoint,json(item));
  }
  samples.push(item.sample);cv.push(item.coverage);report.samples.push({id,original_image_sha256:item.original_image_sha256,original_annotation_sha256:item.original_annotation_sha256,rerendered:item.rerendered,alignments:item.alignments,splits:item.splits,retained:item.retained,rejected:item.rejected,removed_scatter_points:item.removed_scatter_points});
 }catch(e){report.issues.push({id,error:e.stack});console.error(id,e.message);}
 if((samples.length+report.issues.length)%20===0)console.log(`${dataset} ${samples.length+report.issues.length}/${Math.min(limit,manifest.samples.length)} changed PNG=${report.samples.filter(s=>s.rerendered).length} failures=${report.issues.length}`);
 }
 report.summary={samples:samples.length,rerendered:report.samples.filter(s=>s.rerendered).length,alignments:report.samples.reduce((n,s)=>n+s.alignments.length,0),splits:report.samples.reduce((n,s)=>n+s.splits,0),retained:report.samples.reduce((n,s)=>n+s.retained,0),issues:report.issues.length};
 report.summary.removed_scatter_templates=report.samples.reduce((n,s)=>n+(s.removed_scatter_points?.length??0),0);
 report.summary.changed_annotations=report.samples.filter(r=>samples.find(s=>s.sample_id===r.id).annotation_sha256!==r.original_annotation_sha256).length;
 if(dataset==='nested-500'){
  const checks=await Promise.all(samples.map(async s=>({sample_id:s.sample_id,nested_instances:cv.find(c=>c.sample_id===s.sample_id).physical_nested_instances,template_count:(await read(out+'/'+s.annotation)).charts.length,nonfinite:false,visible_identifiers:false})));
  await writeFile(specs+'/checks.json',json({samples:checks.length,passed:report.issues.length===0,checks}));
 }
 await writeFile(out+'/manifest.json',json({...manifest,status:'generated_pending_review',annotation_version:positionRevision,sample_count:samples.length,samples}));await writeFile(specs+'/coverage.json',json({...coverage,samples:cv}));await writeFile(specs+'/position-revision.json',json(report));console.log(report.summary);if(report.issues.length)process.exitCode=1;
}finally{await renderer.close();}
