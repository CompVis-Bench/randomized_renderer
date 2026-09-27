#!/usr/bin/env node
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {feature} from 'topojson-client';
import {buildRandomizedAnnotation} from './randomized-annotation.mjs';
import {createRenderer} from './render.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const json=x=>JSON.stringify(x,null,2)+'\n';
export async function main(args=process.argv.slice(2)){
 const {values:v,positionals}=parseArgs({args,allowPositionals:true,options:{out:{type:'string'},seed:{type:'string',default:'23'},policy:{type:'string'},geometry:{type:'string'},'plan-only':{type:'boolean'},help:{type:'boolean',short:'h'}}});
 if(v.help){console.log('node cv-author-app/offline/render-candidates.mjs annotation.json|annotations/|dataset/ --out NEW_DIRECTORY [--seed 23] [--policy policy.json] [--geometry local.geojson] [--plan-only]\nEach target produces exactly one candidate. Immutable v5 annotation; only compatible presentation choices are sampled. Existing output directories must be empty.');return;}
 if(positionals.length!==1||!v.out)throw new Error('Supply one annotation file/directory and --out NEW_DIRECTORY');
 const seed=Number(v.seed);if(!/^\d+$/.test(v.seed)||!Number.isInteger(seed)||seed>0xffffffff)throw new Error('seed must be a uint32');
 const input=path.resolve(positionals[0]),out=path.resolve(v.out),info=await stat(input);
 let files=[];
 if(info.isFile())files=[input];else{
  let dir=input;try{if((await stat(path.join(dir,'annotations'))).isDirectory())dir=path.join(dir,'annotations');}catch(e){if(e.code!=='ENOENT')throw e;}
  files=(await readdir(dir)).filter(n=>n.endsWith('.json')).sort().map(n=>path.join(dir,n));
 }
 if(!files.length)throw new Error('No annotation JSON files found');
 let existing;try{existing=await readdir(out);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(existing?.length)throw new Error('Output directory must be empty');
 const policy=v.policy?JSON.parse(await readFile(v.policy,'utf8')):{};
 const localGeometry=JSON.parse(await readFile(v.geometry??new URL('./assets/manhattan.geojson',import.meta.url),'utf8'));
 let geometries=[localGeometry];
 if(!v.geometry){
  const statesTopo=JSON.parse(await readFile(new URL('../node_modules/us-atlas/states-10m.json',import.meta.url),'utf8'));
  const stateFeatures=feature(statesTopo,statesTopo.objects.states).features.filter(state=>Number(state.id)<=56);
  const states={type:'FeatureCollection',features:stateFeatures};
  geometries=[{geometry:localGeometry,projection:'mercator'},{geometry:states,projection:'albersUsa'}];
 }
 const jobs=[];
 // Preflight all annotations before creating candidate files or launching Chromium.
 for(const file of files){const bytes=await readFile(file),id=path.basename(file).replace(/(?:\.annotation)?\.json$/,'');if(!/^[a-zA-Z0-9_.-]+$/.test(id))throw new Error('Unsafe sample filename: '+id);
  const sampleSeed=(seed^parseInt(hash(Buffer.from(id)).slice(0,8),16))>>>0;
  try{buildRandomizedAnnotation(JSON.parse(bytes),{seed:sampleSeed,policy,geometries});jobs.push({id,file,bytes,inputHash:hash(bytes),seed:sampleSeed});}catch(e){throw new Error(`${file}: ${e.message}`);}
 }
 if(new Set(jobs.map(j=>j.id)).size!==jobs.length)throw new Error('Duplicate sample names');
 for(const name of ['images','annotations','construction'])await mkdir(path.join(out,name),{recursive:true});
 const manifest={format_version:'chart_encoding_external_v5',renderer:'randomized-annotation-v1',seed,status:v['plan-only']?'planned':'generated_pending_review',samples:[]};
 let renderer;
 try{
  if(!v['plan-only'])renderer=await createRenderer();
  for(const source of jobs){const job={...source,...buildRandomizedAnnotation(JSON.parse(source.bytes),{seed:source.seed,policy,geometries})};const before=json(job.annotation),image='images/'+job.id+'.png',annotation='annotations/'+job.id+'.json';
   let rendered;if(renderer)rendered=await renderer.render(job.scene); // exactly one rasterization
   if(json(job.annotation)!==before)throw new Error('Renderer changed annotation');
   if(rendered){await writeFile(path.join(out,image),rendered.png,{flag:'wx'});await writeFile(path.join(out,'construction',job.id+'.svg'),rendered.svg,{flag:'wx'});}
   await writeFile(path.join(out,annotation),job.bytes,{flag:'wx'});
   await writeFile(path.join(out,'construction',job.id+'.scene.json'),json(job.scene),{flag:'wx'});
   await writeFile(path.join(out,'construction',job.id+'.provenance.json'),json({...job.provenance,input:job.file,input_sha256:job.inputHash,versions:renderer?.versions??null}),{flag:'wx'});
   manifest.samples.push({sample_id:job.id,annotation,annotation_sha256:job.inputHash,...(rendered?{image,image_sha256:hash(rendered.png),width:rendered.width,height:rendered.height}:{})});
   console.log(job.id+(rendered?' rendered':' planned'));
  }
  await writeFile(path.join(out,'manifest.json'),json(manifest),{flag:'wx'});
 }finally{await renderer?.close();}
 console.log(`${jobs.length} candidates: ${out}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
