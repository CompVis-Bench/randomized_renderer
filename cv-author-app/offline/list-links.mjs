import {linkSeed,shuffled} from './link-variation.mjs';
export const listLinkRevision='rmg-list-links-v2-20260925';
const uniq=a=>[...new Set(a)];
export function listCandidates({annotation:a,plan:p}){
 const charts=a.charts.filter(c=>c.variation!=='link'),out=[];
 function visit(n){
  if(typeof n==='string')return;
  if(n.type==='facet'&&typeof n.child==='string'&&!n.coordinateSystem){
   const c=charts.find(c=>c.chart_id===n.child),fields=c?uniq([...Object.values(c.encodings),...c.repetition_position]):[];
   if(c&&c.repetition_position.length===1&&c.repetition_position[0]===n.field&&!charts.some(other=>other!==c&&[...Object.values(other.encodings),...other.repetition_position].some(f=>fields.includes(f)))){
    const cfg=p.charts.find(x=>x.id===c.chart_id),ds=p.datasets.find(x=>x.id===cfg.datasetId),values=uniq(ds.rows.map(r=>r[n.field]));
    if(cfg.basis&&values.length>=2&&values.length<=6)out.push({id:c.chart_id,field:n.field,values,node:structuredClone(n)});
   }
  }
  if(n.type==='nested'||n.type==='nest')return; // Do not detach embedded glyphs.
  if(n.child)visit(n.child);n.children?.forEach(visit);
 }
 visit(p.composition);return out;
}
// Remove link overlays or selected whole facets without changing other leaves.
export function pruneListComposition(n,ids){
 if(typeof n==='string')return ids.has(n)?null:n;
 if(n.type==='chart')return ids.has(n.chart)?null:n;
 if(n.type==='linked')return pruneListComposition(n.child,ids);
 if(n.type==='facet'){const child=pruneListComposition(n.child,ids);return child?{...n,child}:null;}
 if(n.type==='nested'||n.type==='nest')return n;
 if(n.children){const indices=n.children.map((_,i)=>i).filter(i=>pruneListComposition(n.children[i],ids));const children=indices.map(i=>pruneListComposition(n.children[i],ids));if(!children.length)return null;if(children.length===1)return children[0];return {...n,children,...n.weights?{weights:indices.map(i=>n.weights[i])}:{}};}
 return n;
}
function measure(n,p){
 if(typeof n==='string'||n.type==='chart')return [400,280];
 if(n.type==='facet'){const ds=p.datasets.find(d=>d.id===n.datasetId),count=uniq(ds.rows.map(r=>r[n.field])).length,cols=Math.min(n.columns??2,count),rows=Math.ceil(count/cols),[w,h]=measure(n.child,p);return [cols*w+(cols-1)*(n.gap??24),rows*(h+(n.labelHeight??24))+(rows-1)*(n.gap??24)];}
 if(n.type==='nested')return [600,480];
 if(n.type==='concat'){const sizes=n.children.map(c=>measure(c,p)),horizontal=n.direction==='horizontal',gap=(n.gap??28)*(sizes.length-1);return horizontal?[sizes.reduce((v,s)=>v+s[0],gap),Math.max(...sizes.map(s=>s[1]))]:[Math.max(...sizes.map(s=>s[0])),sizes.reduce((v,s)=>v+s[1],gap)];}
 return [600,400];
}
export function listBezier(p,q,orientation){
 if(orientation==='left-right'){const x=(p[0]+q[0])/2;return `M${p} C${x},${p[1]} ${x},${q[1]} ${q}`;}
 const y=(p[1]+q[1])/2;return `M${p} C${p[0]},${y} ${q[0]},${y} ${q}`;
}
export function listPorts(a,b,orientation,index){
 const delta=(index%3-1)*.055;
 let p,q;
 if(orientation==='left-right'){p=[a.x+a.width,a.y+a.height*(.5+delta)];q=[b.x,b.y+b.height*(.5-delta)];if(Math.abs(p[1]-q[1])<4){p[1]-=a.height*.08;q[1]+=b.height*.08;}}
 else{p=[a.x+a.width*(.5+delta),a.y+a.height];q=[b.x+b.width*(.5-delta),b.y];if(Math.abs(p[0]-q[0])<4){p[0]-=a.width*.08;q[0]+=b.width*.08;}}
 return [p,q];
}
export function listStroke(value,domain){return 1.4+6*(Number(value)-domain[0])/(domain[1]-domain[0]);}
export function applyListLinks(job,{enabled=false,orientation='left-right',pair}={}){
 const {annotation:a,plan:p}=job,old=a.charts.filter(c=>c.variation==='link'),oldIds=new Set(old.map(c=>c.chart_id)),oldTables=new Set(p.charts.filter(c=>oldIds.has(c.id)).map(c=>c.datasetId));
 const candidates=listCandidates(job);if(enabled&&candidates.length<2)throw new Error('Two independent repeated groups are required');
 pair??=candidates.slice(0,2);
 const original=p.composition;
 a.charts=a.charts.filter(c=>!oldIds.has(c.chart_id));p.charts=p.charts.filter(c=>!oldIds.has(c.id));p.datasets=p.datasets.filter(d=>!oldTables.has(d.id));p.composition=pruneListComposition(original,oldIds);
 const change={revision:listLinkRevision,action:enabled?'list-link':'remove-links',removed:old.map(c=>c.chart_id)};
 if(enabled){
  const [g,h]=pair,seed=linkSeed(a.sample_id),id=old[0]?.chart_id??`C${1+Math.max(...a.charts.map(c=>Number(c.chart_id.slice(1))))}`;
  let next=Math.max(...a.data_fields.map(f=>Number(f.field_id.slice(1))))+1;
  const field=role=>{const f=`F${next++}`;a.data_fields.push({field_id:f,image_role:role});return f;};
  const source=field('Source RMG item'),target=field('Target RMG item'),weight=field('Synthetic connection weight');
  const items=group=>{const cfg=p.charts.find(c=>c.id===group.id),ds=p.datasets.find(d=>d.id===cfg.datasetId);return group.values.map(v=>`${group.id}:${ds.rows.find(r=>String(r[group.field])===String(v))._row}`);};
  const aa=items(g),bb=items(h),n=Math.max(aa.length,bb.length),permutation=shuffled(bb,seed),edges=[],seen=new Set();
  const add=(x,y)=>{const key=x+'|'+y;if(!seen.has(key)){seen.add(key);edges.push([x,y]);}};
  // Shuffled matching covers both lists; extra cross matches make thickness
  // variation visible even for two-item lists, without becoming a dense web.
  for(let i=0;i<n;i++)add(aa[i%aa.length],permutation[i%bb.length]);
  for(let i=0;i<Math.min(3,aa.length);i++)add(aa[i],permutation[(i+1)%bb.length]);
  const values=shuffled(Array.from({length:edges.length},(_,i)=>12+Math.round(84*i/(edges.length-1))),seed+99);
  const rows=edges.map(([x,y],i)=>({_row:`list-edge-${i+1}`,_link_order:i,_link_source:x,_link_target:y,[source]:x,[target]:y,[weight]:values[i]}));
  const ds={id:`table_${id}`,columns:[{name:'_row',type:'nominal'},{name:'_link_order',type:'nominal'},{name:'_link_source',type:'nominal'},{name:'_link_target',type:'nominal'},{name:source,type:'nominal'},{name:target,type:'nominal'},{name:weight,type:'quantitative'}],rows,primaryKey:['_row']};
  p.datasets.push(ds);a.charts.push({chart_id:id,variation:'link',encodings:{source,target,'stroke.width':weight},repetition_position:[],link_targets:[g.id,h.id]});
  const cfg={revision:listLinkRevision,relation:'rmg-rmg',style:'bezier',layout:'paired-lists',orientation,source:'_link_source',target:'_link_target',widthField:weight,widthDomain:[12,96],materialized:true};
  p.charts.push({id,datasetId:ds.id,basis:{categoricalFields:[source,target],repetitionFields:[],link:cfg}});
  const vertical=orientation==='left-right',count=Math.max(g.values.length,h.values.length),gap=320;
  const lists=pair.map(v=>({...v.node,columns:vertical?1:v.values.length,flow:'row',wrap:false,gap:24,labelHeight:24,border:true}));
  const panel={type:'concat',direction:vertical?'horizontal':'vertical',gap,weights:[1,1],children:lists};
  const rest=pruneListComposition(p.composition,new Set([g.id,h.id]));
  const panelSize=vertical?[1120,count*264+(count-1)*24]:[count*340+(count-1)*24,928];
  let [w,ht]=panelSize;
  let child=panel;
  if(rest){const [rw,rh]=measure(rest,p);w=Math.max(w,rw);ht+=rh+64;child={type:'concat',direction:'vertical',gap:64,weights:[panelSize[1],rh],children:[panel,rest]};}
  p.composition={type:'linked',child,links:[id]};p.width=Math.ceil(w+48);p.height=Math.ceil(ht+48);
  Object.assign(change,{chart:id,orientation,targets:[g.id,h.id],fields:[g.field,h.field],item_counts:[aa.length,bb.length],edges:rows.length,width_field:weight,width_domain:[12,96]});
 }
 if(job.provenance){
  job.provenance.list_link_revision=change;job.provenance.link_revision={revision:listLinkRevision,changes:enabled?[{chart:change.chart,relation:'rmg-rmg',style:'bezier',targets:change.targets,edges:change.edges}]:[],removed:change.removed};
  if(job.provenance.shared_fields)job.provenance.shared_fields=job.provenance.shared_fields.filter(s=>!s.charts.some(id=>oldIds.has(id)));
  job.provenance.row_counts=Object.fromEntries(p.datasets.map(d=>[d.id,d.rows.length]));
 }
 return change;
}
