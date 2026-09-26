// Reserve space for the requested axis geometry before rendering. The renderer
// also caps axis length, so the spacing contract holds even in unusual frames.
export function reflowParallelGeometry(job){
 const {plan,annotation}=job,charts=new Map(annotation.charts.map(c=>[c.chart_id,c])),cfgs=new Map(plan.charts.map(c=>[c.id,c]));
 function measure(n,scale){
  if(typeof n==='string'||n.type==='chart'){
   const id=typeof n==='string'?n:n.chart,c=charts.get(id),o=cfgs.get(id)?.basis;
   if(c?.variation==='parallel_coordinates'&&o.parallelAxisValues){const length=180*scale,span=Math.max(1,o.parallelAxisValues.length-1)*length*.55,horizontal=o.axisOrientation==='horizontal';return {w:(horizontal?length:span)+64,h:(horizontal?span:length)+70,parallel:true,area:false};}
   return {w:(c?.variation==='stacked_area'?510:340)*scale,h:(c?.variation==='stacked_area'?208:260)*scale,parallel:false,area:c?.variation==='stacked_area'};
  }
  if(n.type==='facet'){const s=measure(n.child,scale),table=plan.datasets.find(d=>d.id===n.datasetId),count=new Set(table.rows.map(r=>r[n.field])).size,cols=Math.min(n.columns??2,count),gap=n.gap??24,label=n.labelHeight??24;return {...s,w:s.w*cols+gap*(cols-1),h:(s.h+label)*Math.ceil(count/cols)+gap*(Math.ceil(count/cols)-1)};}
  if(n.type==='linked')return measure(n.child,scale);
  if(n.type==='nested'){const s=measure(n.parent,scale);return {...s,w:s.w+100,h:s.h+100};}
  if(n.type==='layer'||n.type==='network')return {w:340*scale,h:260*scale,parallel:false,area:false};
  const ss=n.children.map(c=>measure(c,scale)),parallel=ss.some(s=>s.parallel),area=ss.some(s=>s.area),gap=n.gap??28;
  if(n.direction==='horizontal'&&((area&&Math.max(...ss.map(s=>s.h))>1.35*Math.min(...ss.map(s=>s.h)))||(parallel&&Math.max(...ss.map(s=>s.h))>2*Math.min(...ss.map(s=>s.h)))))n.direction='vertical';
  const horizontal=n.direction==='horizontal';n.weights=ss.map(s=>horizontal?s.w:s.h);
  return {w:horizontal?ss.reduce((a,s)=>a+s.w,0)+gap*(ss.length-1):Math.max(...ss.map(s=>s.w)),h:horizontal?Math.max(...ss.map(s=>s.h)):ss.reduce((a,s)=>a+s.h,0)+gap*(ss.length-1),parallel,area};
 }
 let size,scale=1;for(let i=0;i<20;i++){size=measure(plan.composition,scale);if(size.w+48<=16000&&size.h+48<=16000&&(size.w+48)*(size.h+48)<=60000000)break;scale*=.9;}
 plan.width=Math.ceil(size.w+48);plan.height=Math.ceil(size.h+48);job.provenance.parallel_geometry_revision.layout_scale=scale;
}
