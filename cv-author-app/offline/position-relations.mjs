// A shared field is retained only within a spatially evidenced component.
export const positionRevision = 'position-relations-v2-2026-09-24';
const unique = xs => [...new Set(xs)];
const nodeOf = n => typeof n === 'string' ? {type:'chart',chart:n} : n;
export function positionLeaves(input) {
 const n=nodeOf(input);
 if(n.type==='chart')return [n.chart];
 if(n.type==='facet')return positionLeaves(n.child);
 if(n.type==='linked')return [...positionLeaves(n.child),...n.links.flatMap(positionLeaves)];
 if(n.type==='network')return [n.nodes,n.links];
 if(['nest','nested'].includes(n.type))return [...positionLeaves(n.parent),...positionLeaves(n.child)];
 return n.children.flatMap(positionLeaves);
}
const used = c => unique([...Object.values(c.encodings),...c.repetition_position]);
function rename(value,map) {
 if(typeof value==='string')return map[value]??value;
 if(Array.isArray(value))return value.map(v=>rename(v,map));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[map[k]??k,rename(v,map)]));
 return value;
}
const numericKinds = new Set(['point','connected_scatterplot','dotplot','tick_plot','contour','single_line','multi_line','plain_area','stacked_area']);
const bars = new Set(['bar','unit_bar','grouped_bar','stacked_bar','normalized_stacked_bar']);
function axisKind(c,cfg,axis) {
 if(!cfg?.basis || !c.encodings['position.'+axis])return null;
 if(axis==='theta')return c.encodings['position.radius']&&['single_radar','multi_radar','radial_area','single_line','pie/donut/radial_bar'].includes(c.variation)?'category':null;
 if(bars.has(c.variation)) {
  const horizontal=cfg.basis.barOrientation==='horizontal',category=horizontal?'y':'x';
  return axis===category?'category':c.variation.includes('stacked')?null:'number';
 }
 if(numericKinds.has(c.variation)&&!c.encodings['position.theta'])return axis==='y'&&c.variation==='stacked_area'?null:'number';
 if(['rect_heatmap','calendar_heatmap','hexbin'].includes(c.variation))return 'category';
 return null;
}
export function refinePositionRelations(job,{layout=true}={}) {
 const fallback=layout?structuredClone(job):null;
 const {annotation:a,plan:p}=job; job.provenance??={};
 if(job.provenance.position_revision?.revision===positionRevision)return job.provenance.position_revision;
 const charts=new Map(a.charts.map(c=>[c.chart_id,c])),configs=new Map(p.charts.map(c=>[c.id,c]));
 const report={revision:positionRevision,alignments:[],retained:[],splits:[],rejected:[]};
 // A line-anchored pie does not identify an individual bar merely because
 // the two parent layers use the same scale. Keep its real line anchor, but
 // separate the bar fields unless the bar itself supplies that anchor.
 const indirectPieBars=new Map();
 function inspectPieAnchors(input){
  const n=nodeOf(input);
  if(['nest','nested'].includes(n.type)){
   const anchor=n.anchor??n.anchorChart??positionLeaves(n.parent)[0];
   const pies=positionLeaves(n.child).filter(id=>charts.get(id)?.variation==='pie/donut/radial_bar');
   if(pies.length&&['overlay','layer'].includes(nodeOf(n.parent).type)){
    const fields=n.fields??Object.entries(charts.get(anchor)?.encodings??{}).filter(([ch])=>['position.x','position.y'].includes(ch)).map(([,f])=>f);
    for(const id of positionLeaves(n.parent))if(id!==anchor&&bars.has(charts.get(id)?.variation)){
     const fs=fields.filter(f=>used(charts.get(id)).includes(f));
     if(fs.length){indirectPieBars.set(id,new Set([...(indirectPieBars.get(id)??[]),...fs]));report.rejected.push({charts:[id,anchor,...pies],fields:fs,reason:'line-anchored pies have no explicit bar correspondence'});}
    }
   }
   inspectPieAnchors(n.parent);inspectPieAnchors(n.child);
  }else if(n.type==='facet')inspectPieAnchors(n.child);
  else if(n.type==='linked'){inspectPieAnchors(n.child);n.links.forEach(inspectPieAnchors);}
  else if(n.children)n.children.forEach(inspectPieAnchors);
 }
 if(p.composition)inspectPieAnchors(p.composition);
 const table=id=>p.datasets.find(t=>t.id===configs.get(id).datasetId);
 const values=(id,f)=>unique(table(id).rows.map(r=>r[f])).sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b),undefined,{numeric:true}));
 function descriptor(input,axis) {
  const n=nodeOf(input);
  if(n.type==='chart') {const c=charts.get(n.chart),kind=c&&axisKind(c,configs.get(n.chart),axis);return kind?{field:c.encodings['position.'+axis],kind,ids:[n.chart]}:null;}
  if(n.type==='facet'&&axis!=='theta'&&!n.coordinateSystem?.includes('Polar'))return {field:n.field,kind:'category',ids:positionLeaves(n.child),facet:true};
  return null;
 }
 function arrange(input) {
  const n=nodeOf(input);
  if(n.type==='facet')n.child=arrange(n.child);
  else if(['nest','nested'].includes(n.type)){n.parent=arrange(n.parent);n.child=arrange(n.child);}
  else if(n.type==='linked'){n.child=arrange(n.child);n.links=n.links.map(arrange);}
  else if(n.children&&n.type!=='layer')n.children=n.children.map(arrange);
  if(n.type==='concat'&&layout){
   for(const axis of ['x','y','theta']){
    const ds=n.children.map(c=>descriptor(c,axis));
    if(ds.some(d=>!d)||!ds.every(d=>d.field===ds[0].field&&d.kind===ds[0].kind))continue;
    const field=ds[0].field,ids=ds.flatMap(d=>d.ids),kind=ds[0].kind,domains=ids.map(id=>values(id,field));
    // A repeated position and a mark must expose the same categories.
    if(kind==='category'&&!domains.every(d=>JSON.stringify(d)===JSON.stringify(domains[0])))continue;
    const all=domains.flat(),lo=Math.min(0,...all.map(Number)),hi=Math.max(...all.map(Number));
    if(kind==='number'&&!all.every(v=>Number.isFinite(Number(v))))continue;
    n.direction=axis==='x'?'vertical':axis==='y'?'horizontal':'radial';
    n.alignment={field,axis,kind,domain:kind==='category'?domains[0]:[lo,hi===lo?lo+1:hi+(hi-lo)*.1]};
    delete n.weights;
    if(axis==='theta'){delete n.radialBoundaries; n.innerRadiusRatio=.12;}
    report.alignments.push({field,axis,charts:ids,kind,has_repetition:ds.some(d=>d.facet)});
    break;
   }
  }
  return typeof input==='string'?input:n;
 }
 if(p.composition)p.composition=arrange(p.composition);
 // Prove connectivity separately for every field. Incidental color/size equality
 // never establishes a relation under this dataset's position-only contract.
 const parent=new Map();
 const key=(f,id)=>f+'/'+id;
 const find=k=>{if(!parent.has(k))parent.set(k,k);if(parent.get(k)!==k)parent.set(k,find(parent.get(k)));return parent.get(k);};
 const union=(f,ids,reason)=>{
  ids=unique(ids).filter(id=>charts.has(id)&&used(charts.get(id)).includes(f));if(ids.length<2)return;
  for(const id of ids.slice(1))parent.set(find(key(f,id)),find(key(f,ids[0])));
  report.retained.push({field:f,charts:ids,evidence:reason});
 };
 function prove(input){
  const n=nodeOf(input),ids=positionLeaves(n);
  if(n.type==='facet'){
   union(n.field,ids,'shared-facet-position');prove(n.child);
  }else if(['nest','nested'].includes(n.type)){
   const anchor=n.anchor??n.anchorChart??positionLeaves(n.parent)[0],c=charts.get(anchor),cfg=configs.get(anchor);
   const fields=n.fields??(c?Object.entries(c.encodings).filter(([ch])=>['position.x','position.y','position.theta','position.radius'].includes(ch)).map(([,f])=>f):cfg?.spec?Object.values(cfg.spec.encodings).map(e=>e.field):[]);
   for(const f of fields)union(f,[anchor,...positionLeaves(n.child)],'nested-anchor');
   prove(n.parent);prove(n.child);
  }else if(n.type==='linked'){prove(n.child);n.links.forEach(prove);}
  else if(n.type==='concat'){
   if(n.alignment)union(n.alignment.field,ids,'aligned-'+n.alignment.axis);
   n.children.forEach(prove);
  }else if(['overlay','layer','aligned','network'].includes(n.type)){
   const members=ids.filter(id=>charts.has(id));
   for(const axis of n.type==='aligned'?['y']:['x','y']){
    const byField=new Map();
    for(const id of members){const c=charts.get(id),f=c.encodings['position.'+axis];if(f){if(!byField.has(f))byField.set(f,[]);byField.get(f).push(id);}}
    // Nested overlays use explicit common domains; aligned rows use a row key.
    for(const [f,cs] of byField)union(f,cs.filter(id=>!indirectPieBars.get(id)?.has(f)),n.type==='aligned'?'aligned-row-position':n.type+'-coordinate');
   }
   if(n.type==='aligned'&&n.field)union(n.field,members,'aligned-row-key');
   if(n.children)n.children.forEach(prove);
  }
 }
 if(p.composition)prove(p.composition);
 const byField=new Map();for(const c of a.charts)for(const f of used(c)){if(!byField.has(f))byField.set(f,[]);byField.get(f).push(c.chart_id);}
 let next=Math.max(...a.data_fields.map(f=>Number(f.field_id.slice(1))))+1;
 const maps=Object.fromEntries(a.charts.map(c=>[c.chart_id,{}]));
 for(const [f,ids] of byField){
  const groups=new Map();for(const id of ids){const root=find(key(f,id));if(!groups.has(root))groups.set(root,[]);groups.get(root).push(id);}
  if(groups.size<2)continue;
  for(const group of [...groups.values()].slice(1)){
   const newField='F'+next++;for(const id of group)maps[id][f]=newField;
   a.data_fields.push({...a.data_fields.find(d=>d.field_id===f),field_id:newField,image_role:`Independent spatial field (split from ${f})`});
   report.splits.push({field:f,replacement:newField,charts:group,reason:'no common visible position mapping'});
  }
 }
 // Each chart gets its own table only when its renaming differs from a sibling.
 const originalTables=new Map(p.datasets.map(t=>[t.id,structuredClone(t)]));
 const tableVersions=new Map();
 for(const c of a.charts){
  const id=c.chart_id,map=maps[id],cfg=configs.get(id),oldTable=originalTables.get(cfg.datasetId);
  const signature=cfg.datasetId+JSON.stringify(map);
  if(!tableVersions.has(signature)){
   const already=[...tableVersions.values()].filter(t=>t.original===cfg.datasetId).length;
   const targetId=already?cfg.datasetId+'_'+id:cfg.datasetId;
   const t=rename(oldTable,map);t.id=targetId;tableVersions.set(signature,{original:cfg.datasetId,table:t});
  }
  const targetId=tableVersions.get(signature).table.id;
  Object.assign(c,rename(c,map));Object.assign(cfg,rename(cfg,map));cfg.datasetId=targetId;
  if(cfg.options?.aggregation){const agg=cfg.options.aggregation,source=charts.get(agg.source);if(!source||!used(source).includes(agg.groupBy)){report.removed_aggregations??=[];report.removed_aggregations.push({chart:id,...agg});delete cfg.options.aggregation;}}
 }
 // Keep layout-only tables too.
 p.datasets=[...tableVersions.values()].map(v=>v.table).concat(p.datasets.filter(t=>![...tableVersions.values()].some(v=>v.original===t.id)));
 function relabel(input){
  const n=nodeOf(input),ids=positionLeaves(n),map=maps[ids.find(id=>maps[id])]??{};
  if(n.type==='facet') {n.field=map[n.field]??n.field;if(n.datasetId)n.datasetId=configs.get(ids[0]).datasetId;n.child=relabel(n.child);}
  else if(['nest','nested'].includes(n.type)) {const anchor=n.anchor??n.anchorChart??positionLeaves(n.parent)[0],am=maps[anchor]??map;if(n.fields)n.fields=rename(n.fields,am);n.parent=relabel(n.parent);n.child=relabel(n.child);}
  else if(n.type==='linked'){n.child=relabel(n.child);n.links=n.links.map(relabel);}
  else if(n.children){if(n.alignment)n.alignment=rename(n.alignment,map);if(n.field)n.field=map[n.field]??n.field;n.children=n.children.map(relabel);}
  return typeof input==='string'?input:n;
 }
 if(p.composition)p.composition=relabel(p.composition);
 const live=new Set(a.charts.flatMap(used));a.data_fields=a.data_fields.filter(f=>live.has(f.field_id));
 if(report.alignments.length){
  function minimum(input){const n=nodeOf(input);if(n.type==='chart')return [180,150];if(n.type==='facet'){const v=n.values??values(positionLeaves(n)[0],n.field),s=minimum(n.child),cols=Math.min(n.columns??2,v.length),rows=Math.ceil(v.length/cols);return [cols*(s[0]+24),rows*(s[1]+48)];}if(['nest','nested'].includes(n.type))return [340,280];if(n.type==='linked')return minimum(n.child);if(!n.children)return [340,280];if(n.alignment?.axis==='theta')return [620,620];const ss=n.children.map(minimum);if(n.alignment)for(let i=0;i<ss.length;i++){const child=nodeOf(n.children[i]);if(child.type==='facet'&&child.field===n.alignment.field){const count=n.alignment.domain.length;if(n.alignment.axis==='x')ss[i]=[count*180+64,220];else ss[i]=[260,count*150+70];}}const horiz=n.direction==='horizontal';return [horiz?ss.reduce((a,s)=>a+s[0],0)+28*(ss.length-1):Math.max(...ss.map(s=>s[0])),horiz?Math.max(...ss.map(s=>s[1])):ss.reduce((a,s)=>a+s[1],0)+28*(ss.length-1)];}
  const [w,h]=minimum(p.composition);p.width=Math.max(p.width,Math.ceil(w+48));p.height=Math.max(p.height,Math.ceil(h+48));
  let areaExpansion=1;
  function fits(input,w,h,shared){
   const n=nodeOf(input);if(w<16||h<16)return false;
   if(n.type==='chart'){if(charts.get(n.chart)?.variation==='stacked_area'){const small=!shared&&(w<160||h<140),px=small?16:64,py=small?15:70;areaExpansion=Math.max(areaExpansion,(1.5*(h-py)+px)/w);}return w>=(shared?80:48)&&h>=(shared?86:44);}
   if(n.type==='facet'){
    const count=(n.values??values(positionLeaves(n)[0],n.field)).length;
    if(shared?.field===n.field){const horizontal=shared.axis==='x';return fits(n.child,horizontal?(w-64)/count*.94:w,horizontal?h-24:(h-70)/count*.94-24,null);}
    const cols=Math.min(n.columns??2,count),rows=Math.ceil(count/cols),gap=n.gap??24;return fits(n.child,(w-gap*(cols-1))/cols,(h-gap*(rows-1))/rows-(n.labelHeight??24),shared);
   }
   if(n.type==='linked')return fits(n.child,w,h,shared);
   if(['nest','nested'].includes(n.type))return true; // Existing anchor frames are unchanged.
   if(n.type==='layer'||n.type==='network')return true;
   if(['radial','angular'].includes(n.direction))return n.children.every(c=>fits(c,w,h,n.alignment??shared));
   const weights=n.weights??n.children.map(()=>1),sum=weights.reduce((a,b)=>a+b,0),horizontal=n.direction==='horizontal',space=(horizontal?w:h)-(n.gap??24)*(weights.length-1);
   return n.children.every((c,i)=>fits(c,horizontal?space*weights[i]/sum:w,horizontal?h:space*weights[i]/sum,n.alignment??shared));
  }
  let feasible;for(let attempt=0;attempt<8;attempt++){areaExpansion=1;feasible=fits(p.composition,p.width-48,p.height-48,null);if(areaExpansion<=1+1e-8)break;p.width=Math.ceil(48+(p.width-48)*areaExpansion*1.01);if(p.width>16000||p.width*p.height>60000000)break;}
  if(p.width>16000||p.height>16000||p.width*p.height>60000000||!feasible||areaExpansion>1+1e-8){Object.assign(a,fallback.annotation);Object.assign(p,fallback.plan);Object.assign(job.provenance,fallback.provenance??{});return refinePositionRelations(job,{layout:false});}
 }
 a.image_observation=(a.image_observation??'')+' Position revision: shared field identities require spatial evidence; unsupported relations are split into independent fields.';
 report.chart_field_map=maps;
 const provenance=job.provenance;
 if(provenance.shared_fields)provenance.previous_shared_fields=provenance.shared_fields;
 provenance.shared_fields=report.retained.map(r=>({field:maps[r.charts[0]][r.field]??r.field,charts:r.charts,evidence:r.evidence}));
 if(provenance.field_domains)for(const s of report.splits)provenance.field_domains[s.replacement]=provenance.field_domains[s.field];
 if(provenance.position_revision)(provenance.position_revision_history??=[]).push(provenance.position_revision);
 provenance.position_revision=report;
 return report;
}

// Later style/layout refreshes must not silently invalidate a saved contract.
export function validatePositionAlignments(annotation,plan) {
 const charts=new Map(annotation.charts.map(c=>[c.chart_id,c])),configs=new Map(plan.charts.map(c=>[c.id,c]));
 function visit(input){const n=nodeOf(input);
  if(n.alignment){const a=n.alignment;
   for(const child of n.children){const c=nodeOf(child);
    if(c.type==='facet'&&c.field===a.field&&a.kind==='category'&&a.axis!=='theta')continue;
    const target=charts.get(c.chart);
    if(c.type!=='chart'||!target||target.encodings['position.'+a.axis]!==a.field||axisKind(target,configs.get(c.chart),a.axis)!==a.kind)throw new Error(`Position alignment ${a.field}/${a.axis} no longer matches its chart bindings`);
   }
  }
  if(n.type==='facet')visit(n.child);else if(['nest','nested'].includes(n.type)){visit(n.parent);visit(n.child);}else if(n.type==='linked'){visit(n.child);n.links.forEach(visit);}else if(n.children)n.children.forEach(visit);
 }
 if(plan.composition)visit(plan.composition);
}
