import {readRenderAnnotation} from './render-annotation.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.resolve(process.argv[2]),specDir=out+'-specs';
const manifest=JSON.parse(await readFile(path.join(out,'manifest.json')));
const stats={samples:manifest.samples.length,facets:0,facet_sizes:{},wrapped:0,row_flow:0,budget_reflows:0,plain_area:0,stacked_area:0,streamgraph:0,area_choices:{plain:0,stacked:0,stream:0},parallel_axes:{horizontal:0,vertical:0},bar_directions:{horizontal:0,vertical:0},bar_types:{bar:0,stacked_bar:0,grouped_bar:0},stacked_bar:0,contour:0,unit_links:0,issues:[]};
for(const sample of manifest.samples){
 const a=await readRenderAnnotation(out,sample),plan=JSON.parse(await readFile(path.join(specDir,sample.sample_id+'.plan.json'))),svg=await readFile(path.join(specDir,sample.sample_id+'.svg'),'utf8');
 const issue=message=>stats.issues.push({sample:sample.sample_id,message});
 const table=id=>plan.datasets.find(d=>d.id===id);
 function walk(n){
  if(!n||typeof n==='string')return;
  if(n.type==='facet'){
   const count=n.values?.length??new Set(table(n.datasetId).rows.map(r=>r[n.field])).size;
   stats.facets++;stats.facet_sizes[count]=(stats.facet_sizes[count]??0)+1;stats.wrapped+=!!n.wrap;stats.row_flow+=n.flow==='row';stats.budget_reflows+=!!n.budgetReflow;
   if(count<2||count>6)issue(`Facet size ${count}`);
   if(n.coordinateSystem!=='Polar'&&!svg.includes('data-facet-border="true"'))issue('Facet border missing');
   walk(n.child);
  }else if(n.type==='nest'||n.type==='nested'){walk(n.parent);walk(n.child);}else if(n.type==='linked'){walk(n.child);n.links.forEach(walk);}else n.children?.forEach(walk);
 }
 walk(plan.composition);
 for(const c of a.charts){
  const cfg=plan.charts.find(d=>d.id===c.chart_id),options=cfg.basis??cfg.options??cfg.parallel??{},rows=table(cfg.datasetId)?.rows??[],e=c.encodings;
  if(c.variation==='parallel_coordinates'){
   const direction=options.axisOrientation??'vertical';stats.parallel_axes[direction]++;
   if(options.parallelDimension&&e[direction==='horizontal'?'position.y':'position.x']!==options.parallelDimension)issue('Parallel dimension channel does not match axis orientation');
   if(options.parallelValue&&e[direction==='horizontal'?'position.x':'position.y']!==options.parallelValue)issue('Parallel value channel does not match axis orientation');
   const custom=`data-parallel-chart="${c.chart_id}" data-axis-orientation="${direction}"`;
   const native=new RegExp(`data-chart-id="${c.chart_id}-instance-[^"]+"[^>]*data-axis-orientation="${direction}"`);
   if(!svg.includes(custom)&&!native.test(svg))issue('Parallel SVG orientation does not match construction plan');
  }
  if(['bar','stacked_bar','grouped_bar','unit_bar'].includes(c.variation)){
   const direction=options.barOrientation??'vertical';stats.bar_directions[direction]++;if(c.variation in stats.bar_types)stats.bar_types[c.variation]++;
   if(options.barOrientation&&!options.distribution&&!svg.includes(`data-bar-chart="${c.chart_id}" data-bar-orientation="${direction}"`))issue('Bar SVG orientation does not match construction plan');
   if(c.variation==='grouped_bar'&&!e[direction==='horizontal'?'position.y_offset':'position.x_offset']&&!e.color)issue('Grouped bar has no grouping field');
  }
  if(c.variation==='normalized_stacked_bar')issue('Normalized bar remains');
  if(c.variation==='plain_area'){
   stats.plain_area++;if(!options.distribution)stats.area_choices.plain++;
   if(e['position.y2'])issue('Plain area still uses interval bounds');
   if(!options.distribution&&rows.some(r=>!(r[e['position.y']]>0)))issue('Nonpositive area height');
  }
  if(c.variation==='stacked_area'){
   stats[options.streamgraph?'streamgraph':'stacked_area']++;
   if(cfg.options)stats.area_choices[options.streamgraph?'stream':'stacked']++;
   if(options.streamgraph&&new Set(rows.map(r=>r._series)).size<2)issue('Streamgraph has fewer than two series');
  }
  if(c.variation==='stacked_bar'){
   stats.stacked_bar++;
   const groups=new Map();for(const r of rows){const key=JSON.stringify(c.repetition_position.map(f=>r[f]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
   for(const rs of groups.values())if(new Set(rs.map(r=>r[e[options.barOrientation==='horizontal'?'position.y':'position.x']])).size<2){issue('Stacked bar has only one category in a cell');break;}
  }
  if(c.variation==='contour'){stats.contour++;if(!svg.includes('data-contour-level='))issue('No visible contour levels');}
  if(c.variation==='link'&&cfg.basis){stats.unit_links++;if(!svg.includes('data-link-unit="edge"'))issue('Link has no whole-unit endpoints');}
 }
 const provenance=await readFile(path.join(specDir,sample.sample_id+'.provenance.json'),'utf8').then(JSON.parse).catch(()=>null);
 for(const change of provenance?.chart_changes??[])if(change.before.variation==='plain_area'&&change.after.variation==='stacked_area')stats.area_choices[change.streamgraph?'stream':'stacked']++;
}
await writeFile(path.join(specDir,'quality-validation.json'),JSON.stringify(stats,null,2)+'\n');console.log(JSON.stringify(stats,null,2));if(stats.issues.length)process.exitCode=1;
