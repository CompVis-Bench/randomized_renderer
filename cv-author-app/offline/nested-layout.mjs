// Replaced scatter marks are construction anchors, not visible MGs.
export function removeReplacedScatterPoints(job){
 const {annotation,plan}=job,removed=[];
 const byId=new Map(annotation.charts.map(c=>[c.chart_id,c]));
 const targets=new Set();
 function visit(n){
  if(typeof n==='string')return;
  if(n.type==='nest'){
   if(n.placement==='center')targets.add(n.anchor);
   visit(n.parent);visit(n.child);
  }else if(n.type==='facet')visit(n.child);else n.children.forEach(visit);
 }
 visit(plan.composition);
 for(const cfg of plan.charts){
  const chart=byId.get(cfg.id);
  if(!targets.has(cfg.id)||cfg.options.host!=='scatter'||chart?.variation!=='point')continue;
  cfg.layoutOnly=true;
  cfg.layoutAnnotation=structuredClone(chart);
  delete cfg.layoutAnnotation.encodings.color;
  removed.push(structuredClone(chart));
 }
 if(!removed.length)return [];
 const ids=new Set(removed.map(c=>c.chart_id));
 annotation.charts=annotation.charts.filter(c=>!ids.has(c.chart_id));
 const fields=new Set(annotation.charts.flatMap(c=>[...Object.values(c.encodings),...c.repetition_position]));
 annotation.data_fields=annotation.data_fields.filter(f=>fields.has(f.field_id));
 job.provenance??={};
 job.provenance.scatter_anchor_revision={revision:'invisible-scatter-anchors-v1',removed_charts:removed,reason:'Scatter points replaced by nested children; retain only internal placement coordinates.'};
 const position=job.provenance.position_revision;
 if(position){
  (job.provenance.position_revision_history??=[]).push(structuredClone(position));
  position.retained=position.retained.map(r=>({...r,charts:r.charts.filter(id=>!ids.has(id))})).filter(r=>r.charts.length>1);
  job.provenance.shared_fields=position.retained.map(r=>({field:position.chart_field_map[r.charts[0]][r.field]??r.field,charts:r.charts,evidence:r.evidence}));
 }
 return removed.map(c=>c.chart_id);
}
