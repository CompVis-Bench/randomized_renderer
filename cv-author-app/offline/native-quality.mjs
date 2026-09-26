import {varyBarDirections,barKinds} from './bar-variation.mjs';
import {orientParallelCharts} from './parallel-orientation.mjs';
import {facetLayout,trendFraction} from './quality-rules.mjs';
// Apply the same generation policy to the small native preview suites.
export function applyNativeQuality(job,random){
 const {plan,annotation}=job,changes=new Map();
 function visit(n){
  if(!n||typeof n==='string')return [1,1];
  if(n.type==='facet'){
   const ds=plan.datasets.find(d=>d.id===n.datasetId),old=[...new Set(ds.rows.map(r=>r[n.field]))];
   if(!changes.has(n.field))changes.set(n.field,{old,values:Array.from({length:2+Math.floor(random()*5)},(_,i)=>old[i]??`Group ${i+1}`)});
   const {values}=changes.get(n.field),cols=n.columns??2,oldRows=Math.ceil(old.length/cols),child=visit(n.child);
   if(n.coordinateSystem==='Polar')return child;
   Object.assign(n,facetLayout(values.length,random));
   return [child[0]*n.columns/cols,child[1]*Math.ceil(values.length/n.columns)/oldRows];
  }
  const children=n.type==='nested'?[n.parent,n.child]:n.children??[];
  const scales=children.map(visit);return [Math.max(1,...scales.map(s=>s[0])),Math.max(1,...scales.map(s=>s[1]))];
 }
 const scale=visit(plan.composition);
 for(const [f,{old,values}] of changes){
  const maps=values.map((v,i)=>new Map());
  for(const cfg of plan.charts.filter(c=>c.hierarchy||c.parallel)){
   const ds=plan.datasets.find(d=>d.id===cfg.datasetId),key=cfg.hierarchy?.key??cfg.parallel?.recordKey;
   if(!ds.columns.some(c=>c.name===f)||!key)continue;
   values.forEach((v,i)=>ds.rows.filter(r=>r[f]===old[i%old.length]).forEach(r=>maps[i].set(r[key],`${r[key]}-panel-${i+1}`)));
  }
  for(const cfg of plan.charts.filter(c=>c.graph)){
   const nodes=plan.datasets.find(d=>d.id===cfg.datasetId),edges=plan.datasets.find(d=>d.id===cfg.graph.edges),graph=cfg.graph;
   if(!nodes.columns.some(c=>c.name===f))continue;
   values.forEach((v,i)=>nodes.rows.filter(r=>r[f]===old[i%old.length]).forEach(r=>maps[i].set(r[graph.key],`${r[graph.key]}-panel-${i+1}`)));
   edges.rows=maps.flatMap(map=>edges.rows.filter(r=>map.has(r[graph.source])&&map.has(r[graph.target])).map(r=>({...r,[graph.source]:map.get(r[graph.source]),[graph.target]:map.get(r[graph.target])})));
  }
  for(const ds of plan.datasets){
   if(!ds.columns.some(c=>c.name===f))continue;
   ds.rows=values.flatMap((v,i)=>ds.rows.filter(r=>r[f]===old[i%old.length]).map(r=>({...Object.fromEntries(Object.entries(r).map(([key,value])=>[key,maps[i].get(value)??value])),[f]:v})));
   if(ds.primaryKey?.length)ds.primaryKey=[...new Set([...ds.primaryKey,f])];
  }
 }
 for(const c of annotation.charts.filter(c=>['single_line','multi_line','stacked_area'].includes(c.variation))){
  const cfg=plan.charts.find(d=>d.id===c.chart_id),ds=plan.datasets.find(d=>d.id===cfg.datasetId),e=c.encodings;
  const xf=e['position.x']??e['position.theta'],yf=e['position.y']??e['position.radius'];
  const groups=new Map();for(const row of ds.rows){const key=JSON.stringify([...c.repetition_position.map(f=>row[f]),e.color?row[e.color]:0]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  let j=0;for(const rows of groups.values()){const xs=[...new Set(rows.map(r=>r[xf]))].sort((a,b)=>typeof a==='number'?a-b:String(a).localeCompare(String(b),undefined,{numeric:true}));const lo=Math.min(...rows.map(r=>r[yf])),hi=Math.max(...rows.map(r=>r[yf]));for(const row of rows)row[yf]=Number((lo+(hi-lo)*trendFraction(xs.indexOf(row[xf])/Math.max(1,xs.length-1),j%4,j*.4)).toFixed(4));j++;}
 }
 plan.width=Math.ceil(plan.width*scale[0]);plan.height=Math.ceil(plan.height*scale[1]);
 plan.appearance.showFieldLabels=false;
 orientParallelCharts(job,()=>random()<.5?'horizontal':'vertical');
 return varyBarDirections(job,()=>random()<.5?'horizontal':'vertical');
}
