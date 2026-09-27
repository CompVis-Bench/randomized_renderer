// Presentation-only composition for frozen v5 annotations. Leaf marks reuse D3.
import * as d3 from 'd3';
import {renderBasis} from './basis-renderer';
import {facetIndex} from './quality-rules.mjs';
import {linkPath,listLinkPath,listLinkEndpoints,unitLinkEndpoints} from './link-variation.mjs';
import {preferredChartSize} from './randomized-annotation.mjs';
const esc=(x:any)=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function renderRandomized(scene:any){
 const charts=new Map<string,any>(scene.charts.map((c:any)=>[c.id,c])),domains=scene.composition.domains,scaleDomains=scene.composition.scaleDomains??domains;
 const datasets=scene.datasets.map((d:any)=>({...d,rows:d.rows.map((r:any)=>Object.fromEntries(d.columns.map((column:any)=>[column.name,column.type==='quantitative'?Number(r[column.name]):r[column.name]])))}));
 const units:any[]=[],anchors:any[]=[];
 const rowsFor=(c:any,filters:any)=>datasets.find((d:any)=>d.id===c.spec.datasetId).rows.filter((r:any)=>Object.entries(filters).every(([f,v])=>r[f]===undefined||String(r[f])===String(v)));
 const color=(f:string,v:any)=>{const d=scaleDomains[f],categorical=scene.charts.some((c:any)=>c.spec.offlineOptions.categoricalFields.includes(f));return categorical?d3.scaleOrdinal<any,string>().domain(d).range(scene.appearance.palette)(v):d3.scaleLinear<string>().domain(d3.extent(d.map(Number)) as [number,number]).range([scene.appearance.gradient[1],scene.appearance.gradient.at(-1)])(Number(v));};
 const fraction=(f:string,v:any)=>{const d=scaleDomains[f].map(Number),lo=Math.min(...d),hi=Math.max(...d);return hi===lo?.5:Math.max(0,Math.min(1,(Number(v)-lo)/(hi-lo)));};
 const markFrame=(f:any,scale:number)=>({x:f.x+f.width*(1-scale)/2,y:f.y+f.height*(1-scale)/2,width:f.width*scale,height:f.height*scale});
 function leaf(id:string,frame:any,filters:any,mini=false){
  const c=charts.get(id),s=c.spec,rows=rowsFor(c,filters),ext=s.external;
  if(!rows.length)throw new Error(`${id}: no data in repeated context`);
  const [preferredWidth,preferredHeight]=preferredChartSize(s.offlineVariation);
  const scale=Math.min(1,frame.width/preferredWidth,frame.height/preferredHeight);
  let f={x:frame.x+(frame.width-preferredWidth*scale)/2,y:frame.y+(frame.height-preferredHeight*scale)/2,width:preferredWidth*scale,height:preferredHeight*scale};
  let appearance={...scene.appearance};
  if(ext.size)f=markFrame(f,Math.sqrt(.42+.58*fraction(ext.size,rows[0][ext.size])));
  if(ext.color){const paint=color(ext.color,rows[0][ext.color]);appearance={...appearance,palette:Array(6).fill(paint),gradient:Array(5).fill(paint)};}
  const sharedPositions:any={};
  for(const axis of ['x','y'])if(s.encodings[axis]){const field=s.encodings[axis].field,d=scaleDomains[field];if(d.every((v:any)=>Number.isFinite(Number(v))))sharedPositions[axis]={axis,field,kind:'number',domain:[Math.min(0,...d.map(Number)),Math.max(...d.map(Number))*1.1||1]};}
  const out=renderBasis(c,datasets,f,filters,appearance,{axes:!mini,sharedPositions});
  units.push(...out.units);anchors.push(...out.anchors);
  return {content:`<g data-randomized-instance="${esc(id)}" data-context="${esc(JSON.stringify(filters))}" data-instance-frame="${esc(JSON.stringify(f))}">${out.content}</g>`,anchors:out.anchors};
 }
 function combine(results:any[]){return {content:results.map(r=>r.content).join(''),anchors:results.flatMap(r=>r.anchors)};}
 function draw(n:any,f:any,filters:any={},mini=false):any{
  if(typeof n==='string')return leaf(n,f,filters,mini);
  if(n.type==='layer')return combine(n.children.map((child:any)=>draw(child,f,filters,mini)));
  if(n.type==='concat'){
   const horizontal=n.direction==='horizontal',axis=horizontal?'width':'height',weights=n.weights??n.children.map(()=>1),sum=d3.sum(weights),space=f[axis]-(n.children.length-1)*n.gap;
   let offset=0;return combine(n.children.map((child:any,i:number)=>{const length=space*weights[i]/sum,cell={...f,[horizontal?'x':'y']:f[horizontal?'x':'y']+offset,[axis]:length};offset+=length+n.gap;return draw(child,cell,filters,mini);}));
  }
  if(n.type==='repeat'){
   const count=n.values.length,cols=n.columns,rows=Math.ceil(count/cols),gap=20,label=24,w=(f.width-gap*(cols-1))/cols,h=(f.height-gap*(rows-1))/rows;
   return combine(n.values.map((value:any,i:number)=>{const [col,row]=facetIndex(i,count,cols,n.flow),x=f.x+col*(w+gap),y=f.y+row*(h+gap),result=draw(n.child,{x,y:y+label,width:w,height:h-label},{...filters,[n.field]:value},mini);return {...result,content:`<g data-randomized-layout="facet" data-field="${esc(n.field)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#b8c4ce"/><text x="${x+10}" y="${y+16}" font-size="11" fill="#475569">${esc(value)}</text>${result.content}</g>`};}));
  }
  if(n.type==='scaffold'){
   const [fx,fy]=n.fields,dx=domains[fx],dy=domains[fy],w=(f.width-70)/dx.length,h=(f.height-50)/dy.length;
   const results=[];for(let i=0;i<dx.length;i++)for(let j=0;j<dy.length;j++)results.push(draw(n.child,{x:f.x+50+i*w+8,y:f.y+10+(dy.length-1-j)*h+8,width:w-16,height:h-16},{...filters,[fx]:dx[i],[fy]:dy[j]},mini));
   const axes=`<path d="M${f.x+45},${f.y+5}V${f.y+f.height-32}H${f.x+f.width-5}" stroke="#64748b" fill="none"/>`+dx.map((v:any,i:number)=>`<text x="${f.x+50+(i+.5)*w}" y="${f.y+f.height-12}" text-anchor="middle" font-size="11">${esc(v)}</text>`).join('')+dy.map((v:any,i:number)=>`<text x="${f.x+36}" y="${f.y+10+(dy.length-i-.5)*h}" text-anchor="end" font-size="11">${esc(v)}</text>`).join('');
   const result=combine(results);return {...result,content:`<g data-randomized-layout="nested-scaffold">${axes}${result.content}</g>`};
  }
  if(n.type==='nest'){
   const childWidth=Math.max(48,Math.min(72,f.width/8)),childHeight=Math.max(48,Math.min(64,f.height/6)),parentFrame={x:f.x+childWidth/2,y:f.y+childHeight/2,width:f.width-childWidth,height:f.height-childHeight};
   const parent=draw(n.parent,parentFrame,filters,mini),all=parent.anchors.filter((a:any)=>a.chart===n.anchor),seen=new Set();
   const selected=all.filter((a:any)=>{const key=JSON.stringify(n.fields.map((v:string)=>a.row[v]));if(seen.has(key))return false;seen.add(key);return true;});
   if(!selected.length)throw new Error('No visible nested anchors: '+n.anchor);
   // Reject collisions rather than silently move children off their data anchors.
   for(let i=0;i<selected.length;i++)for(let j=0;j<i;j++)if(Math.abs(selected[i].x-selected[j].x)<childWidth&&Math.abs(selected[i].y-selected[j].y)<childHeight)throw new Error(`Nested children overlap at ${n.anchor}; use facet policy or fewer repetitions`);
   const children=selected.map((a:any)=>draw(n.child,{x:a.x-childWidth/2,y:a.y-childHeight/2,width:childWidth,height:childHeight},{...filters,...Object.fromEntries(n.fields.map((v:string)=>[v,a.row[v]]))},true));
   // Keep the annotated host marks visible over the child glyphs.
   const host=charts.get(n.anchor).spec.offlineVariation;
   return combine(['point','single_line'].includes(host)?[...children,parent]:[parent,...children]);
  }
  throw new Error('Unknown randomized layout: '+n.type);
 }
 const result=draw(scene.composition.child,{x:24,y:24,width:scene.width-48,height:scene.height-48});
 // The concat separating the target groups defines the link axis. Individual
 // matches and differently sized charts must not override that layout choice.
 const contains=(n:any,id:string):boolean=>typeof n==='string'?n===id:[n.child,n.parent,...n.children??[]].filter(Boolean).some(child=>contains(child,id));
 function connectionDirection(n:any,a:string,b:string):string|undefined{
  if(typeof n==='string')return undefined;
  const children=[n.child,n.parent,...n.children??[]].filter(Boolean);
  const common=children.find(child=>contains(child,a)&&contains(child,b));
  if(common)return connectionDirection(common,a,b);
  if(n.type==='concat'&&children.some(child=>contains(child,a))&&children.some(child=>contains(child,b)))return n.direction;
 }
 let connections='';
 for(const id of scene.composition.links){const c=charts.get(id),s=c.spec,targets=s.offlineLinkTargets,rows=rowsFor(c,{}),parts=[];
  const endpoint=(target:string,list=false)=>{const us=units.filter(u=>u.chart===target);if(list&&us.length>1)return us;const as=anchors.filter(a=>a.chart===target).map(a=>({chart:a.chart,frame:{x:a.x-4,y:a.y-4,width:8,height:8},x:a.x,y:a.y,filters:a.filters,rows:[a.row]}));if(as.length>1)return as;return us.length?us:as;};
  const groups=targets.map(target=>endpoint(target,targets.length===2));if(groups.some(g=>!g.length))throw new Error(`${id}: no visible link endpoints`);
  const style=(row:any,index:number)=>{const sw=s.encodings['stroke.width']?2.4+6*fraction(s.encodings['stroke.width'].field,row[s.encodings['stroke.width'].field]):2.6;const paint=s.encodings['stroke.color']?color(s.encodings['stroke.color'].field,row[s.encodings['stroke.color'].field]):'#718096';return {sw,paint,index};};
  const pairs=new Set();let index=0;
  if(targets.length===1){
   const group=groups[0];if(group.length<2)throw new Error(`${id}: one-group link needs at least two visible elements`);
   for(let i=0;i<group.length-1;i++){
    const u=group[i],v=group[i+1],key=JSON.stringify([u.frame,v.frame].sort((a,b)=>a.x-b.x||a.y-b.y));if(pairs.has(key))continue;pairs.add(key);
    const row=rows[index++%Math.max(1,rows.length)]??{};const p='x' in u?[u.x,u.y]:unitLinkEndpoints(u.frame,v.frame,index)[0],q='x' in v?[v.x,v.y]:unitLinkEndpoints(u.frame,v.frame,index)[1];if(Math.hypot(p[0]-q[0],p[1]-q[1])<1)continue;const look=style(row,index);
    parts.push(`<path data-link-chart="${esc(id)}" data-source-chart="${esc(u.chart)}" data-target-chart="${esc(v.chart)}" d="${linkPath(p,q,'bezier',index)}" stroke="${look.paint}" stroke-width="${look.sw}" stroke-linecap="round" fill="none" opacity=".82"/>`);
   }
  }else for(let t=0;t<groups.length-1;t++){
   const a=groups[t],b=groups[t+1],count=Math.max(a.length,b.length),perm=b.map((v:any,i:number)=>({v,key:Math.imul(i+1,2654435761)^(s.offlineOptions.linkSeed??0)})).sort((x:any,y:any)=>x.key-y.key).map((p:any)=>p.v);
   const center=(group:any[])=>group.reduce((p,u)=>[p[0]+u.frame.x+u.frame.width/2,p[1]+u.frame.y+u.frame.height/2],[0,0]).map(v=>v/group.length);
   const ac=center(a),bc=center(b),listOrientation=connectionDirection(scene.composition.child,targets[t],targets[t+1])??(Math.abs(bc[0]-ac[0])>=Math.abs(bc[1]-ac[1])?'horizontal':'vertical');
   for(let i=0;i<count;i++){const u=a[i%a.length],reps=s.external.position,compatible=perm.filter((v:any)=>v!==u&&reps.every((f:string)=>u.filters[f]===undefined||v.filters[f]===undefined||String(u.filters[f])===String(v.filters[f])));if(!compatible.length)continue;const v=compatible[i%compatible.length];
    const key=JSON.stringify([u.frame,v.frame].sort((a,b)=>a.x-b.x||a.y-b.y));if(pairs.has(key))continue;pairs.add(key);
    const contextRows=rows.filter((r:any)=>reps.every((f:string)=>u.filters[f]===undefined||String(r[f])===String(u.filters[f])));if(!contextRows.length)throw new Error(`${id}: no link rows for endpoint context`);
    const row=contextRows[index++%contextRows.length],[p,q]=listLinkEndpoints(u.frame,v.frame,listOrientation,index);if(Math.hypot(p[0]-q[0],p[1]-q[1])<1)continue;const look=style(row,index);
    parts.push(`<path data-link-chart="${esc(id)}" data-source-chart="${esc(u.chart)}" data-target-chart="${esc(v.chart)}" data-list-orientation="${listOrientation}" data-source-frame="${esc(JSON.stringify(u.frame))}" data-target-frame="${esc(JSON.stringify(v.frame))}" d="${listLinkPath(p,q,listOrientation)}" stroke="${look.paint}" stroke-width="${look.sw}" stroke-linecap="round" fill="none" opacity=".82"/>`);
   }
  }
  if(!parts.length)throw new Error(`${id}: no distinct compatible endpoints`);
  connections+=parts.join('');
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" font-family="Arial,sans-serif"><rect width="100%" height="100%" fill="white"/>${result.content}${connections}</svg>`;
 if(/NaN|Infinity/.test(svg))throw new Error('Nonfinite geometry in randomized scene');
 return svg;
}
