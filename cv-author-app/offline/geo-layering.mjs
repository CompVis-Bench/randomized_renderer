// Coalesce geographic views only when projection/geometry and facet
// filters agree. Never hoist across a nested relationship or linked subtree.
export function layerGeographicViews(job){
 const {annotation,plan}=job,charts=new Map(annotation.charts.map(c=>[c.chart_id,c])),configs=new Map(plan.charts.map(c=>[c.id,c])),changes=[];
 function unwrap(node){const facets=[];while(node?.type==='facet'){facets.push(node);node=node.child;}const id=typeof node==='string'?node:node?.type==='chart'?node.chart:null,c=charts.get(id),cfg=configs.get(id);
  if(!c||!['geo_point','geo_line','geo_area'].includes(c.variation)||!cfg?.basis?.geometry)return null;
  const signature=JSON.stringify([c.repetition_position,cfg.basis.geometry,facets.map(f=>({field:f.field,columns:f.columns,flow:f.flow,wrap:f.wrap}))]);return {id,c,cfg,facets,signature};
 }
 function walk(n){if(!n||typeof n==='string')return n;
  if(n.type==='concat'){
   n.children=n.children.map(walk);const groups=new Map();n.children.forEach((child,i)=>{const u=unwrap(child);if(u){if(!groups.has(u.signature))groups.set(u.signature,[]);groups.get(u.signature).push({...u,index:i});}});
   const replacements=new Map(),removed=new Set();for(const group of groups.values()){
    if(!group.some(g=>g.c.variation==='geo_point')||!group.some(g=>g.c.variation==='geo_line'))continue;
    const ordered=[...group].sort((a,b)=>['geo_area','geo_line','geo_point'].indexOf(a.c.variation)-['geo_area','geo_line','geo_point'].indexOf(b.c.variation));let layer={type:'layer',children:ordered.map(g=>g.id)};
    for(const f of [...group[0].facets].reverse())layer={...f,child:layer};replacements.set(group[0].index,layer);for(const g of group.slice(1))removed.add(g.index);
    changes.push({charts:ordered.map(g=>g.id),longitude:group[0].c.encodings['position.x'],latitude:group[0].c.encodings['position.y'],repetition:group[0].c.repetition_position});
   }
   const keep=n.children.map((child,i)=>({child:replacements.get(i)??child,i})).filter(x=>!removed.has(x.i));n.children=keep.map(x=>x.child);if(n.weights)n.weights=keep.map(x=>n.weights[x.i]);return n.children.length===1?n.children[0]:n;
  }
  if(n.type==='facet')n.child=walk(n.child);else if(n.type==='linked'){n.child=walk(n.child);n.links=n.links.map(walk);}else if(n.type==='nested'){n.parent=walk(n.parent);n.child=walk(n.child);}return n;
 }
 plan.composition=walk(plan.composition);if(changes.length){job.provenance??={};job.provenance.geo_layer_revision={version:1,changes};}return changes;
}
