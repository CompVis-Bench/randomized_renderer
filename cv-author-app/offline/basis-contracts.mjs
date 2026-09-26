// Explicit offline D3 contracts for the observed basis vocabulary. No relabeling.
import {validateVenn} from './venn-content.mjs';
import {validateParallelGeometry} from './parallel-variation.mjs';
export const basisChannels = {
 bar:['position.x','position.y','color'], point:['position.x','position.y','color','size','shape'],
 single_line:['position.x','position.y','position.theta','position.radius'], multi_line:['position.x','position.y','color'],
 plain_area:['position.x','position.y','position.y2'], stacked_area:['position.x','position.y','color'],
 stacked_bar:['position.x','position.y','color'], normalized_stacked_bar:['position.x','position.y','color'],
 grouped_bar:['position.x','position.y','position.x_offset','position.y_offset','color'], unit_bar:['position.x','position.y','color'],
 rect_heatmap:['position.x','position.y','color'], calendar_heatmap:['position.x','position.y','color'],
 'pie/donut/radial_bar':['position.theta','position.radius','color'], single_radar:['position.theta','position.radius'],
 multi_radar:['position.theta','position.radius'], radial_area:['position.theta','position.radius','color'],
 tree:['position.x','position.y'], dendrogram:['position.x','position.y','color','size'], radial_tree:['position.theta','position.radius'],
 sunburst:['position.theta','position.radius','color'], icicle:['position.x','position.y','color'], treemap:['size','color'], circlepacking:['size'],
 parallel_coordinates:['position.x','position.y','color'], word_cloud:['text','size','color'], euler_venn:['color'],
 single_boxplot:['position.x','position.y','color'], multi_boxplot:['position.x','position.y','color'], violin:['position.x','position.y'],
 dotplot:['position.x','position.y'], tick_plot:['position.x'], connected_scatterplot:['position.x','position.y','color'],
 contour:['position.x','position.y','color'], hexbin:['position.x','position.y','color'], horizon_chart:['position.x','position.y','color'],
 geo_point:['position.x','position.y','color'], geo_line:['position.x','position.y','color','stroke.width'], geo_area:['position.x','position.y','color'],
 link:['source','target','stroke.width','stroke.color'],
};
export function compileBasis(target, config, plan) {
 if (!config.basis) return null;
 const allowed=basisChannels[target.variation];
 if(!allowed) throw new Error(`Unsupported basis idiom ${target.variation}`);
 const source=plan.datasets.find(d=>d.id===config.datasetId);
 if(!source) throw new Error(`Missing basis table ${config.datasetId}`);
 const columns=new Map(source.columns.map(c=>[c.name,c.type]));
 if(target.variation==='euler_venn')validateVenn(config.basis.venn,source.rows,target.encodings.color,target.repetition_position);
 if(target.variation==='parallel_coordinates')validateParallelGeometry(config.basis,source.rows,target.repetition_position);
 if(target.variation==='plain_area' && config.basis.areaBounds){
  const b=config.basis.areaBounds;
  if(b.upper!==(target.encodings['position.y2']??target.encodings['position.y']) || (target.encodings['position.y2']?b.lower!==target.encodings['position.y']:b.lowerConstant!==0))throw new Error('Area bounds must match the annotated fields');
  for(const row of source.rows){const lower=b.lower?Number(row[b.lower]):b.lowerConstant,upper=Number(row[b.upper]);if(!Number.isFinite(lower)||!Number.isFinite(upper)||lower>=upper)throw new Error('plain_area lower must be strictly less than upper');}
 }
 const encodings={};
 for(const [channel,field] of Object.entries(target.encodings)) {
  if(!allowed.includes(channel)||!columns.has(field)) throw new Error(`Invalid basis binding ${channel}:${field}`);
  encodings[channel.replace('position.','')]={field,type:columns.get(field)};
 }
 for(const f of target.repetition_position) if(!columns.has(f)) throw new Error(`Missing repeated field ${f}`);
 if(target.variation==='link' && (!Array.isArray(target.link_targets)||target.link_targets.some(id=>!plan.charts.some(c=>c.id===id)))) throw new Error('Invalid link targets');
 return {id:target.chart_id,spec:{chartType:'OfflineBasisIdiom',datasetId:source.id,encodings,
  offlineVariation:target.variation,offlineOptions:structuredClone(config.basis),
  offlineAnchorFields:[...new Set(Object.entries(target.encodings).filter(([k])=>['position.x','position.y','position.theta','position.radius'].includes(k)).map(([,v])=>v))],
  offlineLinkTargets:target.link_targets??[]}};
}
