// Reflow only scenes containing stacked areas. Keep complete subtrees intact;
// tall companion panels move above/below the area rather than stretching it.
export function landscapeStackedAreas(job){
 const ids=new Set(job.annotation.charts.filter(c=>c.variation==='stacked_area').map(c=>c.chart_id));if(!ids.size)return false;
 const base=job.provenance?.compact_leaf_size??[340,260],plan=job.plan;
 function size(n,scale){
  if(typeof n==='string'||n.type==='chart'){const id=typeof n==='string'?n:n.chart;return {w:base[0]*scale*(ids.has(id)?1.5:1),h:base[1]*scale*(ids.has(id)?.80:1),area:ids.has(id)};}
  if(n.type==='layer')return {w:base[0]*scale,h:base[1]*scale,area:false};
  if(n.type==='facet'){
   const s=size(n.child,scale),t=plan.datasets.find(d=>d.id===n.datasetId),count=new Set(t.rows.map(r=>r[n.field])).size,cols=Math.min(n.columns??2,count),gap=n.gap??24,label=n.labelHeight??24;
   return {w:s.w*cols+gap*(cols-1),h:(s.h+label)*Math.ceil(count/cols)+gap*(Math.ceil(count/cols)-1),area:s.area};
  }
  if(n.type==='linked')return size(n.child,scale);
  if(n.type==='nested'){const p=size(n.parent,scale);return {...p,w:p.w+100,h:p.h+100};}
  if(n.type==='network')return {w:base[0]*scale,h:base[1]*scale,area:false};
  const ss=n.children.map(c=>size(c,scale)),area=ss.some(s=>s.area),gap=n.gap??28;
  if(area&&n.direction==='horizontal'&&Math.max(...ss.map(s=>s.h))>1.35*Math.min(...ss.map(s=>s.h)))n.direction='vertical';
  const horizontal=n.direction==='horizontal';n.weights=ss.map(s=>horizontal?s.w:s.h);
  return {w:horizontal?ss.reduce((a,s)=>a+s.w,0)+gap*(ss.length-1):Math.max(...ss.map(s=>s.w)),h:horizontal?Math.max(...ss.map(s=>s.h)):ss.reduce((a,s)=>a+s.h,0)+gap*(ss.length-1),area};
 }
 let scale=1,dim;
 for(let i=0;i<12;i++){dim=size(plan.composition,scale);if(dim.w+48<=16000&&dim.h+48<=16000&&(dim.w+48)*(dim.h+48)<=60000000)break;scale*=.9;}
 plan.width=Math.ceil(dim.w+48);plan.height=Math.ceil(dim.h+48);job.provenance??={};job.provenance.area_layout_revision={version:1,charts:[...ids],scale,rule:'landscape area panels; reflow tall horizontal companions as vertical subtrees'};return true;
}
