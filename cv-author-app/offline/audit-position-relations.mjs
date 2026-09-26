import {readRenderAnnotation} from './render-annotation.mjs';
import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';import {chromium} from 'playwright';
import {compileTarget} from './compile.mjs';import {compileNested} from './nested-contracts.mjs';
const out=path.resolve(process.argv[2]??'outputs/.position-stage/composite-1100'),specs=out+'-specs',read=async p=>JSON.parse(await readFile(p,'utf8')),hash=b=>createHash('sha256').update(b).digest('hex');
const limit=Number(process.argv[3]??Infinity);
const manifest=await read(out+'/manifest.json'),coverage=await read(specs+'/coverage.json');const issues=[];let relations=0,contracts=0,instances=0;
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
try{for(const [i,s] of manifest.samples.slice(0,limit).entries()){
 const id=s.sample_id,a=await readRenderAnnotation(out,s),p=await read(specs+'/'+id+'.plan.json'),spec=await read(specs+'/'+id+'.spec.json'),prov=await read(specs+'/'+id+'.provenance.json'),svg=await readFile(specs+'/'+id+'.svg','utf8'),png=await readFile(out+'/'+s.image),cv=coverage.samples.find(c=>c.sample_id===id);
 if(hash(png)!==s.image_sha256||hash(await readFile(out+'/'+s.annotation))!==s.annotation_sha256||hash(svg)!==cv.svg_sha256||hash(await readFile(specs+'/'+id+'.spec.json'))!==cv.spec_sha256)issues.push({id,error:'hash mismatch'});
 if(!isDeepStrictEqual((spec.charts[0].spec.chartType==='OfflineNestedIdiom'?compileNested:compileTarget)(a,p),spec))issues.push({id,error:'compiled plan differs'});
 const parent=new Map(),find=k=>{if(!parent.has(k))parent.set(k,k);if(parent.get(k)!==k)parent.set(k,find(parent.get(k)));return parent.get(k);};
 const mapping=prov.position_revision.chart_field_map;
 for(const r of prov.position_revision.retained){const keys=r.charts.map(c=>(mapping[c][r.field]??r.field)+'/'+c);for(const k of keys.slice(1))parent.set(find(k),find(keys[0]));}
 const uses=new Map();for(const c of a.charts)for(const f of new Set([...Object.values(c.encodings),...c.repetition_position])){if(!uses.has(f))uses.set(f,[]);uses.get(f).push(c.chart_id);}
 for(const [f,ids] of uses)if(ids.length>1){relations++;if(new Set(ids.map(id=>find(f+'/'+id))).size!==1)issues.push({id,error:'shared field lacks spatial evidence',field:f,charts:ids});}
 await page.setContent(svg);const result=await page.evaluate(()=>{
  const errors=[],maps=[...document.querySelectorAll('[data-position-map]')].map(e=>JSON.parse(e.getAttribute('data-position-map'))),groups=[...document.querySelectorAll('g[data-offline-chart]')],svg=document.querySelector('svg'),W=+svg.getAttribute('width'),H=+svg.getAttribute('height');
  for(const m of maps)if(m.coordinates.some(([,v])=>v===null||!Number.isFinite(v)))errors.push({error:'nonfinite position map',chart:m.chart,field:m.field});
  const eps=1e-6;
  for(const container of document.querySelectorAll('[data-position-contract]')){
   const c=JSON.parse(container.getAttribute('data-position-contract'));
   const selected=[...container.querySelectorAll('[data-position-map]')].map(e=>JSON.parse(e.getAttribute('data-position-map'))).filter(m=>m.field===c.field&&m.axis===c.axis);
   const facets=[...container.querySelectorAll('[data-position-facet]')].filter(e=>e.getAttribute('data-position-facet')===c.field);
   const series=selected.map(m=>m.coordinates);
   const facetGroups=new Map();for(const e of facets){const owner=e.closest('[data-offline-composition="aligned-facet"]');if(!facetGroups.has(owner))facetGroups.set(owner,[]);facetGroups.get(owner).push(e);}
   for(const cells of facetGroups.values()) {const map=new Map();for(const e of cells){const value=e.getAttribute('data-position-value'),v=+e.getAttribute('data-position-coordinate'),rect=e.querySelector('rect'),actual=+(rect.getAttribute(c.axis))+ +(rect.getAttribute(c.axis==='x'?'width':'height'))/2;if(Math.abs(actual-v)>eps)errors.push({error:'facet center differs',field:c.field});if(map.has(value)&&Math.abs(map.get(value)-v)>eps)errors.push({error:'repeated field centers differ',field:c.field});map.set(value,v);}series.push([...map]);}
   if(series.length<2)errors.push({error:'alignment has fewer than two spatial participants',field:c.field});
   const reference=new Map(series[0]);for(const s of series.slice(1))for(const [v,pos] of s)if(!reference.has(v)||Math.abs(pos-reference.get(v))>eps)errors.push({error:'shared value is not aligned',field:c.field,value:v});
   if(c.axis==='theta')for(const m of selected.slice(1))if(m.center.some((v,i)=>Math.abs(v-selected[0].center[i])>eps))errors.push({error:'polar origins differ',field:c.field});
  }
  for(const g of groups){const b=g.getBBox(),m=g.getCTM(),x=b.x+m.e,y=b.y+m.f;if(![x,y,b.width,b.height].every(Number.isFinite))errors.push({error:'nonfinite chart bounds'});if(x < -4||y < -4||x+b.width>W+4||y+b.height>H+4)errors.push({error:'outside canvas',chart:g.getAttribute('data-offline-chart'),box:[x,y,b.width,b.height],canvas:[W,H]});}
  for(const text of document.querySelectorAll('text'))if(/\b[FC]\d+\b/.test(text.textContent))errors.push({error:'visible internal identifier'});
  return {errors,contracts:document.querySelectorAll('[data-position-contract]').length,instances:groups.length};
 });
 contracts+=result.contracts;instances+=result.instances;issues.push(...result.errors.map(e=>({id,...e})));
 if((i+1)%100===0)console.log(`position audited ${i+1}/${manifest.samples.length}, issues=${issues.length}`);
 }
 const report={samples:Math.min(limit,manifest.samples.length),shared_fields:relations,alignment_instances:contracts,chart_instances:instances,issues};await writeFile(specs+(Number.isFinite(limit)?'/position-validation-'+limit+'.json':'/position-validation.json'),JSON.stringify(report,null,2)+'\n');console.log({...report,issues:issues.slice(0,20)});if(issues.length)process.exitCode=1;
}finally{await browser.close();}
