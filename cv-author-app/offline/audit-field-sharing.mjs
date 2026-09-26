import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {build} from 'vite';
import {chromium} from 'playwright';
import {compileTarget} from './compile.mjs';
import {compileNested} from './nested-contracts.mjs';
import {loadScene} from './render.mjs';
const root=path.resolve(new URL('../../',import.meta.url).pathname),out=path.resolve(process.argv[2]??'outputs/audits/field-sharing-50');
const read=async p=>JSON.parse(await readFile(p,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=x=>createHash('sha256').update(x).digest('hex');
await mkdir(out,{recursive:true});const selection=await read(path.join(out,'selection.json'));
const result=await build({root:path.join(root,'cv-author-app'),configFile:false,envFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:new URL('./field-sharing-audit-renderer.ts',import.meta.url).pathname,name:'FieldSharingAudit',formats:['iife']}}});
const bundle=(Array.isArray(result)?result:[result]).flatMap(r=>r.output).find(r=>r.type==='chunk').code;
const browser=await chromium.launch({headless:true}),context=await browser.newContext({offline:true,locale:'en-US',timezoneId:'UTC'});await context.route('**/*',r=>r.abort());
const page=await context.newPage();await page.setContent('<html><body></body></html>');await page.addScriptTag({content:bundle});
const report={selection,scope:'50 generated images from the exported 100-image slice. Counterfactual tests use isolated chart instances and do not establish full semantic correctness.',samples:[]};
try{
 for(const [index,item] of selection.samples.entries()){
  const folder=path.join(root,'outputs',item.dataset),specDir=folder+'-specs',a=await read(path.join(folder,'annotations',item.id+'.json')),plan=await read(path.join(specDir,item.id+'.plan.json')),saved=await read(path.join(specDir,item.id+'.spec.json')),provenance=await read(path.join(specDir,item.id+'.provenance.json'));
  const manifest=await read(path.join(folder,'manifest.json')),entry=manifest.samples.find(s=>s.sample_id===item.id),svg=await readFile(path.join(specDir,item.id+'.svg'),'utf8');
  const check={...item,charts:a.charts.length,bindings:a.charts.reduce((s,c)=>s+Object.keys(c.encodings).length,0),file_checks:{image_hash:hash(await readFile(path.join(folder,entry.image)))===entry.image_sha256,annotation_hash:hash(await readFile(path.join(folder,entry.annotation)))===entry.annotation_sha256},compile_matches:false,type_conflicts:[],shared_fields:[],binding_probes:[],aggregations:[],renderer_replay:null};
  try{const compiled=(item.dataset==='nested-500'?compileNested:compileTarget)(a,plan);check.compile_matches=isDeepStrictEqual(compiled,saved);}catch(e){check.compile_error=e.message;}
  const fields=new Map();
  for(const c of a.charts){const cfg=plan.charts.find(d=>d.id===c.chart_id),table=plan.datasets.find(d=>d.id===cfg.datasetId);
   for(const [channel,f] of [...Object.entries(c.encodings),...c.repetition_position.map(f=>['repetition_position',f])]){if(!fields.has(f))fields.set(f,[]);fields.get(f).push({chart:c.chart_id,channel,type:table.columns.find(d=>d.name===f)?.type,domain:[...new Set(table.rows.map(r=>r[f]))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}))});}
  }
  for(const [field,uses] of fields){if(new Set(uses.map(u=>u.type)).size>1)check.type_conflicts.push({field,uses});if(new Set(uses.map(u=>u.chart)).size>1)check.shared_fields.push({field,uses:uses.map(u=>({...u,domain_count:u.domain.length,domain_hash:hash(json(u.domain)),domain:u.domain.slice(0,8)}))});}
  for(const cfg of plan.charts.filter(c=>c.options?.aggregation)){
   const target=a.charts.find(c=>c.chart_id===cfg.id),agg=cfg.options.aggregation,source=plan.datasets.find(d=>d.id===plan.charts.find(c=>c.id===agg.source).datasetId),dest=plan.datasets.find(d=>d.id===cfg.datasetId),vf=target.encodings[cfg.options.barOrientation==='horizontal'?'position.x':'position.y'];
   const groups=new Map();for(const row of dest.rows){const key=JSON.stringify([...target.repetition_position.map(f=>row[f]),row[agg.groupBy]]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
   const errors=[];for(const rows of groups.values()){const first=rows[0],matches=source.rows.filter(r=>String(r[agg.groupBy])===String(first[agg.groupBy])&&target.repetition_position.every(f=>r[f]===undefined||String(r[f])===String(first[f])));const expected=matches.reduce((s,r)=>s+(agg.operation==='count'?1:Number(r[agg.measure])),0),actual=rows.reduce((s,r)=>s+Number(r[vf]),0);if(Math.abs(expected-actual)>.001)errors.push({category:first[agg.groupBy],expected,actual});}
   check.aggregations.push({chart:cfg.id,source:agg.source,operation:agg.operation,groups:groups.size,passed:!errors.length,errors:errors.slice(0,5)});
  }
  const loaded=await loadScene(path.join(specDir,item.id+'.spec.json'));
  await page.evaluate(scene=>{window.auditScene=scene;},loaded);
  const replay=await page.evaluate(()=>window.offlineRenderer.render(window.auditScene));
  check.renderer_replay={svg_byte_identical:hash(replay)===hash(svg),saved_svg_sha256:hash(svg),replayed_svg_sha256:hash(replay)};
  for(const c of a.charts){
   const base=await page.evaluate(id=>{try{return {signature:window.fieldSharingAudit.fingerprint(window.fieldSharingAudit.isolate(window.auditScene,id))};}catch(e){return {error:e.message};}},c.chart_id);
   const chart=loaded.charts.find(d=>d.id===c.chart_id),table=loaded.datasets.find(d=>d.id===chart.spec.datasetId);
   for(const [annotationChannel,field] of Object.entries(c.encodings)){
    const channel=annotationChannel.replace('position.',''),domain=[...new Set(table.rows.map(r=>r[field]))],probe={chart:c.chart_id,variation:c.variation,channel:annotationChannel,field,domain_count:domain.length};
    if(domain.length<2){probe.status='not_testable_constant';}
    else if(['source','target'].includes(channel)||(['tree','dendrogram','radial_tree','icicle','sunburst'].includes(c.variation)&&['x','y','theta','radius'].includes(channel))){probe.status='structural_requires_separate_check';}
    else if(base.error){probe.status='isolation_error';probe.error=base.error;}
    else{
     const trials=[];for(let mode=0;mode<2;mode++){
      const trial=await page.evaluate(({id,channel,mode})=>{try{return {signature:window.fieldSharingAudit.fingerprint(window.fieldSharingAudit.isolate(window.auditScene,id,{channel,mode}))};}catch(e){return {error:e.message};}},{id:c.chart_id,channel,mode});
      trials.push(trial.error?{error:trial.error}:{changed:trial.signature!==base.signature,signature_sha256:hash(trial.signature)});
     }
     probe.trials=trials;probe.baseline_sha256=hash(base.signature);probe.status=trials.some(t=>t.changed)?'responds':trials.every(t=>t.changed===false)?'no_visible_response':'inconclusive_error';
    }
    check.binding_probes.push(probe);
   }
  }
  check.provenance_shared_fields=provenance.shared_fields??[];
  report.samples.push(check);await writeFile(path.join(out,'audit.json'),json(report));console.log(`[${index+1}/50] ${item.id} charts=${check.charts} unchanged=${check.binding_probes.filter(p=>p.status==='no_visible_response').length}`);
 }
}finally{await browser.close();}
const probes=report.samples.flatMap(s=>s.binding_probes),count=key=>report.samples.filter(s=>s[key]).length;
report.summary={samples:report.samples.length,charts:report.samples.reduce((s,r)=>s+r.charts,0),bindings:probes.length,compile_matches:count('compile_matches'),replay_matches:report.samples.filter(s=>s.renderer_replay?.svg_byte_identical).length,statuses:Object.fromEntries([...new Set(probes.map(p=>p.status))].map(status=>[status,probes.filter(p=>p.status===status).length])),samples_with_no_response:report.samples.filter(s=>s.binding_probes.some(p=>p.status==='no_visible_response')).length,aggregation_checks:report.samples.flatMap(s=>s.aggregations).length,failed_aggregations:report.samples.flatMap(s=>s.aggregations).filter(a=>!a.passed).length};
await writeFile(path.join(out,'audit.json'),json(report));console.log(json(report.summary));
