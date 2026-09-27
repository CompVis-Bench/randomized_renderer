import {linkPath,unitLinkEndpoints,crossesBox} from './link-variation.mjs';
import {listPorts,listBezier,listStroke} from './list-links.mjs';
import {drawParallel} from './parallel-renderer';
import {drawVenn} from './venn-renderer';
import {drawWordCloud} from './word-cloud-renderer';
// Reconstructed synthetic idioms for basis annotations; separate from native VisBricks.
import * as d3 from 'd3';
const esc=(x:any)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const unique=(a:any[])=>[...new Set(a)];
export function renderBasis(chart:any,datasets:any[],frame:any,filters:any,appearance:any,options:any={}) {
 const s=chart.spec,e=s.encodings,k=s.offlineVariation,cfg=s.offlineOptions;
 const source=datasets.find(d=>d.id===s.datasetId);
 let rows=source.rows.filter((r:any)=>Object.entries(filters).every(([f,v])=>String(r[f])===String(v)));
 if(k==='geo_area') rows=[...d3.group(rows,(r:any)=>r._feature).values()].map(group=>{
  const row={...group[0],_observations:group.length};
  if(e.color){
   const f=e.color.field;
   row[f]=(cfg.categoricalFields??[]).includes(f)?d3.rollups(group,g=>g.length,(r:any)=>r[f]).sort((a,b)=>b[1]-a[1])[0][0]:d3.mean(group,(r:any)=>Number(r[f]));
  }
  return row;
 });
 if(!rows.length) throw new Error(`${chart.id}: empty basis cell ${JSON.stringify(filters)}`);
 if(frame.width<48||frame.height<44) throw new Error(`${chart.id}: basis cell too small ${frame.width}x${frame.height}`);
 const showLabels=appearance.showFieldLabels!==false;
 const small=!options.sharedPosition && (options.axes===false || frame.width<160 || frame.height<140);
 const fitGeography=k.startsWith('geo_')&&options.fitGeography;
 const W=frame.width,H=frame.height,L=fitGeography?8:small?8:46,T=fitGeography?8:small?7:32,R=fitGeography?8:small?8:18,B=fitGeography?8:small?8:38,w=W-L-R,h=H-T-B;
 const root=d3.create('svg:svg'); const plot=root.append('g').attr('transform',`translate(${L},${T})`);
 if(k==='stacked_area')plot.attr('data-stacked-area-frame',JSON.stringify([w,h]));
 const palette=appearance.palette; const anchors:any[]=[];
 const val=(r:any,ch:string,fallback:any=0)=>e[ch]?r[e[ch].field]:fallback;
 const num=(r:any,ch:string,fallback=0)=>Number(val(r,ch,fallback));
 const domain=(ch:string)=>cfg.fieldDomains?.[e[ch]?.field]??unique(source.rows.map((r:any)=>val(r,ch))).sort((a:any,b:any)=>Number(a)-Number(b));
 const col=e.color?'color':e['stroke.color']?'stroke.color':null;
 const categorical=cfg.categoricalFields??[];
 const cd=col?domain(col):[0];
 const geoPalette=['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#db2777','#65a30d','#ea580c','#334155'];
 const cm=col&&!categorical.includes(e[col].field)?d3.scaleLinear<string>().domain(d3.extent(cd.map(Number)) as [number,number]).range([appearance.gradient[1],appearance.gradient.at(-1)]):d3.scaleOrdinal<any,string>().domain(cd).range(k==='geo_area'?geoPalette:palette);
 const color=(r:any)=>['tree','dendrogram','radial_tree'].includes(k)&&!e.color?palette[0]:col?cm(val(r,col)):palette[0];
 const extent=(ch:string)=>{const a=domain(ch).map(Number); let [lo,hi]=d3.extent(a) as [number,number]; if(lo===hi){lo-=1;hi+=1;} return [lo,hi] as [number,number];};
 const shared=options.sharedPosition;
 const binding=(ch:string)=>options.sharedPositions?.[ch]??shared;
 const applies=(ch:string)=>binding(ch)?.axis===ch && e[ch]?.field===binding(ch).field;
 const alignedValue=(ch:string,v:any)=>typeof source.rows[0][e[ch].field]==='string'?String(v):v;
 const sharedScale=(ch:string)=>{
  const shared=binding(ch);
  const range=ch==='x'?[0,w]:shared.kind==='category'?[0,h]:[h,0];
  return shared.kind==='category'?d3.scaleBand<any>().domain(shared.domain.map((v:any)=>alignedValue(ch,v))).range(range).paddingInner(.25).paddingOuter(.125):d3.scaleLinear().domain(shared.domain).range(range);
 };
 const aligned=(ch:string,scale:any)=>applies(ch)&&!(options.sharedPositions&&scale.bandwidth)?sharedScale(ch):scale;
 const xs=e.x?aligned('x',d3.scaleLinear().domain(extent('x')).range([8,w-8])):()=>w/2;
 const ys=e.y?aligned('y',d3.scaleLinear().domain(extent('y')).range([h-8,8])):()=>h/2;
 const zeroY=e.y?d3.scaleLinear().domain([0,Math.max(...domain('y').map(Number))*1.08||1]).range([h,0]):()=>h/2;
 const xb=d3.scaleBand<any>().domain(e.x?domain('x'):[0]).range([0,w]).padding(.24);
 const yb=d3.scaleBand<any>().domain(e.y?domain('y'):[0]).range([0,h]).padding(.15);
 const size=e.size?d3.scaleSqrt().domain(extent('size')).range([3,9]):()=>4;
 let axisX:any=null,axisY:any=null;
 if(shared && applies(shared.axis)) {
  const axis=shared.axis,sc=axis==='theta'?null:sharedScale(axis);
  const coords=shared.domain.map((v:any,i:number)=>[String(v),axis==='theta'?(options.polar?.startAngle??-90)+i/shared.domain.length*(options.polar?.angleSpan??360):(axis==='x'?frame.x+L:frame.y+T)+sc(alignedValue(axis,v))+(shared.kind==='category'?sc.bandwidth()/2:0)]);
  root.append('metadata').attr('data-position-map',JSON.stringify({chart:chart.id,field:shared.field,axis,coordinates:coords,context:filters,...axis==='theta'?{center:[frame.x+L+w/2,frame.y+T+h/2],band:[options.polar?.innerRadiusRatio,options.polar?.outerRadiusRatio]}:{}}));
 }

 const point=(r:any,x:number,y:number)=>{const fields=s.offlineAnchorFields;anchors.push({chart:chart.id,x:frame.x+L+x,y:frame.y+T+y,fields,row:r,filters:{...filters,...Object.fromEntries(fields.map((f:string)=>[f,r[f]]))}});};
 const mark=(sel:any,r:any)=>sel.attr('data-mark-role',k).attr('data-row',r._row).attr('data-bindings',JSON.stringify(Object.fromEntries(Object.entries(e).map(([ch,b]:any)=>[ch,r[b.field]]))));
 const path=(d:any,fill:string,stroke='none',sw=1)=>plot.append('path').attr('d',d).attr('fill',fill).attr('stroke',stroke).attr('stroke-width',sw);
 const circle=(r:any,x:number,y:number,radius:number)=>{mark(plot.append('circle').attr('cx',x).attr('cy',y).attr('r',radius).attr('fill',color(r)).attr('stroke','#fff').attr('stroke-width',.7),r);point(r,x,y);};
 if(k==='link') {
  const all=(options.targetUnits??[]).filter((a:any)=>s.offlineLinkTargets.includes(a.chart));
  if(!all.length)throw new Error(`${chart.id}: link has no rendered target units`);
  if(cfg.link){
   const lookup=new Map();for(const u of all)for(const row of u.rows)lookup.set(`${u.chart}:${row._row}`,u);
   const candidates=rows.map((r:any,i:number)=>{
    const a:any=lookup.get(String(r[cfg.link.source])),b:any=lookup.get(String(r[cfg.link.target]));
    // Some synthetic nested tables include tuples whose host anchor was
    // deduplicated. Only candidates resolving to two visible units can render.
    if(!a||!b||a===b){if(cfg.link.materialized)throw new Error(`${chart.id}: materialized endpoint is not visible`);return null;}
    const order=Number(r._link_order??i),[ap,aq]=cfg.link.layout==='paired-lists'?listPorts(a.frame,b.frame,cfg.link.orientation,order):unitLinkEndpoints(a.frame,b.frame,order);
    const contains=(f:any,u:any)=>u.x>=f.x&&u.y>=f.y&&u.x+u.width<=f.x+f.width+.01&&u.y+u.height<=f.y+f.height+.01;
    const obstacles=(options.targetUnits??[]).filter((u:any)=>u!==a&&u!==b&&!contains(u.frame,a.frame)&&!contains(u.frame,b.frame)&&crossesBox(ap,aq,u.frame)).length;
    return {r,a,b,ap,aq,order,obstacles,distance:Math.hypot(ap[0]-aq[0],ap[1]-aq[1])};
   }).filter(Boolean);
   let selected=cfg.link.materialized?candidates:candidates.filter(c=>!c.obstacles).slice(0,8);
   // Some layouts interleave entire repeated composites. Keep one shortest
   // connection when there is no clear corridor; record this for visual review.
   if(!selected.length)selected=[...candidates].sort((a,b)=>a.obstacles-b.obstacles||a.distance-b.distance).slice(0,1);
   selected.forEach(({r,a,b,ap,aq,order,obstacles})=>{
    const [p,q]=[ap,aq].map((v:number[])=>[v[0]-frame.x-L,v[1]-frame.y-T]);
    const d=cfg.link.layout==='paired-lists'?listBezier(p,q,cfg.link.orientation):linkPath(p,q,cfg.link.style,order);
    const sw=cfg.link.widthField?listStroke(r[cfg.link.widthField],cfg.link.widthDomain):1.6;
    mark(path(d,'none',color(r),sw).attr('opacity',cfg.link.layout==='paired-lists'?.72:.8),r)
     .attr('data-source-chart',a.chart).attr('data-target-chart',b.chart).attr('data-link-unit','edge')
     .attr('data-link-relation',cfg.link.relation).attr('data-link-style',cfg.link.style)
     .attr('data-link-chart',chart.id)
     .attr('data-list-orientation',cfg.link.orientation??null)
     .attr('data-source-frame',cfg.link.layout==='paired-lists'?JSON.stringify(a.frame):null)
     .attr('data-target-frame',cfg.link.layout==='paired-lists'?JSON.stringify(b.frame):null)
     .attr('data-link-obstructions',obstacles)
     .attr('data-link-source',r[cfg.link.source]).attr('data-link-target',r[cfg.link.target]);
   });
   if(!selected.length)throw new Error(`${chart.id}: no distinct link candidates`);
   if(cfg.link.layout==='paired-lists'){
    const left=all.filter((u:any)=>u.chart===s.offlineLinkTargets[0]),right=all.filter((u:any)=>u.chart===s.offlineLinkTargets[1]);
    const lr=cfg.link.orientation==='left-right';
    const x=lr?Math.max(...left.map((u:any)=>u.frame.x+u.frame.width))+30:Math.min(...left.map((u:any)=>u.frame.x))+10;
    const y=lr?Math.min(...all.map((u:any)=>u.frame.y))-12:Math.max(...left.map((u:any)=>u.frame.y+u.frame.height))+52;
    const legend=plot.append('g').attr('data-link-width-legend','true').attr('transform',`translate(${x-frame.x-L},${y-frame.y-T})`);
    legend.append('text').attr('x',0).attr('y',-12).attr('fill','#475569').attr('font-size',11).text('Weight');
    [12,54,96].forEach((v,i)=>{legend.append('line').attr('x1',i*78).attr('x2',i*78+32).attr('y1',0).attr('y2',0).attr('stroke',palette[0]).attr('stroke-width',listStroke(v,cfg.link.widthDomain));legend.append('text').attr('x',i*78+39).attr('y',4).attr('fill','#475569').attr('font-size',11).text(v);});
   }
  }else{
  const groups=s.offlineLinkTargets.map((id:string)=>all.filter((a:any)=>a.chart===id));
  const seen=new Set();
  rows.forEach((r:any,i:number)=>{
   const matching=all.filter((a:any)=>Object.entries(filters).every(([f,v])=>a.filters[f]===undefined||String(a.filters[f])===String(v)));
   const lookup=(ch:string)=>matching.find((a:any)=>a.rows.some((row:any)=>`${a.chart}:${row._row}`===String(val(r,ch))));
   const aa=matching.filter((a:any)=>a.chart===s.offlineLinkTargets[0]);
   const bb=matching.filter((a:any)=>a.chart===(s.offlineLinkTargets[1+i%Math.max(1,s.offlineLinkTargets.length-1)]??s.offlineLinkTargets[0]));
   const a=e.source?lookup('source'):aa[i%aa.length],b=e.target?lookup('target'):bb[(i+1)%bb.length];
   if(!a||!b)throw new Error(`${chart.id}: edge endpoint does not resolve to a unit`);
   const key=JSON.stringify([a.chart,a.frame,b.chart,b.frame]);if(seen.has(key))return;seen.add(key);
   const center=(u:any)=>[u.frame.x+u.frame.width/2,u.frame.y+u.frame.height/2];
   const ac=center(a),bc=center(b);
   const edge=(u:any,p:any,q:any)=>{const dx=q[0]-p[0],dy=q[1]-p[1],t=1/Math.max(Math.abs(dx)/(u.frame.width/2-3),Math.abs(dy)/(u.frame.height/2-3));return [p[0]+dx*t-frame.x-L,p[1]+dy*t-frame.y-T];};
   let d;
   if(a===b){const f=a.frame,x=f.x+f.width-4-frame.x-L,y=f.y+f.height/2-frame.y-T;d=`M${x},${y-14} C${x+16},${y-14} ${x+16},${y+14} ${x},${y+14}`;}
   else {const p=edge(a,ac,bc),q=edge(b,bc,ac);d=`M${p} L${q}`;}
   mark(path(d,'none',color(r),1.6).attr('opacity',.8),r).attr('data-source-chart',a.chart).attr('data-target-chart',b.chart).attr('data-link-unit','edge');
  });
  }
 } else if(['point','connected_scatterplot','dotplot','tick_plot'].includes(k)) {
  const ordered=[...rows].sort((a,b)=>num(a,'x')-num(b,'x'));
  if(k==='connected_scatterplot') path(d3.line<any>().x(r=>xs(num(r,'x'))).y(r=>ys(num(r,'y')))(ordered),'none','#9aa9b7',1.2);
  ordered.forEach((r:any,i:number)=>{
   const angle=i*2.399963229728653,radial=Math.sqrt((i+.5)/ordered.length);
   const x=e.x?xs(num(r,'x')):w*(.5+.42*radial*Math.cos(angle)),y=e.y?ys(num(r,'y')):e.x?h/2:h*(.5+.42*radial*Math.sin(angle));
   if(k==='tick_plot'){mark(plot.append('line').attr('x1',x).attr('x2',x).attr('y1',y-9).attr('y2',y+9).attr('stroke',palette[0]).attr('stroke-width',2),r);point(r,x,y);}
   else if(e.shape){const shapes=[d3.symbolCircle,d3.symbolSquare,d3.symbolTriangle,d3.symbolDiamond,d3.symbolCross,d3.symbolStar];const sh=shapes[domain('shape').indexOf(val(r,'shape'))%6];mark(path(d3.symbol().type(sh).size(Math.PI*size(num(r,'size'))**2)(),color(r),'white',.6).attr('transform',`translate(${x},${y})`),r);point(r,x,y);}
   else circle(r,x,y,size(num(r,'size')));
  });axisX=e.x?xs:null;axisY=e.y?ys:null;
 } else if(['bar','unit_bar','grouped_bar','stacked_bar','normalized_stacked_bar'].includes(k)) {
  const horizontal=cfg.barOrientation?cfg.barOrientation==='horizontal':!e.y || !!e.y_offset;
  plot.attr('data-bar-chart',chart.id).attr('data-bar-orientation',horizontal?'horizontal':'vertical').attr('data-bar-kind',k);
  const groupCh=e.x_offset?'x_offset':e.y_offset?'y_offset':'color';
  const stacked=k.includes('stacked');const grouped=k==='grouped_bar';
  const cats=horizontal?(e.y?domain('y'):[0]):(e.x?domain('x'):[0]);
  const band:any=aligned(horizontal?'y':'x',d3.scaleBand<any>().domain(cats).range(horizontal?[0,h]:[0,w]).padding(.25));
  const sums=new Map(cats.map(c=>[c,d3.sum(rows.filter((r:any)=>val(r,horizontal?'y':'x',0)===c),(r:any)=>num(r,horizontal?'x':'y',1))]));
  // Scale against the rows visible in this chart instance. Using the whole
  // source table can miss the current stack context and let later segments
  // extend above the plotted y range.
  const visibleMax=Math.max(1,...sums.values());
  const vmax=stacked?(k==='normalized_stacked_bar'?1:visibleMax):Math.max(...rows.map((r:any)=>num(r,horizontal?'x':'y',1)),1);
  const valueAxis=horizontal?'x':'y';
  const localScale=d3.scaleLinear().domain([0,k==='normalized_stacked_bar'?1:vmax*1.1||1]).range(horizontal?[0,w]:[h,0]);
  // A shared value axis describes individual values, while a stacked bar
  // needs the sum of all visible segments. Keep its value scale local.
  const sc:any=stacked&&applies(valueAxis)?localScale:aligned(valueAxis,localScale);
  const groups=e[groupCh]?domain(groupCh):unique(rows.map(r=>r._series??0)),sub=d3.scaleBand<any>().domain(groups).range([0,band.bandwidth()]).padding(.08);
  const offset=new Map();
  rows.forEach((r:any)=>{const c=val(r,horizontal?'y':'x',0),v=num(r,horizontal?'x':'y',1)/(k==='normalized_stacked_bar'?(sums.get(c) as number)||1:1),a=stacked?(offset.get(c)??0):0;offset.set(c,a+v);
   const b=(band(c)??0)+(grouped?(sub(val(r,groupCh,r._series??0))??0):0),bw=grouped?sub.bandwidth():band.bandwidth();
   const x=horizontal?sc(a):b,y=horizontal?b:sc(a+v),ww=horizontal?sc(a+v)-sc(a):bw,hh=horizontal?bw:sc(a)-sc(a+v);
   if(k==='unit_bar') {const n=Math.max(2,Math.round((horizontal?ww:hh)/7));for(let j=0;j<n;j++)mark(plot.append('rect').attr('x',horizontal?x+j*ww/n:x).attr('y',horizontal?y:y+j*hh/n).attr('width',horizontal?Math.max(1,ww/n-1):ww).attr('height',horizontal?hh:Math.max(1,hh/n-1)).attr('fill',color(r)),r);}
   else mark(plot.append('rect').attr('x',x).attr('y',y).attr('width',Math.max(.3,ww)).attr('height',Math.max(.3,hh)).attr('fill',color(r)).attr('stroke','#fff').attr('stroke-width',.5),r);
   point(r,horizontal?x+ww:x+ww/2,horizontal?y+hh/2:y);
  });axisX=horizontal?sc:band;axisY=horizontal?band:sc;
 } else if(['rect_heatmap','calendar_heatmap','hexbin'].includes(k)) {
  const hx:any=aligned('x',d3.scaleBand<any>().domain(e.x?domain('x'):[0]).range([0,w]).padding(.06)),hy:any=aligned('y',d3.scaleBand<any>().domain(e.y?domain('y'):[0]).range([h,0]).padding(.06));
  rows.forEach((r:any)=>{const x=hx(val(r,'x',0))??0,y=hy(val(r,'y',0))??0;
   if(k==='hexbin'){const rad=Math.min(hx.bandwidth(),hy.bandwidth())*.55;const pts=d3.range(6).map(j=>[x+hx.bandwidth()/2+rad*Math.cos(j*Math.PI/3),y+hy.bandwidth()/2+rad*Math.sin(j*Math.PI/3)]);mark(path(d3.line()(pts as any)+'Z',color(r),'white',.7),r);}
   else mark(plot.append('rect').attr('x',x).attr('y',y).attr('width',hx.bandwidth()).attr('height',hy.bandwidth()).attr('rx',k==='calendar_heatmap'?2:0).attr('fill',color(r)),r);
   point(r,x+hx.bandwidth()/2,y+hy.bandwidth()/2);
  });axisX=hx;axisY=hy;
 } else if(k==='contour') {
  const grouped=e.color?d3.group(rows,(r:any)=>val(r,'color')):new Map([[0,rows]]);
  for(const group of grouped.values()) {
   const contours=d3.contourDensity<any>().x(r=>xs(num(r,'x'))).y(r=>ys(num(r,'y'))).size([Math.ceil(w),Math.ceil(h)]).bandwidth(Math.max(5,Math.min(w,h)/15)).thresholds(7)(group);
   contours.forEach((c:any)=>c.coordinates.forEach((p:any)=>p.forEach((ring:any)=>ring.forEach((xy:any)=>{xy[0]=Math.max(0,Math.min(w,xy[0]));xy[1]=Math.max(0,Math.min(h,xy[1]));}))));
   contours.forEach((c:any,i:number)=>path(d3.geoPath()(c),color(group[0]),d3.color(color(group[0]))!.darker(.6).formatHex(),1.1).attr('fill-opacity',.15+i*.07).attr('stroke-opacity',.8).attr('data-contour-level',i));
   group.forEach((r:any)=>point(r,xs(num(r,'x')),ys(num(r,'y'))));
  }axisX=xs;axisY=ys;
 } else if(['single_line','multi_line','plain_area','stacked_area','horizon_chart'].includes(k) && !e.theta) {
  const grouped=k==='multi_line'||k==='stacked_area'||k==='horizon_chart'?(e.color?d3.group(rows,(r:any)=>val(r,'color')):d3.group(rows,(r:any)=>r._series)):new Map([[0,rows]]);
  const totals=new Map(); const ymax=k==='stacked_area'?Math.max(...domain('x').map(x=>d3.sum(rows.filter((r:any)=>val(r,'x')===x),(r:any)=>num(r,'y')))):Math.max(...rows.map((r:any)=>Math.max(num(r,'y'),num(r,'y2'))));
  const stream=k==='stacked_area'&&cfg.streamgraph;
  const sy:any=aligned('y',d3.scaleLinear().domain(stream?[-ymax*.55,ymax*.55]:[0,ymax*1.1||1]).range([h,0]));
  for(const group of grouped.values()) {const rr=[...group].sort((a,b)=>num(a,'x')-num(b,'x'));const stack=rr.map((r:any)=>{const x=val(r,'x'),lo=totals.get(x)??(stream?-d3.sum(rows.filter((rr:any)=>val(rr,'x')===x),(rr:any)=>num(rr,'y'))/2:0);totals.set(x,lo+num(r,'y'));return {r,lo,hi:lo+num(r,'y')};});
   if(k==='stacked_area') path(d3.area<any>().x(d=>xs(num(d.r,'x'))).y0(d=>sy(d.lo)).y1(d=>sy(d.hi))(stack),color(rr[0]),'white',.5);
   else if(k==='plain_area') {
    const bounds=cfg.areaBounds??(e.y2?{lower:e.y.field,upper:e.y2.field}:{lowerConstant:0,upper:e.y.field});
    const lower=(r:any)=>bounds.lower?Number(r[bounds.lower]):bounds.lowerConstant;
    const upper=(r:any)=>Number(r[bounds.upper]);
    if(rr.some(r=>!Number.isFinite(lower(r))||!Number.isFinite(upper(r))||lower(r)>=upper(r)))throw new Error(`${chart.id}: plain_area lower must be strictly less than upper`);
    path(d3.area<any>().x(r=>xs(num(r,'x'))).y0(r=>sy(lower(r))).y1(r=>sy(upper(r)))(rr),color(rr[0])).attr('opacity',.65)
     .attr('data-area-lower-field',bounds.lower??'constant:0').attr('data-area-upper-field',bounds.upper)
     .attr('data-area-min-data-gap',d3.min(rr,r=>upper(r)-lower(r)))
     .attr('data-area-min-screen-gap',d3.min(rr,r=>sy(lower(r))-sy(upper(r))));
   }
   else if(k==='horizon_chart') {const max=Math.max(...rows.map(r=>num(r,'y'))),band=max/3,b=Number(rr[0]._band??0);path(d3.area<any>().x(r=>xs(num(r,'x'))).y0(h).y1(r=>h-Math.min(band,Math.max(0,num(r,'y')-b*band))/band*h)(rr),color(rr[0])).attr('opacity',.9);}
   else path(d3.line<any>().x(r=>xs(num(r,'x'))).y(r=>sy(num(r,'y')))(rr),'none',color(rr[0]),3);
   rr.forEach((r:any)=>point(r,xs(num(r,'x')),sy(num(r,'y'))));
  }axisX=xs;axisY=sy;
 } else if(['pie/donut/radial_bar','single_radar','multi_radar','radial_area'].includes(k) || (k==='single_line'&&e.theta)) {
  const cx=w/2,cy=h/2,rad=Math.max(6,Math.min(w,h)/2-6),polar=options.polar,inner=polar?rad*polar.innerRadiusRatio:0,outer=polar?rad*polar.outerRadiusRatio:rad;const pg=plot.append('g').attr('transform',`translate(${cx},${cy})`);
  if(polar){const clipId=`polar-band-${chart.id}-${frame.x}-${frame.y}`.replace(/[^a-zA-Z0-9-]/g,'_');root.append('defs').append('clipPath').attr('id',clipId).append('path').attr('d',d3.arc()({innerRadius:inner,outerRadius:outer,startAngle:0,endAngle:2*Math.PI} as any));pg.attr('clip-path',`url(#${clipId})`);}

  if(k==='pie/donut/radial_bar'&&!e.radius) {
   const pie=d3.pie<any>().sort(null).value(r=>Math.max(.01,num(r,'theta',1)))(rows),arc=d3.arc<any>().innerRadius(cfg.donut?rad*.4:0).outerRadius(rad);
   pie.forEach((a:any)=>{mark(pg.append('path').attr('d',arc(a)).attr('fill',color(a.data)).attr('stroke','white').attr('stroke-width',1),a.data);const [x,y]=arc.centroid(a);point(a.data,cx+x,cy+y);});
  } else {
   const ds=applies('theta')?shared.domain.map((v:any)=>alignedValue('theta',v)):domain('theta');const radius=d3.scaleLinear().domain([0,Math.max(...domain('radius').map(Number))*1.1||1]).range([inner,outer]);
   const theta=(r:any)=>ds.indexOf(val(r,'theta'))/ds.length*(polar?.angleSpan??360)*Math.PI/180+(polar?.startAngle??-90)*Math.PI/180;
   for(const f of [.33,.66,1])pg.append('circle').attr('r',inner+(outer-inner)*f).attr('fill','none').attr('stroke','#dce4eb').attr('stroke-width',.6);
   if(k==='pie/donut/radial_bar') rows.forEach((r:any)=>{const a=theta(r)+Math.PI/2,span=2*Math.PI/ds.length*.86;mark(pg.append('path').attr('d',d3.arc()({innerRadius:polar?inner:rad*.15,outerRadius:Math.max(polar?inner+1:rad*.17,radius(num(r,'radius'))),startAngle:polar?a-span/2:a,endAngle:polar?a+span/2:a+span} as any)).attr('fill',color(r)).attr('stroke','white').attr('stroke-width',.5),r);point(r,cx+Math.cos(theta(r))*radius(num(r,'radius')),cy+Math.sin(theta(r))*radius(num(r,'radius')));});
   else {const groups=k==='multi_radar'?d3.group(rows,(r:any)=>r._series):new Map([[0,rows]]);for(const group of groups.values()){const rr=[...group].sort((a,b)=>num(a,'theta')-num(b,'theta'));const coords=rr.map((r:any)=>[Math.cos(theta(r))*radius(num(r,'radius')),Math.sin(theta(r))*radius(num(r,'radius'))]);const closed=k!=='single_line';pg.append('path').attr('d',d3.line()(coords as any)+(closed?'Z':'')).attr('fill',k==='radial_area'?color(rr[0]):closed?color(rr[0]):'none').attr('fill-opacity',.14).attr('stroke',color(rr[0])).attr('stroke-width',2);rr.forEach((r:any,i:number)=>point(r,cx+coords[i][0],cy+coords[i][1]));}}
  }
 } else if(['tree','dendrogram','radial_tree','treemap','circlepacking','sunburst','icicle'].includes(k)) {
  const by=new Map(rows.map((r:any)=>[r._node,{row:r,children:[] as any[]}]));let tree:any;
  for(const r of rows){const node=by.get(r._node)!;if(by.has(r._parent))by.get(r._parent)!.children.push(node);else tree=node;}
  if(!tree)throw new Error('Hierarchy has no root');
  const hierarchy=d3.hierarchy(tree).sum((n:any)=>n.children.length?0:Number(n.row[e.size?.field??e.theta?.field]??1));
  if(['tree','dendrogram','radial_tree'].includes(k)) {
   const radial=k==='radial_tree';const layout=(k==='dendrogram'||cfg.treeLayout==='cluster'?d3.cluster():d3.tree()).size(radial?[2*Math.PI,Math.min(w,h)*.42]:[w-20,h-20])(hierarchy);
   const pos=(n:any)=>radial?[w/2+Math.sin(n.x)*n.y,h/2-Math.cos(n.x)*n.y]:[n.x+10,n.y+10];
   layout.links().forEach((l:any)=>{const a=pos(l.source),b=pos(l.target);const edge=l.target.data.row;const edgeColor=e['stroke.color']?d3.scaleOrdinal<any,string>().domain(domain('stroke.color')).range(palette)(val(edge,'stroke.color')):'#8a9bab';const edgeWidth=e['stroke.width']?1+3*num(edge,'stroke.width')/Math.max(...domain('stroke.width').map(Number)):1.1;path(`M${a[0]},${a[1]} L${b[0]},${b[1]}`,'none',edgeColor,edgeWidth);});
   layout.descendants().forEach((n:any)=>{const [x,y]=pos(n);circle(n.data.row,x,y,size(num(n.data.row,'size')));});
  } else if(k==='treemap') {
   d3.treemap().tile(({binary:d3.treemapBinary,slice:d3.treemapSlice,dice:d3.treemapDice} as any)[cfg.treemapTile]??d3.treemapSquarify).size([w,h]).paddingInner(2)(hierarchy);hierarchy.leaves().forEach((n:any)=>{mark(plot.append('rect').attr('x',n.x0).attr('y',n.y0).attr('width',n.x1-n.x0).attr('height',n.y1-n.y0).attr('fill',color(n.data.row)),n.data.row);point(n.data.row,(n.x0+n.x1)/2,(n.y0+n.y1)/2);});
  } else if(k==='circlepacking') {
   d3.pack().size([w,h]).padding(3)(hierarchy);hierarchy.descendants().forEach((n:any)=>{mark(plot.append('circle').attr('cx',n.x).attr('cy',n.y).attr('r',n.r).attr('fill',n.children?'#edf2f7':palette[0]).attr('stroke','white'),n.data.row);point(n.data.row,n.x,n.y);});
  } else if(k==='sunburst') {
   const rad=Math.min(w,h)*.47;d3.partition().size([2*Math.PI,rad])(hierarchy);hierarchy.descendants().filter(n=>n.depth).forEach((n:any)=>{mark(plot.append('path').attr('transform',`translate(${w/2},${h/2})`).attr('d',d3.arc()({startAngle:n.x0,endAngle:n.x1,innerRadius:n.y0,outerRadius:n.y1} as any)).attr('fill',color(n.data.row)).attr('stroke','white').attr('stroke-width',.8),n.data.row);point(n.data.row,w/2+Math.sin((n.x0+n.x1)/2)*(n.y0+n.y1)/2,h/2-Math.cos((n.x0+n.x1)/2)*(n.y0+n.y1)/2);});
  } else {d3.partition().size([w,h])(hierarchy);hierarchy.descendants().forEach((n:any)=>{mark(plot.append('rect').attr('x',n.x0).attr('y',n.y0).attr('width',Math.max(1,n.x1-n.x0-1)).attr('height',Math.max(1,n.y1-n.y0-1)).attr('fill',color(n.data.row)),n.data.row);point(n.data.row,(n.x0+n.x1)/2,(n.y0+n.y1)/2);});}
 } else if(k==='parallel_coordinates') {
  drawParallel(plot,rows,{chartId:chart.id,dimension:cfg.parallelDimension??e.x.field,value:cfg.parallelValue??e.y.field,orientation:cfg.axisOrientation,width:w,height:h,color,labels:!small,domain:extent(cfg.axisOrientation==='horizontal'?'x':'y'),point,axisValues:cfg.parallelAxisValues,minSpacingRatio:cfg.parallelMinSpacingRatio,lineStyle:cfg.parallelLineStyle,context:filters});
 } else if(['single_boxplot','multi_boxplot','violin'].includes(k)) {
  const horizontal=!e.y;const groups=k==='single_boxplot'?new Map([[0,rows]]):d3.group(rows,(r:any)=>val(r,'x'));
  const band=d3.scaleBand<any>().domain([...groups.keys()]).range(horizontal?[0,h]:[0,w]).padding(.35),sc=d3.scaleLinear().domain(extent(horizontal?'x':'y')).nice().range(horizontal?[0,w]:[h,0]);
  for(const [key,group] of groups){const vals=group.map((r:any)=>num(r,horizontal?'x':'y')).sort(d3.ascending),q1=d3.quantile(vals,.25)!,q2=d3.quantile(vals,.5)!,q3=d3.quantile(vals,.75)!,lo=vals[0],hi=vals.at(-1)!;const center=(band(key)??0)+band.bandwidth()/2,bw=band.bandwidth();
   if(k==='violin') {const thresholds=d3.range(lo,hi+(hi-lo)/20,(hi-lo)/20||1);const bwK=(hi-lo)/5||1;const dens=thresholds.map(v=>[v,d3.mean(vals,x=>Math.exp(-.5*((v-x)/bwK)**2))!]);const ds=d3.scaleLinear().domain([0,d3.max(dens,d=>d[1])!]).range([0,bw/2]);path(d3.area<any>().x0(d=>center-ds(d[1])).x1(d=>center+ds(d[1])).y(d=>sc(d[0])).curve(d3.curveBasis)(dens),color(group[0])).attr('opacity',.7);}
   else {const g=plot.append('g');if(horizontal){g.append('line').attr('x1',sc(lo)).attr('x2',sc(hi)).attr('y1',center).attr('y2',center).attr('stroke',color(group[0]));g.append('rect').attr('x',sc(q1)).attr('y',center-bw/2).attr('width',Math.max(1,sc(q3)-sc(q1))).attr('height',bw).attr('fill',color(group[0])).attr('opacity',.65);g.append('line').attr('x1',sc(q2)).attr('x2',sc(q2)).attr('y1',center-bw/2).attr('y2',center+bw/2).attr('stroke','#23374b');}else{g.append('line').attr('x1',center).attr('x2',center).attr('y1',sc(lo)).attr('y2',sc(hi)).attr('stroke',color(group[0]));g.append('rect').attr('x',center-bw/2).attr('y',sc(q3)).attr('width',bw).attr('height',Math.max(1,sc(q1)-sc(q3))).attr('fill',color(group[0])).attr('opacity',.65);g.append('line').attr('x1',center-bw/2).attr('x2',center+bw/2).attr('y1',sc(q2)).attr('y2',sc(q2)).attr('stroke','#23374b');}mark(g,group[0]);}
   point(group[0],horizontal?sc(q2):center,horizontal?center:sc(q2));
  }axisX=horizontal?sc:k==='single_boxplot'?null:band;axisY=horizontal?null:sc;
 } else if(k==='word_cloud') {
  drawWordCloud(plot,rows,e,cfg,w,h,color,mark,point);
 } else if(k==='euler_venn') {
  drawVenn(plot,rows,e.color.field,cfg,filters,w,h,color,mark,point);
 } else if(k.startsWith('geo_')) {
  const geometry=structuredClone(cfg.geometry);if(!geometry)throw new Error('Missing offline geometry');
  for(const f of geometry.features){if(d3.geoArea(f)>2*Math.PI){const pp=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;pp.forEach((p:any)=>p.forEach((ring:any)=>ring.reverse()));}}
  const projection=cfg.geoProjection==='albersUsa'?d3.geoAlbersUsa():d3.geoMercator();
  const proj=projection.fitExtent([[4,4],[w-4,h-4]],geometry),gp=d3.geoPath(proj);
  plot.attr('data-geo-projection',cfg.geoProjection??'mercator').attr('data-geo-frame',JSON.stringify([frame.x+L,frame.y+T,w,h]));
  if(options.geoBackground!==false)plot.selectAll('path.land').data(geometry.features).join('path').attr('class','land').attr('d',gp as any).attr('fill','#edf1f3').attr('stroke','#d3dce1').attr('stroke-width',.5);
  if(k==='geo_area') rows.forEach((r:any)=>{const f=geometry.features[Number(r._feature)%geometry.features.length];mark(path(gp(f),color(r),'white',1.15),r);const p=gp.centroid(f);point(r,p[0],p[1]);});
  else if(k==='geo_point') rows.forEach((r:any)=>{const p=proj([num(r,'x'),num(r,'y')])!;circle(r,p[0],p[1],3);});
  else {for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i],p=proj([num(a,'x'),num(a,'y')])!,q=proj([num(b,'x'),num(b,'y')])!;mark(path(`M${p} L${q}`,'none',color(b),e['stroke.width']?1+num(b,'stroke.width')/Math.max(...domain('stroke.width').map(Number))*3:1.8),b);point(b,q[0],q[1]);}}
 } else throw new Error(`Unimplemented basis idiom: ${k}`);
 if(!small && k!=='link') {
  if(axisX){const a:any=d3.axisBottom(axisX);if(axisX.ticks)a.ticks(4);else if(axisX.domain().length>8)a.tickValues(axisX.domain().filter((_:any,i:number)=>i%Math.ceil(axisX.domain().length/8)===0));plot.append('g').attr('transform',`translate(0,${h})`).call(a).attr('font-size',9).attr('color','#6b7b8b');root.append('text').attr('x',L+w/2).attr('y',H-5).attr('text-anchor','middle').attr('font-size',10).text(showLabels?(e.x?.field??''):'');}
  if(axisY){const a:any=d3.axisLeft(axisY);if(axisY.ticks)a.ticks(4);else if(axisY.domain().length>8)a.tickValues(axisY.domain().filter((_:any,i:number)=>i%Math.ceil(axisY.domain().length/8)===0));plot.append('g').call(a).attr('font-size',9).attr('color','#6b7b8b');root.append('text').attr('x',5).attr('y',T-6).attr('font-size',10).text(showLabels?(e.y?.field??''):'');}
  if(showLabels)root.append('text').attr('x',L).attr('y',15).attr('font-size',11).attr('font-weight',600).attr('fill','#405266').text(`${chart.id} · ${k}`);
  if(col&&showLabels){const text=`${e[col].field} → ${col}`;root.append('text').attr('x',W-R).attr('y',15).attr('text-anchor','end').attr('font-size',9).attr('fill','#64748b').text(text);}
 }
 if(!anchors.length && k!=='link') rows.forEach((r:any)=>point(r,w/2,h/2));
 const content=`<g data-offline-chart="${esc(chart.id)}" data-renderer="offline-basis-d3-v1" data-variation="${esc(k)}" transform="translate(${frame.x},${frame.y})" font-family="Arial,sans-serif">${root.node()!.innerHTML}</g>`;
 return {content,axisContent:'',anchors,units:k==='link'?[]:[{chart:chart.id,frame,filters,rows}],anchorIssues:[]};
}
