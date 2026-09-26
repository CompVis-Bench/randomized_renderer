// Orientation names describe the numeric axes, not the connecting polylines.
export function orientParallelCharts(job, choose) {
 const {annotation,plan,provenance}=job;
 const configs=new Map(plan.charts.map(c=>[c.id,c]));
 const targets=new Map(annotation.charts.map(c=>[c.chart_id,c]));
 const changes=[];
 const swap=c=>{
  const before=structuredClone(c.encodings),e=c.encodings;
  delete e['position.x'];delete e['position.y'];
  if(before['position.y'])e['position.x']=before['position.y'];
  if(before['position.x'])e['position.y']=before['position.x'];
  changes.push({chart_id:c.chart_id,before:{variation:c.variation,encodings:before},after:{variation:c.variation,encodings:structuredClone(e)},reason:'parallel axis orientation'});
 };
 const leaves=n=>typeof n==='string'?[n]:n.type==='chart'?[n.chart]:n.type==='facet'?leaves(n.child):['nest','nested'].includes(n.type)?[...leaves(n.parent),...leaves(n.child)]:(n.children??[]).flatMap(leaves);
 for(const c of annotation.charts.filter(c=>c.variation==='parallel_coordinates')){
  const cfg=configs.get(c.chart_id),options=cfg.basis??cfg.options??(cfg.parallel??={});
  const previous=options.axisOrientation??'vertical',next=choose(c.chart_id);
  if(!['horizontal','vertical'].includes(next))throw new Error('Invalid parallel axis orientation');
  options.parallelDimension??=c.encodings[previous==='vertical'?'position.x':'position.y'];
  options.parallelValue??=c.encodings[previous==='vertical'?'position.y':'position.x'];
  options.axisOrientation=next;
  if(previous===next)continue;
  swap(c);
  function visit(n){
   if(!n||typeof n==='string')return;
   if(n.type==='nest'&&n.anchor===c.chart_id){
    if(n.placement==='axis')for(const id of leaves(n.child)){
     swap(targets.get(id));configs.get(id).options.axisOrientation=next;
    }
    if(n.placement==='above'&&next==='horizontal')n.placement='beside';
    else if(n.placement==='beside'&&next==='vertical')n.placement='above';
   }
   if(n.type==='nest'||n.type==='nested'){visit(n.parent);visit(n.child);}
   else if(n.type==='facet')visit(n.child);
   else n.children?.forEach(visit);
  }
  visit(plan.composition);
 }
 if(provenance){
  provenance.chart_changes??=[];
  for(const change of changes){const old=provenance.chart_changes.find(c=>c.chart_id===change.chart_id);if(old)Object.assign(old,{after:change.after,orientation_reason:change.reason});else provenance.chart_changes.push(change);}
 }
 return job;
}
