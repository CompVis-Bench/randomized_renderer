import {linkPath} from './link-variation.mjs';
import {drawParallel} from './parallel-renderer';
import {facetIndex} from './quality-rules.mjs';
import * as d3 from 'd3';
import {nestedLeaves} from './nested-contracts.mjs';
const esc=(x:any)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const unique=(a:any[])=>[...new Set(a)];
export function renderNested(scene:any){
 const root=d3.create('svg:svg').attr('xmlns','http://www.w3.org/2000/svg').attr('width',scene.width).attr('height',scene.height).attr('viewBox',`0 0 ${scene.width} ${scene.height}`);
 root.append('rect').attr('width',scene.width).attr('height',scene.height).attr('fill','#fff');
 const charts=new Map<string,any>(scene.charts.map((c:any)=>[c.id,c]));
 const tables=new Map<string,any>(scene.datasets.map((d:any)=>[d.id,d]));
 const palette=scene.appearance.palette;
 const rowsFor=(id:string,filters:any)=>tables.get(charts.get(id).spec.datasetId).rows.filter((r:any)=>Object.entries(filters).every(([k,v])=>String(r[k])===String(v)));
 const extent=(values:any[],zero=false)=>{let [lo,hi]=d3.extent(values.map(Number)) as [number,number];if(!Number.isFinite(lo)||!Number.isFinite(hi))throw new Error('Invalid scale domain');if(zero)lo=Math.min(0,lo);if(lo===hi){lo-=1;hi+=1;}return [lo,hi] as [number,number];};
 const projection=(region:any,w:number,h:number)=> (region.projection==='albersUsa'?d3.geoAlbersUsa():d3.geoMercator()).fitExtent([[4,4],[w-4,h-4]],region.geometry);
 function leaf(id:string,frame:any,filters:any,parent:any,opts:any={}){
  const {spec:s,layoutOnly}=charts.get(id),e=s.encodings,k=s.offlineVariation,cfg=s.offlineOptions,rows=rowsFor(id,filters);
  if(!rows.length)throw new Error(`${id}: empty nested context`);
  const mini=opts.mini??false,pad=opts.plotPadding??(mini?{l:5,r:5,t:5,b:5}:{l:42,r:22,t:20,b:34});
  const w=frame.width-pad.l-pad.r,h=frame.height-pad.t-pad.b;
  if(w<12||h<12)throw new Error(`${id}: cell too small ${frame.width}×${frame.height}`);
  const container=parent.append('g').attr(layoutOnly?'data-offline-anchor':'data-offline-chart',id).attr('data-offline-frame',`${frame.x},${frame.y},${frame.width},${frame.height}`).attr('data-context',JSON.stringify(filters));
  const g=container.append('g').attr('transform',`translate(${frame.x+pad.l},${frame.y+pad.t})`);
  const val=(r:any,ch:string)=>e[ch]?r[e[ch].field]:undefined;
  const numeric=(ch:string)=>e[ch]&&e[ch].type==='quantitative';
  let domainX=opts.domainX??(numeric('x')?extent(rows.map((r:any)=>val(r,'x')),cfg.horizontal):unique(rows.map((r:any)=>val(r,'x'))));
  const scaleRows=k==='bar'||k==='stacked_bar'?tables.get(s.datasetId).rows:rows;
  const stackMax=['stacked_bar','stacked_area'].includes(k)?d3.max(d3.rollups(scaleRows,(rr:any[])=>d3.sum(rr,r=>+val(r,'y')),(r:any)=>JSON.stringify([...(s.offlineRepetition??[]).map((f:string)=>r[f]),val(r,'x')])).map(p=>p[1]))!:0;
  let domainY=opts.domainY??(cfg.streamgraph?[-stackMax/2,stackMax/2]:stackMax?[0,stackMax]:cfg.domainY??(numeric('y')?extent(scaleRows.flatMap((r:any)=>[val(r,'y'),...(e.y2?[val(r,'y2')]:[])]),!cfg.host):cfg.rowOrder??unique(rows.map((r:any)=>val(r,'y')))));
  const inset=opts.plotInset??opts.anchorInsets?.[id];
  const plotFrame={x:frame.x+pad.l,y:frame.y+pad.t,width:w,height:h};
  if(inset){
   if(['bar','stacked_bar','grouped_bar'].includes(k)){
    const horizontal=cfg.barOrientation==='horizontal',value=horizontal?'x':'y',category=horizontal?'y':'x',all=tables.get(s.datasetId).rows;
    const totals=d3.rollups(all,(rs:any[])=>d3.sum(rs,r=>+val(r,value)),r=>JSON.stringify([...(s.offlineRepetition??[]).map((f:string)=>r[f]),val(r,category)]));
    const max=k==='stacked_bar'?d3.max(totals,t=>t[1])!:d3.max(all,r=>+val(r,value))!;
    if(horizontal){domainX=opts.domainX??[0,max*1.08||1];domainY=opts.domainY??extent(rows.map(r=>val(r,'y')));}
    else domainY=opts.domainY??[0,max*1.08||1];
   }
   const expand=(domain:number[],length:number,margin:number)=>{
    if(length<=margin*2)throw new Error(`Nested glyph does not fit plot ${id}: ${length} <= ${margin*2}`);
    const extra=(domain[1]-domain[0])*margin/(length-2*margin);return [domain[0]-extra,domain[1]+extra];
   };
   if(numeric('x'))domainX=expand(domainX,w,inset.width/2+6+w*(inset.xFraction??0));
   if(numeric('y'))domainY=expand(domainY,h,inset.height/2+6+h*(inset.yFraction??0));
   container.attr('data-nested-plot',`${plotFrame.x},${plotFrame.y},${w},${h}`);
  }
  if(!cfg.host&&!cfg.region&&numeric('y'))container.attr('data-y-domain',JSON.stringify(domainY));
  const xs:any=numeric('x')?d3.scaleLinear().domain(domainX).range([0,w]):d3.scaleBand().domain(domainX).range([0,w]).padding(.08);
  const ys:any=numeric('y')?d3.scaleLinear().domain(domainY).range([h,0]):d3.scaleBand().domain(domainY).range([0,h]).padding(.06);
  const xp=(r:any)=>numeric('x')?xs(val(r,'x')):xs(val(r,'x'))+xs.bandwidth()/2;
  const yp=(r:any)=>numeric('y')?ys(val(r,'y')):ys(val(r,'y'))+ys.bandwidth()/2;
  const colors=unique(tables.get(s.datasetId).rows.map((r:any)=>val(r,'color'))).sort();
  const cm:any=e.color?.type==='quantitative'?d3.scaleSequential(d3.interpolateBlues).domain(extent(colors)):d3.scaleOrdinal().domain(colors).range(palette);
  const color=(r:any)=>e.color?cm(val(r,'color')):palette[Number(id.slice(1))%palette.length];
  const anchors:any[]=[];
  function anchor(r:any,x:number,y:number,cell?:any){const fields=cfg.anchorFields??[];if(!fields.length)return;anchors.push({chart:id,x:frame.x+pad.l+x,y:frame.y+pad.t+y,row:r,fields,...inset?{plotFrame}:{},filters:{...filters,...Object.fromEntries(fields.map((f:string)=>[f,r[f]]))},...(cell?{cell:{x:frame.x+pad.l+cell.x,y:frame.y+pad.t+cell.y,width:cell.width,height:cell.height}}:{})});}
  const path=(d:any,fill='none',stroke='none',sw=1)=>g.append('path').attr('d',d).attr('fill',fill).attr('stroke',stroke).attr('stroke-width',sw).attr('stroke-linejoin','round');
  const point=(r:any,x:number,y:number)=>{if(!layoutOnly)g.append('circle').attr('cx',x).attr('cy',y).attr('r',cfg.host?4:mini?1.8:3).attr('fill',color(r)).attr('stroke','#fff').attr('stroke-width',.6);anchor(r,x,y);};
  let drawAxes=!mini&&!opts.noAxes;
  if(cfg.host==='graph'||cfg.host==='graph-links'){
   drawAxes=false;const nodeChart=cfg.host==='graph'?id:cfg.nodeChart,ns=charts.get(nodeChart).spec,nrows=rowsFor(nodeChart,filters);
   const positions=new Map(nrows.map((r:any,i:number)=>[String(r[ns.offlineOptions.key]),[w/2+w*.43*Math.cos(i/nrows.length*Math.PI*2-Math.PI/2),h/2+h*.43*Math.sin(i/nrows.length*Math.PI*2-Math.PI/2)]]));
   if(cfg.host==='graph-links')for(const [i,r] of rows.entries()){const a:any=positions.get(String(r[cfg.source])),b:any=positions.get(String(r[cfg.target]));if(!a||!b)throw new Error('Unresolved graph endpoint');path(cfg.link?linkPath(a,b,cfg.link.style,i):`M${a}Q${w/2},${h/2} ${b}`,'none','#8c9cae',1.4).attr('opacity',.65).attr('data-link-style',cfg.link?.style??null).attr('data-link-relation',cfg.link?.relation??null).attr('data-link-source',r[cfg.source]).attr('data-link-target',r[cfg.target]);}
   else for(const r of rows){const p:any=positions.get(String(r[cfg.key]));point(r,p[0],p[1]);}
  }else if(k==='geo_area'||k==='geo_point'||k==='geo_line'||cfg.host==='geo-links'){
   drawAxes=false;const proj=projection(cfg.region,w,h),geo=d3.geoPath(proj);
   if(k==='geo_area'){
    const data=new Map(rows.map((r:any)=>[String(r._feature),r]));for(const feature of cfg.region.geometry.features){const r=data.get(String(feature.id));if(!r)throw new Error('Missing geographical record');path(geo(feature),color(r),'#ffffff',mini?.4:.6);}
   }else if(cfg.host==='geo-links'){
    const ns=charts.get(cfg.nodeChart).spec,nrows=rowsFor(cfg.nodeChart,filters),points=new Map(nrows.map((r:any)=>[String(r[ns.offlineOptions.key]),proj([Number(r[ns.encodings.x.field]),Number(r[ns.encodings.y.field])])]));
    for(const [i,r] of rows.entries()){const a:any=points.get(String(r[cfg.source])),b:any=points.get(String(r[cfg.target]));if(!a||!b)throw new Error('Invalid projected graph node');path(cfg.link?linkPath(a,b,cfg.link.style,i):`M${a}L${b}`,'none',palette[1],2).attr('opacity',.75).attr('data-link-style',cfg.link?.style??null).attr('data-link-relation',cfg.link?.relation??null).attr('data-link-source',r[cfg.source]).attr('data-link-target',r[cfg.target]);}
   }else if(k==='geo_line'){
    const pts=rows.map((r:any)=>proj([Number(val(r,'x')),Number(val(r,'y'))])).filter(Boolean);path(d3.line()(pts),'none',palette[1],mini?1:2).attr('opacity',.85);
   }else for(const r of rows){const p=proj([Number(val(r,'x')),Number(val(r,'y'))]);if(!p)throw new Error('Geographic point outside projection');point(r,p[0],p[1]);}
  }else if(k==='parallel_coordinates'){
   drawAxes=false;drawParallel(g,rows,{chartId:id,dimension:cfg.parallelDimension??e.x.field,value:cfg.parallelValue??e.y.field,orientation:cfg.axisOrientation,width:w,height:h,color,domain:[0,100],opacity:.3,anchor});
  }else if(k==='tree'){
   drawAxes=false;const tree=d3.stratify<any>().id(r=>r._node).parentId(r=>r._parent||null)(rows);d3.cluster<any>().size([h,w])(tree);
   const leafNodes=tree.leaves(),order=opts.rowOrder??leafNodes.map(n=>n.data[cfg.key]),step=h/order.length;
   for(const n of leafNodes)n.x=(order.indexOf(n.data[cfg.key])+.5)*step;
   tree.eachAfter(n=>{if(n.children)n.x=d3.mean(n.children,c=>c.x)!;n.y=n.depth/(tree.height||1)*w;});
   for(const l of tree.links())path(`M${l.source.y},${l.source.x}H${(l.source.y+l.target.y)/2}V${l.target.x}H${l.target.y}`,'none','#8295a6',1.5);
   tree.each(n=>{const mark=g.append('circle').attr('cx',n.y).attr('cy',n.x).attr('r',3).attr('fill',palette[0]);if(opts.rowOrder&&!n.children)mark.attr('data-aligned-key',n.data[cfg.key]).attr('data-aligned-y',frame.y+pad.t+n.x);anchor(n.data,n.y,n.x);});
  }else if(k==='treemap'){
   drawAxes=false;const hierarchy=d3.hierarchy({children:rows}).sum((r:any)=>Number(r[e.size.field])||0);d3.treemap<any>().size([w,h]).padding(5)(hierarchy);
   for(const n of hierarchy.leaves()){const width=n.x1-n.x0,height=n.y1-n.y0;g.append('rect').attr('x',n.x0).attr('y',n.y0).attr('width',width).attr('height',height).attr('fill',color(n.data)).attr('fill-opacity',.2).attr('stroke',color(n.data));anchor(n.data,(n.x0+n.x1)/2,(n.y0+n.y1)/2,{x:n.x0,y:n.y0,width,height});}
  }else if(k==='rect_heatmap'){
   const xvals=unique(rows.map((r:any)=>val(r,'x'))),yvals=opts.rowOrder??cfg.rowOrder??unique(rows.map((r:any)=>val(r,'y'))),x=d3.scaleBand().domain(xvals).range([0,w]).padding(.015),y=d3.scaleBand().domain(yvals).range([0,h]).padding(.015);
   if(opts.rowOrder)y.paddingInner(.015).paddingOuter(.0075);
   for(const r of rows){const x0=x(val(r,'x'))!,y0=y(val(r,'y'))!;const mark=g.append('rect').attr('x',x0).attr('y',y0).attr('width',x.bandwidth()).attr('height',y.bandwidth()).attr('fill',color(r)).attr('fill-opacity',cfg.host?.26:1);if(opts.rowOrder)mark.attr('data-aligned-key',val(r,'y')).attr('data-aligned-y',frame.y+pad.t+y0+y.bandwidth()/2);anchor(r,x0+x.bandwidth()/2,y0+y.bandwidth()/2,{x:x0,y:y0,width:x.bandwidth(),height:y.bandwidth()});}
   drawAxes=false;
  }else if(k==='pie/donut/radial_bar'){
   drawAxes=false;const radius=Math.min(w,h)/2,pie=d3.pie<any>().sort(null).value(r=>Number(val(r,'theta')))(rows),arc=d3.arc<any>().innerRadius(cfg.donut?radius*.52:0).outerRadius(radius);
   // An opaque circular backing keeps the host line out of donut holes.
   g.append('circle').attr('cx',w/2).attr('cy',h/2).attr('r',radius).attr('fill','#fff').attr('stroke','none');
   for(const p of pie)g.append('path').attr('data-mark-role','pie-sector').attr('transform',`translate(${w/2},${h/2})`).attr('d',arc(p)).attr('fill',color(p.data)).attr('stroke','none');
  }else if(k==='single_boxplot'&&cfg.axisOrientation==='horizontal'){
   const sc=d3.scaleLinear().domain([0,100]).range([0,w]),sorted=rows.map((r:any)=>Number(val(r,'x'))).sort(d3.ascending);
   const [lo,q1,med,q3,hi]=[.05,.25,.5,.75,.95].map(q=>d3.quantileSorted(sorted,q)!);
   g.append('line').attr('x1',sc(lo)).attr('x2',sc(hi)).attr('y1',h/2).attr('y2',h/2).attr('stroke',palette[1]).attr('stroke-width',2);
   g.append('rect').attr('x',sc(q1)).attr('width',sc(q3)-sc(q1)).attr('y',h*.2).attr('height',h*.6).attr('fill',palette[1]).attr('fill-opacity',.25).attr('stroke',palette[1]);
   for(const [value,half] of [[lo,.2],[hi,.2],[med,.3]])g.append('line').attr('x1',sc(value)).attr('x2',sc(value)).attr('y1',h/2-h*half).attr('y2',h/2+h*half).attr('stroke',palette[1]).attr('stroke-width',2);drawAxes=false;
  }else if(k==='single_boxplot'){
   const sorted=rows.map((r:any)=>Number(val(r,'y'))).sort(d3.ascending),q1=d3.quantileSorted(sorted,.25)!,med=d3.quantileSorted(sorted,.5)!,q3=d3.quantileSorted(sorted,.75)!,lo=d3.quantileSorted(sorted,.05)!,hi=d3.quantileSorted(sorted,.95)!;
   const cx=w/2;g.append('line').attr('x1',cx).attr('x2',cx).attr('y1',ys(lo)).attr('y2',ys(hi)).attr('stroke',palette[1]).attr('stroke-width',2);
   g.append('rect').attr('x',w*.2).attr('width',w*.6).attr('y',ys(q3)).attr('height',ys(q1)-ys(q3)).attr('fill',palette[1]).attr('fill-opacity',.25).attr('stroke',palette[1]).attr('stroke-width',1.5);
   for(const [value,half] of [[lo,.2],[hi,.2],[med,.3]])g.append('line').attr('x1',cx-w*half).attr('x2',cx+w*half).attr('y1',ys(value)).attr('y2',ys(value)).attr('stroke',palette[1]).attr('stroke-width',2);drawAxes=false;
  }else if(cfg.distribution&&cfg.axisOrientation==='horizontal'){
   const ordered=[...rows].sort((a,b)=>+val(a,'x')-+val(b,'x'));
   const sc=d3.scaleLinear().domain([0,100]).range([0,w]),density=d3.scaleLinear().domain([0,d3.max(rows,r=>+val(r,'y'))!]).range([0,h*.47]);
   if(k==='bar')for(const r of ordered)g.append('rect').attr('x',sc(val(r,'x'))-w/rows.length*.4).attr('y',h/2-density(val(r,'y'))).attr('width',w/rows.length*.8).attr('height',density(val(r,'y'))).attr('fill',palette[1]).attr('opacity',.7);
   else if(k==='plain_area')path(d3.area<any>().x(r=>sc(val(r,'x'))).y0(h/2).y1(r=>h/2-density(val(r,'y')))(ordered),palette[1],palette[1],1).attr('opacity',.55);
   else path(d3.line<any>().x(r=>sc(val(r,'x'))).y(r=>h/2-density(val(r,'y')))(ordered),'none',palette[1],1.4).attr('opacity',.65);
   drawAxes=false;
  }else if(cfg.distribution){
   const ordered=[...rows].sort((a,b)=>+val(a,'y')-+val(b,'y'));
   if(k==='bar')for(const r of ordered)g.append('rect').attr('x',w/2).attr('y',ys(val(r,'y'))-h/rows.length*.4).attr('width',Math.max(0,xs(val(r,'x'))*.47)).attr('height',h/rows.length*.8).attr('fill',palette[1]).attr('opacity',.7);
   else if(k==='plain_area')path(d3.area<any>().y(r=>ys(val(r,'y'))).x0(w/2).x1(r=>w/2+xs(val(r,'x'))*.47)(ordered),palette[1],palette[1],1).attr('opacity',.55);
   else path(d3.line<any>().x(r=>w/2+xs(val(r,'x'))*.47).y(r=>ys(val(r,'y')))(ordered),'none',palette[1],1.4).attr('opacity',.65);
   drawAxes=false;
  }else if(['bar','stacked_bar','grouped_bar'].includes(k)){
   const horizontal=(cfg.barOrientation??(cfg.horizontal?'horizontal':'vertical'))==='horizontal';
   const catCh=horizontal?'y':'x',valueCh=horizontal?'x':'y',groupCh=horizontal?'y_offset':'x_offset';
   const catField=e[catCh].field,valueField=e[valueCh].field,seriesField=e[groupCh]?.field??e.color?.field??'_series';
   const categories=opts.rowOrder??cfg.rowOrder??unique(rows.map(r=>r[catField])).sort((a:any,b:any)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
   const grouped=k==='grouped_bar',stacked=k==='stacked_bar',series=unique(rows.map(r=>r[seriesField]??0));
   const length=horizontal?h:w,band=d3.scaleBand<any>().domain(categories).range([0,length]).padding(.22);
   if(opts.rowOrder)band.paddingInner(.2).paddingOuter(.1);
   const numericCategory=!opts.aligned&&cfg.categoryScale!=='band'&&e[catCh].type==='quantitative';
   const position=horizontal?ys:xs;
   const steps=numericCategory?d3.pairs(categories.map(v=>position(v)).sort(d3.ascending)).map(([a,b]:any)=>b-a):[];
   const bw=numericCategory?Math.min(length/categories.length*.5,...steps.map(v=>v*.55)):band.bandwidth();
   const sub=d3.scaleBand<any>().domain(series).range([0,bw]).padding(.08);
   const all=tables.get(s.datasetId).rows;
   const totals=d3.rollups(all,(rs:any[])=>d3.sum(rs,r=>Number(r[valueField])),(r:any)=>JSON.stringify([...(s.offlineRepetition??[]).map((f:string)=>r[f]),r[catField]]));
   const max=stacked?d3.max(totals,t=>t[1])!:d3.max(all,r=>Number(r[valueField]))!;
   const domain=inset?(horizontal?domainX:domainY):(horizontal?opts.domainX:opts.domainY);
   const sc=d3.scaleLinear().domain(domain?[Math.min(0,domain[0]),Math.max(domain[1],max)]:[0,max*1.08||1]).range(horizontal?[0,w]:[h,0]);
   const offsets=new Map();
   container.attr('data-bar-chart',id).attr('data-bar-orientation',horizontal?'horizontal':'vertical').attr('data-bar-kind',k);
   for(const [i,r] of rows.entries()){
    const c=r[catField],v=Number(r[valueField]),lo=stacked?(offsets.get(c)??0):0;offsets.set(c,lo+v);
    const b0=numericCategory?(opts.overlay?position(c)-bw/2:Math.max(0,Math.min(length-bw,position(c)-bw/2))):band(c)!;
    const b=b0+(grouped?sub(r[seriesField]??0)!:0),thickness=grouped?sub.bandwidth():bw;
    const x=horizontal?sc(lo):b,y=horizontal?b:sc(lo+v),ww=horizontal?sc(lo+v)-sc(lo):thickness,hh=horizontal?thickness:sc(lo)-sc(lo+v);
    const mark=g.append('rect').attr('data-mark-role','bar').attr('x',x).attr('y',y).attr('width',Math.max(.1,ww)).attr('height',Math.max(.1,hh)).attr('fill',color(r)).attr('opacity',opts.overlay?.68:1);
    if(opts.rowOrder)mark.attr('data-aligned-key',c).attr('data-aligned-y',frame.y+pad.t+band(c)!+band.bandwidth()/2);
    if(!cfg.anchorStride||i%cfg.anchorStride===0)anchor(r,horizontal?x+ww:x+ww/2,horizontal?y+hh/2:y);
   }
   if(drawAxes){
    const categoryScale=numericCategory?position:band;
    const ax=d3.axisBottom(horizontal?sc:categoryScale),ay=d3.axisLeft(horizontal?categoryScale:sc);
    if(horizontal||numericCategory)ax.ticks(4);if(!horizontal||numericCategory)ay.ticks(4);
    g.append('g').attr('transform',`translate(0,${h})`).call(ax).attr('font-size',10).attr('color','#8493a4');
    g.append('g').call(ay).attr('font-size',10).attr('color','#8493a4');
   }
   drawAxes=false;
  }else if(k==='stacked_area'){
   const xvals=unique(rows.map((r:any)=>Number(val(r,'x')))).sort(d3.ascending),groups=unique(rows.map((r:any)=>r._series)),stack=groups.map(()=>[] as any[]);
   for(const x of xvals){let sum=cfg.streamgraph?-d3.sum(rows.filter((r:any)=>+val(r,'x')===x),(r:any)=>+val(r,'y'))/2:0;groups.forEach((group,gi)=>{const r=rows.find((r:any)=>+val(r,'x')===x&&r._series===group);if(!r)throw new Error('Incomplete stack');const lo=sum;sum+=+val(r,'y');stack[gi].push({r,x,lo,hi:sum});});}
   stack.forEach(layer=>path(d3.area<any>().x(d=>xs(d.x)).y0(d=>ys(d.lo)).y1(d=>ys(d.hi))(layer),color(layer[0].r)).attr('opacity',.65));
   rows.forEach((r:any,i:number)=>{if(!cfg.anchorStride||i%cfg.anchorStride===0)anchor(r,xp(r),yp(r));});
  }else if(k==='single_line'||k==='multi_line'||k==='plain_area'){
   const groups=d3.group(rows,(r:any)=>r._series??0);
   for(const list of groups.values()){
    const ordered=[...list].sort((a,b)=>+val(a,'x')-+val(b,'x'));
    if(k==='plain_area'){
     const upper=(r:any)=>+val(r,e.y2?'y2':'y'),lower=(r:any)=>e.y2?+val(r,'y'):0;
     const gaps=ordered.map(r=>upper(r)-lower(r));if(gaps.some(g=>!(g>0)))throw new Error('Area boundary crossing');
     path(d3.area<any>().x(xp).y0(r=>ys(lower(r))).y1(r=>ys(upper(r)))(ordered),palette[0]).attr('opacity',.45).attr('data-area-baseline',e.y2?'range':'zero').attr('data-area-min-data-gap',Math.min(...gaps)).attr('data-area-min-screen-gap',Math.min(...ordered.map(r=>ys(lower(r))-ys(upper(r)))));

    }else path(d3.line<any>().x(xp).y(yp)(ordered),'none',color(ordered[0]),mini?1.5:2.4).attr('data-trend-series','true');
   }
   rows.forEach((r:any,i:number)=>{if(!cfg.anchorStride||i%cfg.anchorStride===0)anchor(r,xp(r),yp(r));});
  }else if(k==='point')for(const r of rows)point(r,xp(r),yp(r));
  else throw new Error(`Unsupported nested idiom ${k}`);
  if(drawAxes){
   if(e.x){const ax=d3.axisBottom(xs);if(numeric('x'))ax.ticks(4);g.append('g').attr('transform',`translate(0,${h})`).call(ax).attr('font-size',10).attr('color','#8493a4');}
   if(e.y){const ay=d3.axisLeft(ys);if(numeric('y'))ay.ticks(4);g.append('g').call(ay).attr('font-size',10).attr('color','#8493a4');}
  }
  return anchors;
 }
 function overlayOptions(children:any[],filters:any){
  const ids=children.flatMap(nestedLeaves),values:any={x:[],y:[]};
  for(const id of ids){const s=charts.get(id).spec;if(s.offlineOptions.host||s.offlineOptions.region)continue;const rows=rowsFor(id,filters);
   for(const ch of ['x','y'])if(s.encodings[ch]?.type==='quantitative')values[ch].push(...rows.map((r:any)=>Number(r[s.encodings[ch].field])));
   if(s.encodings.y2)values.y.push(...rows.map((r:any)=>+r[s.encodings.y2.field]));
   if(['stacked_bar','stacked_area'].includes(s.offlineVariation)){const totals=d3.rollups(rows,(rs:any[])=>d3.sum(rs,(r:any)=>+r[s.encodings.y.field]),(r:any)=>r[s.encodings.x.field]).map(x=>x[1]);values.y.push(...(s.offlineOptions.streamgraph?totals.flatMap(v=>[-v/2,v/2]):totals));}
  }
  return {...values.x.length?{domainX:extent(values.x)}:{},...values.y.length?{domainY:extent(values.y,true)}:{}};
 }
 function compose(n:any,frame:any,filters:any={},parent:any=root,opts:any={}):any[]{
  if(typeof n==='string')return leaf(n,frame,filters,parent,opts);
  const g=parent.append('g').attr('data-offline-composition',n.type);
  if(n.type==='overlay'){
   const shared=overlayOptions(n.children,filters);g.attr('data-shared-scales',JSON.stringify(shared));
   const insets=n.children.flatMap(nestedLeaves).map((id:string)=>opts.anchorInsets?.[id]).filter(Boolean);
   const plotInset=insets.length?{width:Math.max(...insets.map((s:any)=>s.width)),height:Math.max(...insets.map((s:any)=>s.height)),xFraction:Math.max(...insets.map((s:any)=>s.xFraction??0)),yFraction:Math.max(...insets.map((s:any)=>s.yFraction??0))}:opts.plotInset;
   return n.children.flatMap((c:any,i:number)=>compose(c,frame,filters,g,{...opts,...shared,plotInset,overlay:true,noAxes:!!opts.noAxes||i>0}));
  }
  if(n.type==='concat'||n.type==='aligned'){
   const horizontal=n.type==='aligned'||n.direction!=='vertical',weights=n.weights??n.children.map(()=>1),total=d3.sum(weights),gap=n.gap??20,available=(horizontal?frame.width:frame.height)-gap*(n.children.length-1);
   return n.children.flatMap((c:any,i:number)=>{const length=available*weights[i]/total,offset=available*d3.sum(weights.slice(0,i))/total+gap*i;return compose(c,{x:frame.x+(horizontal?offset:0),y:frame.y+(horizontal?0:offset),width:horizontal?length:frame.width,height:horizontal?frame.height:length},filters,g,{...opts,...n.type==='aligned'?{rowOrder:n.rowOrder,aligned:true,plotPadding:{l:105,r:105,t:95,b:95}}:{}});});
  }
  if(n.type==='facet'){
   const cols=Math.min(n.columns??2,n.values.length),rows=Math.ceil(n.values.length/cols),gap=28,w=(frame.width-gap*(cols-1))/cols,h=(frame.height-gap*(rows-1))/rows;
   return n.values.flatMap((v:any,i:number)=>{const [col,row]=facetIndex(i,n.values.length,cols,n.flow);const f={x:frame.x+col*(w+gap),y:frame.y+row*(h+gap),width:w,height:h};g.append('rect').attr('data-facet-border','true').attr('x',f.x).attr('y',f.y).attr('width',w).attr('height',h).attr('fill','none').attr('stroke','#aab8c5').attr('stroke-width',1.2);g.append('text').attr('x',f.x+10).attr('y',f.y+15).attr('font-family','Arial').attr('font-size',12).attr('fill','#64748b').text(v);return compose(n.child,{...f,y:f.y+24,height:f.height-24},{...filters,[n.field]:v},g,opts);});
  }
  if(n.type==='nest'){
   // The glyph is located at the actual rendered parent anchor. Bounds are reserved first.
   const horizontalAxis=charts.get(n.anchor).spec.offlineOptions.axisOrientation==='horizontal';
   const axis=n.placement==='axis',above=n.placement==='above',beside=n.placement==='beside',cell=n.placement==='cell',aligned=opts.aligned;
   const anchorSpec=charts.get(n.anchor).spec;
   const cartesian=n.placement==='center'&&(anchorSpec.offlineOptions.host==='scatter'||(!anchorSpec.offlineOptions.host&&!anchorSpec.offlineOptions.region&&['point','single_line','multi_line','bar','stacked_bar','grouped_bar'].includes(anchorSpec.offlineVariation)));
   const px=cell||axis||aligned||cartesian?0:beside?n.width+16:n.width/2+7,py=cell||axis||aligned||cartesian?0:above?n.height+16:n.height/2+7;
   const pf={x:frame.x+px,y:frame.y+py,width:frame.width-px-(beside?0:px),height:frame.height-py-(above?0:py)};
   const horizontalBar=anchorSpec.offlineOptions.barOrientation==='horizontal',category=anchorSpec.encodings[horizontalBar?'y':'x']?.field;
   // Grouped bars anchor at a subgroup's center, which can lie to either side
   // of the category coordinate. Reserve half the maximum category bandwidth.
   const fraction=anchorSpec.offlineVariation==='grouped_bar'?1/(4*unique(rowsFor(n.anchor,filters).map((r:any)=>r[category])).length):0;
   const anchorOpts=cartesian?{...opts,anchorInsets:{...opts.anchorInsets,[n.anchor]:{width:n.width,height:n.height,xFraction:horizontalBar?0:fraction,yFraction:horizontalBar?fraction:0}}}:opts;
   const anchors=compose(n.parent,pf,filters,g,axis?{...anchorOpts,plotPadding:horizontalAxis?{l:42,r:22,t:80,b:80}:{l:80,r:80,t:20,b:34}}:anchorOpts),selected=anchors.filter(a=>a.chart===n.anchor);
   if(!selected.length)throw new Error(`No spatial anchors for ${n.anchor}`);
   const seen=new Set();
   for(const a of selected){
    const key=JSON.stringify(n.fields.map((f:string)=>a.row[f]));if(seen.has(key))continue;seen.add(key);
    let w=n.width,h=n.height,cx=a.x,cy=a.y;
    if(cell&&a.cell){w=Math.max(24,a.cell.width-12);h=Math.max(24,a.cell.height-12);}
    if(axis){if(horizontalAxis){w=a.cell.width;h=Math.min(n.width,pf.height/8);}else{h=a.cell.height;w=Math.min(n.width,pf.width/8);}}
    if(above)cy=frame.y+n.height/2+8;
    if(beside){cx=frame.x+n.width/2+8;const positions=unique(selected.map(a=>a.y)).sort((a,b)=>a-b),gaps=d3.pairs(positions).map(([a,b]:any)=>b-a);h=Math.min(h,...gaps.map(d=>d*.86));}
    const f={x:cx-w/2,y:cy-h/2,width:w,height:h};
    if(f.x<frame.x-1||f.y<frame.y-1||f.x+w>frame.x+frame.width+1||f.y+h>frame.y+frame.height+1)throw new Error(`Nested child outside frame ${n.anchor} ${JSON.stringify({frame,f})}`);
    const child=g.append('g').attr('data-offline-nested-anchor',n.anchor).attr('data-anchor-x',a.x).attr('data-anchor-y',a.y).attr('data-child-frame',`${f.x},${f.y},${w},${h}`).attr('data-placement',n.placement).attr('data-anchor-filter',JSON.stringify(a.filters));
    if(cartesian&&a.plotFrame){const p=a.plotFrame;child.attr('data-parent-plot',`${p.x},${p.y},${p.width},${p.height}`);if(f.x<p.x+3||f.y<p.y+3||f.x+w>p.x+p.width-3||f.y+h>p.y+p.height-3)throw new Error(`Nested child crosses axes ${n.anchor}`);}
    if(a.cell)child.attr('data-parent-cell',`${a.cell.x},${a.cell.y},${a.cell.width},${a.cell.height}`);
    const pieChild=typeof n.child==='string'&&charts.get(n.child).spec.offlineVariation==='pie/donut/radial_bar';
    if(n.nodeContainer&&!pieChild){const host=charts.get(n.anchor).spec,field=host.encodings.color?.field;const categories=field?unique(tables.get(host.datasetId).rows.map((r:any)=>r[field])).sort():[];const border=field?palette[categories.indexOf(a.row[field])%palette.length]:'#97aabc';child.append('rect').attr('data-host-node',n.anchor).attr('x',f.x-2).attr('y',f.y-2).attr('width',w+4).attr('height',h+4).attr('rx',7).attr('fill','#fff').attr('fill-opacity',.97).attr('stroke',border).attr('stroke-width',field?1.8:1);}
    else if(cell||above||beside)child.append('rect').attr('x',f.x).attr('y',f.y).attr('width',w).attr('height',h).attr('rx',3).attr('fill','#fff').attr('fill-opacity',cell?.75:.96);
    const childFilters={...filters,...Object.fromEntries(n.fields.map((field:string)=>[field,a.row[field]]))};
    compose(n.child,f,childFilters,child,{mini:true,...axis?{...horizontalAxis?{domainX:[0,100],plotPadding:{l:0,r:0,t:2,b:2}}:{domainY:[0,100],plotPadding:{l:2,r:2,t:0,b:0}}}:{}});
   }
   return anchors;
  }
  throw new Error(`Unsupported composition ${n.type}`);
 }
 compose(scene.composition,{x:24,y:24,width:scene.width-48,height:scene.height-48});
 const svg=root.node()!.outerHTML;
 if(/(?:NaN|Infinity)/.test(svg))throw new Error('Nonfinite nested SVG geometry');
 return svg;
}
