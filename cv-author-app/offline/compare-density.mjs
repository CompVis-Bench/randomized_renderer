#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath)throw new Error('Usage: node compare-density.mjs BEFORE_DATASET AFTER_DATASET');
const before=path.resolve(beforePath),after=path.resolve(afterPath);
const manifest=JSON.parse(await readFile(path.join(after,'manifest.json'),'utf8'));
const samples=[],families={},errors=[],unchangedCharts=[];let oldRows=0,newRows=0,areaRows=0,rangeRows=0;
for(const s of manifest.samples){
 const a=JSON.parse(await readFile(path.join(after,s.annotation),'utf8'));
 const oldA=JSON.parse(await readFile(path.join(before,s.annotation),'utf8'));
 if(JSON.stringify(a)!==JSON.stringify(oldA))errors.push({sample:s.sample_id,error:'annotation changed'});
 const old=JSON.parse(await readFile(path.join(before+'-specs',`${s.sample_id}.plan.json`),'utf8'));
 const plan=JSON.parse(await readFile(path.join(after+'-specs',`${s.sample_id}.plan.json`),'utf8'));
 const charts=[];let prev=0,next=0;
 for(const c of a.charts){
  const was=old.datasets.find(d=>d.id===`table_${c.chart_id}`).rows,now=plan.datasets.find(d=>d.id===`table_${c.chart_id}`).rows;
  prev+=was.length;next+=now.length;
  const family=families[c.variation]??={charts:0,before_rows:0,after_rows:0};family.charts++;family.before_rows+=was.length;family.after_rows+=now.length;
  if(now.length<was.length)errors.push({sample:s.sample_id,chart:c.chart_id,error:'data row count decreased'});
  if(now.length===was.length)unchangedCharts.push({sample:s.sample_id,chart:c.chart_id,variation:c.variation,rows:now.length,note:'The shared calendar weekday field retains exactly seven distinct values.'});
  charts.push({chart_id:c.chart_id,variation:c.variation,before_rows:was.length,after_rows:now.length});
  if(c.variation==='plain_area'){
   const b=plan.charts.find(p=>p.id===c.chart_id).basis.areaBounds;
   for(const r of now){const low=b.lower?Number(r[b.lower]):b.lowerConstant,up=Number(r[b.upper]);if(!(low<up))errors.push({sample:s.sample_id,chart:c.chart_id,error:'invalid area interval'});areaRows++;if(b.lower)rangeRows++;}
  }
 }
 if(next<=prev)errors.push({sample:s.sample_id,error:'sample data density did not increase'});
 oldRows+=prev;newRows+=next;samples.push({sample_id:s.sample_id,before_rows:prev,after_rows:next,multiple:next/prev,charts});
}
for(const f of Object.values(families))f.multiple=f.after_rows/f.before_rows;
const report={sample_count:samples.length,annotation_unchanged:errors.every(e=>e.error!=='annotation changed'),before_rows:oldRows,after_rows:newRows,multiple:newRows/oldRows,area_rows_validated:areaRows,range_area_rows_validated:rangeRows,unchanged_charts:unchangedCharts,errors,families,samples};
await writeFile(path.join(after+'-specs','density-comparison.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,samples:undefined,families:undefined},null,2));if(errors.length)process.exitCode=1;
