import {readRenderAnnotation} from './render-annotation.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
import {nestedLeaves} from './nested-contracts.mjs';
const out=path.resolve(process.argv[2]??'outputs/nested-500'),specDir=out+'-specs';
const manifest=JSON.parse(await readFile(path.join(out,'manifest.json'))),hash=x=>createHash('sha256').update(x).digest('hex');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const results=[];
try{
 for(const [i,s] of manifest.samples.entries()){
  const png=await readFile(path.join(out,s.image)),annotation=await readFile(path.join(out,s.annotation)),svg=await readFile(path.join(specDir,`${s.sample_id}.svg`),'utf8');
  if(hash(png)!==s.image_sha256||hash(annotation)!==s.annotation_sha256)throw new Error('Manifest hash mismatch');
  const a=await readRenderAnnotation(out,s),plan=JSON.parse(await readFile(path.join(specDir,`${s.sample_id}.plan.json`))),byId=new Map(a.charts.map(c=>[c.chart_id,c]));
  const relationIssues=[];
  const boundedIds=new Set();
  function inspect(n){
   if(typeof n==='string')return;
   if(n.type==='nest'){
    const cfg=plan.charts.find(c=>c.id===n.anchor),kind=(byId.get(n.anchor)??cfg.layoutAnnotation)?.variation;
    if(n.placement==='center'){
     if(cfg.options.host==='scatter'&&!cfg.layoutOnly)relationIssues.push('Replaced scatter point is not a layout-only anchor');
     if(cfg.options.host==='scatter'||(!cfg.options.host&&!cfg.options.region&&['point','single_line','multi_line','bar','stacked_bar','grouped_bar'].includes(kind)))boundedIds.add(n.anchor);
    }
    if(n.parent.type==='overlay')for(const id of nestedLeaves(n.parent)){
     const bar=byId.get(id);if(id===n.anchor||!['bar','stacked_bar','grouped_bar'].includes(bar?.variation))continue;
     for(const child of nestedLeaves(n.child)){
      const pie=byId.get(child);if(pie?.variation!=='pie/donut/radial_bar')continue;
      if(n.fields.some(f=>pie.repetition_position.includes(f)&&Object.values(bar.encodings).includes(f)))relationIssues.push('Indirect pie/bar overlay field relation');
     }
    }
    inspect(n.parent);inspect(n.child);
   }else if(n.type==='facet')inspect(n.child);else n.children.forEach(inspect);
  }
  inspect(plan.composition);
  for(const c of plan.charts.filter(c=>c.layoutOnly))if(byId.has(c.id))relationIssues.push('Invisible scatter anchor still annotated');
  await page.setContent(svg);
  const check=await page.evaluate(({pieIds,layoutIds,boundedIds})=>{
   const svg=document.querySelector('svg'),width=Number(svg.getAttribute('width')),height=Number(svg.getAttribute('height')),issues=[];
   let centers=0,cells=0,axes=0,headers=0;
   const nests=[...document.querySelectorAll('[data-offline-nested-anchor]')];
   for(const n of nests){
    const [x,y,w,h]=n.getAttribute('data-child-frame').split(',').map(Number),ax=Number(n.getAttribute('data-anchor-x')),ay=Number(n.getAttribute('data-anchor-y')),placement=n.getAttribute('data-placement');
    if(placement==='center'&&boundedIds.includes(n.getAttribute('data-offline-nested-anchor'))&&!n.hasAttribute('data-parent-plot'))issues.push('Missing Cartesian plot boundary evidence');
    if(![x,y,w,h,ax,ay].every(Number.isFinite)||w<24||h<24)issues.push('Invalid child footprint');
    if(x<0||y<0||x+w>width||y+h>height)issues.push('Child outside image');
    if(placement!=='beside'&&Math.abs(x+w/2-ax)>.01)issues.push('Child not centered on actual parent x');
    if(placement==='beside'){headers++;if(x+w>=ax)issues.push('Axis header is not beside axis');if(Math.abs(y+h/2-ay)>.01)issues.push('Side header not centered on axis');}
    else if(placement==='above'){headers++;if(y+h>=ay)issues.push('Axis header is not above axis');}
    else {if(Math.abs(y+h/2-ay)>.01)issues.push('Child not centered on actual parent y');if(placement==='cell')cells++;else if(placement==='axis')axes++;else centers++;}
    if(placement==='cell'){const cell=n.getAttribute('data-parent-cell');if(!cell)issues.push('Missing parent cell');else{const [px,py,pw,ph]=cell.split(',').map(Number);if(x<px||y<py||x+w>px+pw||y+h>py+ph)issues.push('Glyph is not contained in its actual parent cell');}}
    if(n.hasAttribute('data-parent-plot')){
     const [px,py,pw,ph]=n.getAttribute('data-parent-plot').split(',').map(Number);
     if(x-3<px-.01||y-3<py-.01||x+w+3>px+pw+.01||y+h+3>py+ph+.01)issues.push('Nested glyph crosses parent axes');
     const box=n.getBBox();if(box.x<px-.01||box.y<py-.01||box.x+box.width>px+pw+.01||box.y+box.height>py+ph+.01)issues.push('Visible child content crosses parent axes');
    }
    // Every descendant mark must remain inside its physically allocated child frame.
    for(const chart of n.querySelectorAll('[data-offline-chart]')){
     const frame=chart.getAttribute('data-offline-frame').split(',').map(Number);
     if(frame[0]<x-1||frame[1]<y-1||frame[0]+frame[2]>x+w+1||frame[1]+frame[3]>y+h+1)issues.push('Descendant chart leaves node/cell footprint');
    }
   }
   for(const anchor of document.querySelectorAll('[data-offline-anchor]'))if(anchor.querySelector('circle'))issues.push('Replaced scatter point still rendered');
   for(const id of layoutIds)if(document.querySelector(`[data-offline-chart="${id}"]`)||!document.querySelector(`[data-offline-anchor="${id}"]`))issues.push('Invalid hidden scatter anchor rendering');
   for(const el of document.querySelectorAll('path,rect,circle,line,polyline,text')){
    for(const a of el.attributes)if(['d','x','y','cx','cy','width','height','transform'].includes(a.name)&&/NaN|Infinity/.test(a.value))issues.push('Nonfinite geometry');
    if(el.tagName==='text'&&/\b[FC]\d+\b|chart|boxplot|heatmap/i.test(el.textContent))issues.push('Visible identifier/name');
   }
   for(const id of pieIds)for(const pie of document.querySelectorAll(`[data-offline-chart="${id}"]`)){
    const host=pie.parentElement;
    if([...host.children].some(el=>el.hasAttribute('data-host-node')))issues.push('Pie still has a rectangular host border');
    for(const sector of pie.querySelectorAll('path'))if(sector.getAttribute('stroke')!=='none')issues.push('Pie sector still has a border');
   }
  for(const a of document.querySelectorAll('[data-area-min-data-gap]'))if(!(Number(a.getAttribute('data-area-min-data-gap'))>0&&Number(a.getAttribute('data-area-min-screen-gap'))>0))issues.push('Area lower/upper ordering');
   for(const chart of document.querySelectorAll('[data-offline-chart]')){
    const bars=[...chart.querySelectorAll('[data-mark-role="bar"]')];
    for(let i=0;i<bars.length;i++)for(let j=i+1;j<bars.length;j++){
     const a=bars[i],b=bars[j],ax=Number(a.getAttribute('x')),ay=Number(a.getAttribute('y')),bx=Number(b.getAttribute('x')),by=Number(b.getAttribute('y'));
     const overlapX=Math.min(ax+Number(a.getAttribute('width')),bx+Number(b.getAttribute('width')))-Math.max(ax,bx);
     const overlapY=Math.min(ay+Number(a.getAttribute('height')),by+Number(b.getAttribute('height')))-Math.max(ay,by);
     if(overlapX>.01&&overlapY>.01)issues.push('Unintended bar overlap');
    }
   }
   for(const overlay of document.querySelectorAll('[data-offline-composition="overlay"]')){const domains=[...overlay.children].filter(c=>c.hasAttribute('data-y-domain')).map(c=>c.getAttribute('data-y-domain'));if(new Set(domains).size>1)issues.push('Overlay members use inconsistent numeric y scales');}
   for(const aligned of document.querySelectorAll('[data-offline-composition="aligned"]')){
    const positions=new Map();for(const mark of aligned.querySelectorAll('[data-aligned-key]')){const key=mark.getAttribute('data-aligned-key'),y=Number(mark.getAttribute('data-aligned-y'));if(positions.has(key)&&Math.abs(y-positions.get(key))>.01)issues.push('Tree leaf and corresponding row do not share a screen center');positions.set(key,y);}
    if(!positions.size)issues.push('Missing shared row evidence');
   }
   return {width,height,nested_instances:nests.length,centers,cells,axes,headers,issues:[...new Set(issues)]};
  },{pieIds:a.charts.filter(c=>c.variation==='pie/donut/radial_bar').map(c=>c.chart_id),layoutIds:plan.charts.filter(c=>c.layoutOnly).map(c=>c.id),boundedIds:[...boundedIds]});
  check.issues.push(...relationIssues);
  if(check.width!==png.readUInt32BE(16)||check.height!==png.readUInt32BE(20))check.issues.push('PNG dimension mismatch');
  results.push({sample_id:s.sample_id,...check});
  if((i+1)%50===0)console.log(`Audited ${i+1}/${manifest.samples.length}`);
 }
 const bad=results.filter(r=>r.issues.length),validation={samples:results.length,passed:bad.length===0,nested_instances:results.reduce((s,r)=>s+r.nested_instances,0),failure_count:bad.length,failures:bad,results};
 await writeFile(path.join(specDir,'validation.json'),JSON.stringify(validation,null,2)+'\n');console.log(JSON.stringify({samples:results.length,passed:validation.passed,physical_nested_instances:validation.nested_instances,failures:bad.slice(0,5)}));if(bad.length)process.exitCode=1;
}finally{await browser.close();}
