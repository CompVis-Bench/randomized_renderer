// Seeded link relationships and mock endpoint order. No chart data is moved.
export const linkRevision='link-relations-v1-20260925';
export function linkSeed(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function shuffled(values,seed){const a=[...values],r=random(seed);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const unique=a=>[...new Set(a)];
function pairs(a,b,same,seed,candidates=false){
 const aa=shuffled(a,seed),bb=same?aa:shuffled(b,seed+71),out=[],seen=new Set();
 const add=(x,y)=>{const key=[x.key,y.key].sort().join('|');if(x.key!==y.key&&!seen.has(key)){seen.add(key);out.push([x,y]);}};
 // A shuffled spanning chain keeps every participating unit connected, without
 // reproducing the row-major layout order. Cross-group matching is shuffled too.
 for(let i=0;i<(same?aa.length-1:Math.max(aa.length,bb.length));i++)add(aa[i%aa.length],bb[(same?i+1:i)%bb.length]);
 if(candidates)for(const x of aa.slice(0,60))for(const y of bb.slice(0,60))add(x,y);
 if(candidates)return shuffled(out,seed+713);
 return out;
}
export function varyLinks(job,chooseStyle){
 const {annotation:a,plan:p}=job,links=a.charts.filter(c=>c.variation==='link');if(!links.length)return [];
 const cfgs=new Map(p.charts.map(c=>[c.id,c])),tables=new Map(p.datasets.map(d=>[d.id,d]));
 const seed=linkSeed(a.sample_id),changes=[];
 if(links.every(c=>cfgs.get(c.chart_id).basis)){
  const embedded=new Set();
  const descendants=n=>typeof n==='string'?[n]:n.chart?[n.chart]:[...(n.child?descendants(n.child):[]),...(n.parent?descendants(n.parent):[]),...(n.children??[]).flatMap(descendants)];
  const scan=n=>{if(typeof n==='string')return;if(n.type==='nested')descendants(n.child).forEach(id=>embedded.add(id));if(n.child)scan(n.child);if(n.parent)scan(n.parent);n.children?.forEach(scan);};scan(p.composition);
  const groups=a.charts.filter(c=>c.variation!=='link'&&!embedded.has(c.chart_id)).map(c=>{
   const rows=tables.get(cfgs.get(c.chart_id).datasetId).rows,map=new Map();
   for(const r of rows){const key=JSON.stringify(c.repetition_position.map(f=>r[f]));if(!map.has(key))map.set(key,{key:`${c.chart_id}:${r._row}`,row:r});}
   return {id:c.chart_id,units:[...map.values()]};
  });
  const repeated=groups.filter(g=>g.units.length>1),single=groups.filter(g=>g.units.length===1);
  const neighbors=repeated.slice(1).map((g,i)=>[repeated[i],g]).filter(([a,b])=>Math.abs(groups.indexOf(a)-groups.indexOf(b))===1);
  const available=[...(neighbors.length?['rmg-rmg']:[]),...(repeated.length?['within-rmg']:[]),...(repeated.length&&single.length?['mg-rmg']:[])];
  if(!available.length)available.push('mg-mg');
  const order=shuffled(available,seed);
  for(const [i,c] of links.entries()){
   const s=seed+101*i,relation=order[i%order.length],style=chooseStyle?.(c.chart_id)??(s%2?'bezier':'straight');
   const rr=shuffled(repeated,s).sort((a,b)=>b.units.length-a.units.length);
   const adjacent=shuffled(neighbors,s)[0];
   const mixed=shuffled(single.flatMap(x=>repeated.map(y=>[x,y])),s).sort((a,b)=>Math.abs(groups.indexOf(a[0])-groups.indexOf(a[1]))-Math.abs(groups.indexOf(b[0])-groups.indexOf(b[1])))[0];
   const singles=shuffled(single.slice(1).map((g,i)=>[single[i],g]),s)[0];
   const g=relation==='mg-rmg'?mixed[0]:relation==='mg-mg'?singles[0]:relation==='rmg-rmg'?adjacent[0]:rr[0];
   const h=relation==='rmg-rmg'?adjacent[1]:relation==='mg-rmg'?mixed[1]:relation==='mg-mg'?singles[1]:g;
   if(!g||!h)throw new Error(`${a.sample_id}: no distinct link endpoints`);
   const edges=pairs(g.units,h.units,g===h,s,true);
   const cfg=cfgs.get(c.chart_id),ds=tables.get(cfg.datasetId),old=ds.rows;
   ds.rows=edges.map(([x,y],j)=>({...old[j%old.length],_row:`link-${j+1}`,_link_order:j,_link_source:x.key,_link_target:y.key,...c.encodings.source?{[c.encodings.source]:x.key}:{},...c.encodings.target?{[c.encodings.target]:y.key}:{}}));
   for(const name of ['_link_source','_link_target','_link_order'])if(!ds.columns.some(f=>f.name===name))ds.columns.push({name,type:'nominal'});
   const before={targets:c.link_targets,repetition:c.repetition_position};
   c.link_targets=unique([g.id,h.id]);c.repetition_position=[];cfg.basis.repetitionFields=[];
   cfg.basis.link={revision:linkRevision,relation,style,seed:s,source:'_link_source',target:'_link_target'};
   changes.push({chart:c.chart_id,relation,style,edges:edges.length,before,targets:c.link_targets});
  }
  // Links are overlays, so lifting them out of their own facet wrappers leaves
  // every non-link frame unchanged and permits MG/RMG connections across panels.
  const strip=n=>{if(typeof n==='string')return n;if(n.type==='linked')return strip(n.child);const o={...n};if(n.child)o.child=strip(n.child);if(n.parent)o.parent=strip(n.parent);if(n.children)o.children=n.children.map(strip);return o;};
  p.composition={type:'linked',child:strip(p.composition),links:links.map(c=>c.chart_id)};
 }else{
  for(const [i,c] of links.entries()){
   const cfg=cfgs.get(c.chart_id),o=cfg.options,ds=tables.get(cfg.datasetId),node=cfgs.get(o.nodeChart),nr=tables.get(node.datasetId).rows;
   const key=node.options.key,s=seed+101*i,style=chooseStyle?.(c.chart_id)??(s%2?'bezier':'straight');
   const contexts=new Map();for(const r of ds.rows){const k=JSON.stringify(c.repetition_position.map(f=>r[f]));if(!contexts.has(k))contexts.set(k,[]);contexts.get(k).push(r);}
   const result=[];
   for(const old of contexts.values()){
    const rows=nr.filter(r=>c.repetition_position.every(f=>String(r[f])===String(old[0][f]))),units=unique(rows.map(r=>String(r[key]))).map(key=>({key}));
    for(const [j,[x,y]] of pairs(units,units,true,s).entries())result.push({...old[j%old.length],_row:`link-${result.length+1}`,[o.source]:x.key,[o.target]:y.key});
   }
   ds.rows=result;o.link={revision:linkRevision,relation:'within-rmg',style,seed:s};
   changes.push({chart:c.chart_id,relation:'within-rmg',style,edges:result.length,targets:c.link_targets});
  }
 }
 if(job.provenance){job.provenance.link_revision={revision:linkRevision,changes};job.provenance.row_counts=Object.fromEntries(p.datasets.map(d=>[d.id,d.rows.length]));}
 return changes;
}

// Cubic controls deliberately bend even for horizontally/vertically aligned
// endpoints. Straight links use varying boundary ports, never a unit self-loop.
export function linkPath(p,q,style,index=0){
 if(style==='straight')return `M${p} L${q}`;
 const dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);if(len<.01)throw new Error('Coincident link endpoints');
 const bend=Math.min(45,len*.18)*(index%2?1:-1),ox=-dy/len*bend,oy=dx/len*bend;
 return `M${p} C${p[0]+dx/3+ox},${p[1]+dy/3+oy} ${p[0]+dx*2/3+ox},${p[1]+dy*2/3+oy} ${q}`;
}
// List-to-list links flow in one axis. The control points stay between the
// two lists so the curve reads from left to right or from top to bottom.
export function listLinkPath(p,q,orientation='horizontal'){
 if(orientation==='vertical'){const y=(p[1]+q[1])/2;return `M${p} C${p[0]},${y} ${q[0]},${y} ${q}`;}
 const x=(p[0]+q[0])/2;return `M${p} C${x},${p[1]} ${x},${q[1]} ${q}`;
}
// Orientation belongs to the whole pair of lists, even when a shuffled match
// is farther away along the list than across the gap. Ports touch the frame.
export function listLinkEndpoints(a,b,orientation='horizontal',index=0){
 const horizontal=orientation==='horizontal',axis=horizontal?'x':'y',size=horizontal?'width':'height';
 const cross=horizontal?'y':'x',crossSize=horizontal?'height':'width';
 const sign=Math.sign(b[axis]+b[size]/2-a[axis]-a[size]/2)||1,delta=(index%3-1)*.055;
 let u=a[cross]+a[crossSize]*(.5+delta),v=b[cross]+b[crossSize]*(.5-delta);
 if(Math.abs(u-v)<4){u-=a[crossSize]*.08;v+=b[crossSize]*.08;}
 const start=a[axis]+(sign>0?a[size]:0),end=b[axis]+(sign>0?0:b[size]);
 return horizontal?[[start,u],[end,v]]:[[u,start],[v,end]];
}
export function unitLinkEndpoints(a,b,index=0){
 const ac=[a.x+a.width/2,a.y+a.height/2],bc=[b.x+b.width/2,b.y+b.height/2];
 const dx=bc[0]-ac[0],dy=bc[1]-ac[1],v=[-.23,.19,-.09,.27][index%4];
 if(Math.abs(dx)/(a.width+b.width)>=Math.abs(dy)/(a.height+b.height)){
  const sign=Math.sign(dx)||1;return [[ac[0]+sign*(a.width/2-2),ac[1]+a.height*v],[bc[0]-sign*(b.width/2-2),bc[1]-b.height*v]];
 }
 const sign=Math.sign(dy)||1;return [[ac[0]+a.width*v,ac[1]+sign*(a.height/2-2)],[bc[0]-b.width*v,bc[1]-sign*(b.height/2-2)]];
}

export function crossesBox(p,q,f){
 // Slab intersection with the chart interior, leaving boundary strokes free.
 let lo=0,hi=1;for(const [i,min,max] of [[0,f.x+5,f.x+f.width-5],[1,f.y+5,f.y+f.height-5]]){
  const d=q[i]-p[i];if(Math.abs(d)<1e-8){if(p[i]<=min||p[i]>=max)return false;}
  else {const a=(min-p[i])/d,b=(max-p[i])/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>=hi)return false;}
 }return hi>0&&lo<1;
}
