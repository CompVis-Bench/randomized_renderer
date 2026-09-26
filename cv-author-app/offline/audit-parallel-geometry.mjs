import {readRenderAnnotation} from './render-annotation.mjs';
import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {chromium} from 'playwright';import {compileTarget} from './compile.mjs';
const out=path.resolve(process.argv[2]??'outputs/.parallel-stage/composite-1100'),specDir=out+'-specs',read=async p=>JSON.parse(await readFile(p,'utf8')),manifest=await read(path.join(out,'manifest.json'));
const report={samples:manifest.samples.length,chart_instances:0,line_paths:0,axis_counts:{},image_axis_counts:{},image_styles:{straight:0,bezier:0},min_spacing_ratio:null,max_endpoint_error:0,issues:[]};
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
try{for(const s of manifest.samples){const annotation=await readRenderAnnotation(out,s),plan=await read(path.join(specDir,s.sample_id+'.plan.json'));compileTarget(annotation,plan);await page.setContent(await readFile(path.join(specDir,s.sample_id+'.svg'),'utf8'));
 const result=await page.evaluate(plan=>{const errors=[],plots=[...document.querySelectorAll('[data-parallel-chart]')],counts={},styles=new Set(),ratios=[];let lineCount=0,maxError=0;
  for(const g of plots){const id=g.getAttribute('data-parallel-chart'),cfg=plan.charts.find(c=>c.id===id),o=cfg.basis,table=plan.datasets.find(t=>t.id===cfg.datasetId),context=JSON.parse(g.getAttribute('data-parallel-context')??'{}'),rows=table.rows.filter(r=>Object.entries(context).every(([f,v])=>String(r[f])===String(v))),axes=[...g.querySelectorAll('[data-parallel-axis]')],horizontal=g.getAttribute('data-axis-orientation')==='horizontal';
   if(axes.length<3||axes.length>8)errors.push('axis count out of range');counts[axes.length]=(counts[axes.length]??0)+1;
   const domainPath=axes[0].querySelector('path.domain'),b=domainPath.getBoundingClientRect(),length=horizontal?b.width:b.height,positions=axes.map(a=>horizontal?a.getCTM().f:a.getCTM().e),gap=Math.min(...positions.slice(1).map((p,i)=>p-positions[i]));ratios.push(gap/length);if(gap+1e-5<length*.5)errors.push('axis spacing too narrow');
   const all=table.rows.map(r=>Number(r[o.parallelValue]));let lo=Math.min(...all),hi=Math.max(...all);if(lo===hi){lo-=1;hi+=1;}
   const numericLength=+g.getAttribute('data-axis-length'),numericGap=+g.getAttribute('data-axis-spacing'),dims=axes.map(a=>a.getAttribute('data-parallel-axis'));
   for(const p of g.querySelectorAll('[data-parallel-line]')){lineCount++;const style=p.getAttribute('data-line-style');styles.add(style);const d=p.getAttribute('d'),segments=d.match(/[MLC][^MLC]*/g)??[];
    if(style==='bezier'?!d.includes('C'):d.includes('C')||!d.includes('L'))errors.push('path geometry does not match assigned style');if(style!==o.parallelLineStyle)errors.push('style differs from plan');if(segments.length!==axes.length)errors.push('path misses axes');
    const records=rows.filter(r=>String(r._series)===p.getAttribute('data-record'));
    for(const [i,segment] of segments.entries()){const nums=segment.slice(1).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number)??[],end=nums.slice(-2),row=records.find(r=>String(r[o.parallelDimension])===dims[i]);if(!row){errors.push('missing record for axis');continue;}
     const v=(Number(row[o.parallelValue])-lo)/(hi-lo)*numericLength,expected=horizontal?[v,i*numericGap]:[i*numericGap,numericLength-v];const error=Math.max(Math.abs(end[0]-expected[0]),Math.abs(end[1]-expected[1]));maxError=Math.max(maxError,error);if(error>.0011)errors.push('line endpoint does not encode data value');
    }
   }
  }if(styles.size!==1)errors.push('image mixes line styles');return {errors:[...new Set(errors)],instances:plots.length,lineCount,counts,styles:[...styles],ratios,maxError};
 },plan);
 report.chart_instances+=result.instances;report.line_paths+=result.lineCount;for(const [n,count] of Object.entries(result.counts))report.axis_counts[n]=(report.axis_counts[n]??0)+count;for(const n of Object.keys(result.counts))report.image_axis_counts[n]=(report.image_axis_counts[n]??0)+1;for(const style of result.styles)report.image_styles[style]++;report.min_spacing_ratio=Math.min(report.min_spacing_ratio??Infinity,...result.ratios);report.max_endpoint_error=Math.max(report.max_endpoint_error,result.maxError);if(result.errors.length)report.issues.push({sample:s.sample_id,errors:result.errors});
 }
 if(Math.abs(report.image_styles.straight-report.image_styles.bezier)>1)report.issues.push({error:'image style assignment unbalanced'});
 await writeFile(path.join(specDir,'parallel-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.issues.length)process.exitCode=1;
}finally{await browser.close();}
