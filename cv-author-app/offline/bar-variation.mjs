export const barKinds=['bar','stacked_bar','grouped_bar'];
export const barFamily=new Set([...barKinds,'unit_bar','normalized_stacked_bar']);
export function varyBarDirections(job,choose){
 const {annotation,plan,provenance}=job,targets=new Map(annotation.charts.map(c=>[c.chart_id,c])),constrained=new Map();
 const leaves=n=>typeof n==='string'?[n]:n.type==='chart'?[n.chart]:n.type==='facet'?leaves(n.child):['nest','nested'].includes(n.type)?[...leaves(n.parent),...leaves(n.child)]:(n.children??[]).flatMap(leaves);
 function walk(n){
  if(!n||typeof n==='string')return;
  if(n.type==='overlay')for(const id of leaves(n))constrained.set(id,'vertical');
  if(n.type==='aligned')for(const id of leaves(n))if(barFamily.has(targets.get(id)?.variation))constrained.set(id,'horizontal');
  if(n.type==='nest'||n.type==='nested'){walk(n.parent);walk(n.child);}else if(n.type==='facet')walk(n.child);else if(n.type==='linked'){walk(n.child);n.links.forEach(walk);}else n.children?.forEach(walk);
 }
 walk(plan.composition);
 for(const c of annotation.charts.filter(c=>barFamily.has(c.variation))){
  const cfg=plan.charts.find(d=>d.id===c.chart_id);
  const options=cfg.basis??cfg.options??(cfg.basis={categoricalFields:plan.datasets.find(d=>d.id===cfg.datasetId).columns.filter(c=>c.type!=='quantitative').map(c=>c.name),repetitionFields:c.repetition_position});
  if(options.distribution){options.barOrientation=options.axisOrientation==='horizontal'?'vertical':'horizontal';options.orientationConstraint='parallel-axis distribution';continue;}
  const old=options.barOrientation??(options.horizontal||!c.encodings['position.y']||c.encodings['position.y_offset']?'horizontal':'vertical');
  const before={variation:c.variation,encodings:structuredClone(c.encodings)},e=c.encodings;
  // Some source stacks encode only a numeric measure. Give each observed
  // category its own explicit position instead of stacking the whole cell.
  if(['stacked_bar','grouped_bar'].includes(c.variation)&&(!e['position.x']||!e['position.y'])){
   const field=`F${1+Math.max(0,...annotation.data_fields.map(f=>Number(f.field_id.slice(1))))}`;
   const channel=old==='horizontal'?'position.y':'position.x';e[channel]=field;
   annotation.data_fields.push({field_id:field,image_role:'explicit bar category'});
   const table=plan.datasets.find(d=>d.id===cfg.datasetId);table.columns.push({name:field,type:'nominal'});
   const counters=new Map();
   for(const row of table.rows){const key=JSON.stringify([...c.repetition_position.map(f=>row[f]),row._series??row[e.color]??0]);const i=counters.get(key)??0;counters.set(key,i+1);row[field]=`Category ${i+1}`;}
   options.categoricalFields??=[];options.categoricalFields.push(field);
   if(provenance?.field_domains)provenance.field_domains[field]=[...new Set(table.rows.map(r=>r[field]))];
  }
  const next=constrained.get(c.chart_id)??choose(c.chart_id);
  if(!['vertical','horizontal'].includes(next))throw new Error('Invalid bar orientation');
  options.barOrientation=next;
  if(constrained.has(c.chart_id))options.orientationConstraint='shared overlay or aligned tree coordinates';
  if(old!==next)for(const [a,b] of [['position.x','position.y'],['position.x_offset','position.y_offset']]){
   const x=e[a],y=e[b];delete e[a];delete e[b];if(x)e[b]=x;if(y)e[a]=y;
  }
  if(provenance&&JSON.stringify(before.encodings)!==JSON.stringify(e)){provenance.chart_changes??=[];const prior=provenance.chart_changes.find(d=>d.chart_id===c.chart_id);const after={variation:c.variation,encodings:structuredClone(e)};if(prior)prior.after=after;else provenance.chart_changes.push({chart_id:c.chart_id,before,after,reason:'bar orientation and explicit category'});}
 }
 return job;
}
