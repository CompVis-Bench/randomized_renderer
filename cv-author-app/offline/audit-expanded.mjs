#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {chromium} from 'playwright';
const out=path.resolve(process.argv[2]??'outputs/composite-1100'),specDir=out+'-specs';
const digest=x=>createHash('sha256').update(x).digest('hex');
const manifest=JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
const coverage=JSON.parse(await readFile(path.join(specDir,'coverage.json'),'utf8'));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const issues=[],widths=[],heights=[],counts={};let instances=0;
try{
 for(const [i,s] of manifest.samples.entries()){
  const png=await readFile(path.join(out,s.image)),bytes=await readFile(path.join(out,s.annotation)),a=JSON.parse(bytes),cv=coverage.samples[i];
  if(digest(png)!==s.image_sha256||digest(bytes)!==s.annotation_sha256)issues.push({sample:s.sample_id,error:'manifest hash mismatch'});
  if(png.readUInt32BE(16)!==cv.width||png.readUInt32BE(20)!==cv.height)issues.push({sample:s.sample_id,error:'PNG dimensions mismatch'});
  widths.push(cv.width);heights.push(cv.height);counts[cv.recipe]=(counts[cv.recipe]??0)+1;
  const svg=await readFile(path.join(specDir,`${s.sample_id}.svg`),'utf8');
  await page.setContent(svg);
  const result=await page.evaluate(()=>{
   const svg=document.querySelector('svg'),W=Number(svg.getAttribute('width')),H=Number(svg.getAttribute('height'));const errors=[],groups=[...document.querySelectorAll('g[data-offline-chart]')];
   for(const g of groups){const id=g.getAttribute('data-offline-chart'),box=g.getBBox(),m=g.getCTM(),x=box.x+m.e,y=box.y+m.f;
    if(![x,y,box.width,box.height].every(Number.isFinite))errors.push({id,error:'nonfinite box'});
    if(x < -4 || y < -4 || x+box.width>W+4 || y+box.height>H+4)errors.push({id,error:'outside canvas',box:[x,y,box.width,box.height],canvas:[W,H]});
    const marks=[...g.querySelectorAll('path,rect,circle,line,text')].filter(el=>{const b=el.getBBox();return b.width>0||b.height>0;});if(!marks.length)errors.push({id,error:'no visible geometry'});
   }
   const variations=new Set(groups.map(g=>g.getAttribute('data-variation')).filter(Boolean));
   for(const text of document.querySelectorAll('text')){
    const label=text.textContent??'';
    if(/\b[FC][1-9]\d*\b/.test(label)||[...variations].some(v=>label.includes(v)))errors.push({error:'visible field ID, chart ID or idiom name',text:label});
   }
   for(const area of document.querySelectorAll('[data-area-min-data-gap]')){
    if(!(Number(area.getAttribute('data-area-min-data-gap'))>0 && Number(area.getAttribute('data-area-min-screen-gap'))>0))errors.push({id:area.closest('[data-offline-chart]').getAttribute('data-offline-chart'),error:'area lower is not below upper'});
   }
   return {instances:groups.length,errors};
  });
  instances+=result.instances;for(const error of result.errors)issues.push({sample:s.sample_id,...error});
  if((i+1)%100===0)console.log(`audited ${i+1}/${manifest.samples.length}`);
 }
 const report={samples:manifest.sample_count,counts,source_samples:coverage.basis_source_count,rendered_chart_instances:instances,width_range:[Math.min(...widths),Math.max(...widths)],height_range:[Math.min(...heights),Math.max(...heights)],png_duplicates:manifest.samples.length-new Set(manifest.samples.map(s=>s.image_sha256)).size,issues};
 await writeFile(path.join(specDir,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,issues:issues.slice(0,15)},null,2));if(issues.length)process.exitCode=1;
}finally{await browser.close();}
