import {basisChannels} from './basis-contracts.mjs';
const assert=(v,m)=>{if(!v)throw new Error(m);};
export const nestedLeaves=n=>typeof n==='string'?[n]:n.type==='facet'?nestedLeaves(n.child):n.type==='nest'?[...nestedLeaves(n.parent),...nestedLeaves(n.child)]:n.children.flatMap(nestedLeaves);
export function validateNestedComposition(node,chartIds,depth=0){
 assert(depth<16,'Nested composition is too deep');
 if(typeof node==='string'){assert(chartIds.has(node),`Unknown chart ${node}`);return;}
 assert(node&&['overlay','concat','facet','nest','aligned'].includes(node.type),'Unknown nested composition');
 const next=n=>validateNestedComposition(n,chartIds,depth+1);
 if(node.type==='facet'){assert(node.values?.length>=2&&new Set(node.values).size===node.values.length,'Facet needs distinct values');next(node.child);}
 else if(node.type==='nest'){assert(chartIds.has(node.anchor)&&nestedLeaves(node.parent).includes(node.anchor),'Invalid nested anchor');assert(node.fields?.length&&node.width>=36&&node.height>=36,'Invalid nested placement');next(node.parent);next(node.child);}
 else {assert(node.children?.length>=2,'Composition needs multiple children');node.children.forEach(next);}
}
export function compileNested(annotation,plan){
 assert(annotation.schema_version==='chart_encoding_variation_only_v3','Expected v3 annotation');
 const byId=new Map(plan.charts.map(c=>[c.id,c])),tables=new Map(plan.datasets.map(d=>[d.id,d]));
 assert(byId.size===plan.charts.length,'Duplicate chart IDs');
 validateNestedComposition(plan.composition,new Set(byId.keys()));
 const inherited=new Map();
 const replacementAnchors=new Set();
 function visit(n,reps=[]){
  if(typeof n==='string'){assert(!inherited.has(n),`Repeated template ${n}: use facet/nest`);inherited.set(n,[...new Set(reps)]);return;}
  if(n.type==='facet')visit(n.child,[...reps,n.field]);
  else if(n.type==='nest'){if(n.placement==='center')replacementAnchors.add(n.anchor);visit(n.parent,reps);visit(n.child,[...reps,...n.fields]);}
  else n.children.forEach(c=>visit(c,reps));
 }
 visit(plan.composition);
 const fieldIds=new Set(annotation.data_fields.map(f=>f.field_id));
 const visible=new Map(annotation.charts.map(c=>[c.chart_id,c]));
 assert(visible.size===annotation.charts.length,'Duplicate annotated chart IDs');
 for(const id of visible.keys())assert(byId.has(id),`Missing chart ${id}`);
 const charts=plan.charts.map(cfg=>{
  const c=cfg.layoutOnly?cfg.layoutAnnotation:visible.get(cfg.id);
  assert(c&&c.chart_id===cfg.id,`Unused or unannotated chart ${cfg.id}`);
  if(cfg.layoutOnly)assert(!visible.has(cfg.id)&&replacementAnchors.has(cfg.id)&&c.variation==='point'&&cfg.options.host==='scatter','Only replaced scatter points may be layout anchors');
  const config=byId.get(c.chart_id),table=tables.get(config?.datasetId),allowed=basisChannels[c.variation];
  assert(config&&table&&allowed,`Missing chart contract ${c.chart_id}`);
  const columns=new Map(table.columns.map(c=>[c.name,c.type]));
  const actual=inherited.get(c.chart_id);
  assert(actual&&actual.length===c.repetition_position.length&&actual.every(f=>c.repetition_position.includes(f)),`Repetition mismatch ${c.chart_id}`);
  for(const [ch,f] of Object.entries(c.encodings))assert(allowed.includes(ch)&&columns.has(f)&&(cfg.layoutOnly||fieldIds.has(f)),`Invalid binding ${c.chart_id} ${ch}:${f}`);
  for(const f of actual)assert(columns.has(f)&&fieldIds.has(f),`Missing inherited field ${f}`);
  for(const row of table.rows){for(const column of table.columns){assert(row[column.name]!==undefined,`Missing value ${column.name}`);if(column.type==='quantitative')assert(Number.isFinite(Number(row[column.name])),'Nonfinite numeric value');}}
  if(c.variation==='plain_area'&&c.encodings['position.y2'])for(const r of table.rows)assert(Number(r[c.encodings['position.y']])<Number(r[c.encodings['position.y2']]),'Area bounds cross');
  if(c.variation==='plain_area'&&!c.encodings['position.y2']&&!config.options.distribution)for(const r of table.rows)assert(Number(r[c.encodings['position.y']])>0,'Area height must be positive');
  if(c.variation==='link')assert(c.link_targets?.every(id=>byId.has(id)),'Invalid link targets');
  return {id:c.chart_id,...cfg.layoutOnly?{layoutOnly:true}:{},spec:{chartType:'OfflineNestedIdiom',datasetId:table.id,encodings:Object.fromEntries(Object.entries(c.encodings).map(([k,f])=>[k.replace('position.',''),{field:f,type:columns.get(f)}])),offlineVariation:c.variation,offlineOptions:structuredClone(config.options),offlineRepetition:actual,offlineLinkTargets:c.link_targets??[]}};
 });
 assert(charts.length===byId.size&&charts.length===inherited.size,'Unused or unannotated chart');
 return {version:1,width:plan.width,height:plan.height,background:'#ffffff',appearance:structuredClone(plan.appearance),datasets:structuredClone(plan.datasets),charts,composition:structuredClone(plan.composition)};
}
