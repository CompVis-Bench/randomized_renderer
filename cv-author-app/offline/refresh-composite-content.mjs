// Render a reviewable, affected-only stage; publish only after validation.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import {createHash} from 'node:crypto';
import {enrichVenn,vennModes,vennLayouts} from './venn-content.mjs';
import {layerGeographicViews} from './geo-layering.mjs';
import {landscapeStackedAreas} from './area-layout.mjs';
import {compileTarget} from './compile.mjs';
import {createRenderer,loadScene} from './render.mjs';
const root=path.resolve('outputs'),input=path.join(root,'composite-1100'),out=path.join(root,'.content-stage/composite-1100'),specDir=out+'-specs',read=async f=>JSON.parse(await readFile(f,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
await mkdir(path.join(out,'images'),{recursive:true});await mkdir(path.join(out,'annotations'),{recursive:true});await mkdir(specDir,{recursive:true});
const manifest=await read(path.join(input,'manifest.json')),coverage=await read(path.join(input+'-specs','coverage.json')),selected=[],cv=[],report={revision:'composite-content-2026-09-24',scope:'composite-1100 only',samples:[],venn:0,cloud:0,geo:0,area:0};
let renderer=await createRenderer(),vennIndex=0;
try{for(const sample of manifest.samples){
 const id=sample.sample_id,annotation=await read(path.join(input,sample.annotation));if(!annotation.charts.some(c=>['euler_venn','word_cloud','stacked_area','geo_line'].includes(c.variation)))continue;
 const job={annotation,plan:await read(path.join(input+'-specs',id+'.plan.json')),provenance:await read(path.join(input+'-specs',id+'.provenance.json'))};
 const venn=enrichVenn(job,{mode:vennModes[vennIndex%3],layout:vennLayouts[Math.floor(vennIndex/3)%3]});if(venn.length)vennIndex++;
 const geo=layerGeographicViews(job),area=landscapeStackedAreas(job),cloud=annotation.charts.some(c=>c.variation==='word_cloud');
 if(!venn.length&&!geo.length&&!area&&!cloud)continue;
 if(report.samples.length&&report.samples.length%20===0){await renderer.close();renderer=await createRenderer();}
 const spec=compileTarget(annotation,job.plan),specPath=path.join(specDir,id+'.spec.json');await writeFile(specPath,json(spec));const rendered=await renderer.render(await loadScene(specPath));
 await writeFile(path.join(out,sample.image),rendered.png);await writeFile(path.join(out,sample.annotation),json(annotation));await writeFile(path.join(specDir,id+'.plan.json'),json(job.plan));await writeFile(path.join(specDir,id+'.provenance.json'),json(job.provenance));await writeFile(path.join(specDir,id+'.svg'),rendered.svg);
 const old=coverage.samples.find(s=>s.sample_id===id);selected.push({...sample,image_sha256:hash(rendered.png),annotation_sha256:hash(json(annotation))});cv.push({...old,width:spec.width,height:spec.height,spec_sha256:hash(json(spec)),svg_sha256:hash(rendered.svg),composition:spec.composition});
 const entry={id,venn,geo,area,cloud,original_image_sha256:sample.image_sha256,image_sha256:hash(rendered.png),width:spec.width,height:spec.height};report.samples.push(entry);report.venn+=!!venn.length;report.cloud+=cloud;report.geo+=!!geo.length;report.area+=area;
 console.log(`${report.samples.length} ${id} venn=${!!venn.length} cloud=${cloud} geo=${geo.length} area=${area}`);
 }
 await writeFile(path.join(out,'manifest.json'),json({...manifest,sample_count:selected.length,samples:selected}));await writeFile(path.join(specDir,'coverage.json'),json({...coverage,samples:cv}));await writeFile(path.join(specDir,'content-revision.json'),json(report));console.log(JSON.stringify({...report,samples:report.samples.length}));
}finally{await renderer.close();}
