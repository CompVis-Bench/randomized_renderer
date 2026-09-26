import {varyLinks} from './link-variation.mjs';
import {refinePositionRelations} from './position-relations.mjs';
import {removeReplacedScatterPoints} from './nested-layout.mjs';
import {varyBarDirections,barKinds} from './bar-variation.mjs';
import {orientParallelCharts} from './parallel-orientation.mjs';
import {facetLayout} from './quality-rules.mjs';
import {compileNested,nestedLeaves} from './nested-contracts.mjs';
import {palettes} from './recipes.mjs';
import {geoAlbersUsa,geoMercator} from 'd3';
export const nestedFamilies=[
 'parallel-axis-boxplot','parallel-axis-top-charts','parallel-axis-distributions',
 'scatter-map-nodes','graph-map-nodes','scatter-pie-donut-nodes',
 'scatter-map-layer-nodes','graph-map-layer-nodes','geographic-network',
 'map-point-chart-nodes','heatmap-cell-chart','heatmap-cell-composite',
 'tree-node-chart','tree-node-map','tree-aligned-heatmap','tree-aligned-bars',
 'stacked-bar-line-nested','bar-area-line-nested','multiline-area-nested','gallery-treemap-nested',
];
export const operationNames=['unrelated-view','related-mg','related-repeated-mg','repeat-whole','additional-nesting','facet-two-members','double-facet','merge-shared-field','three-pairwise-fields','merge-two-composites','pair-complex-idioms'];
const rng=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
const round=n=>Math.round(n*10000)/10000;
const uniq=a=>[...new Set(a)];
export function buildNested(family,variant,geographies,basis=[],seed=924500,barTypes={}){
 const qualityRandom=rng(seed+family*10007+variant*971+731991);
 const random=rng(seed+family*10007+variant*971),operation=(family*25+variant)%11;
 const fields=[],defs=new Map(),datasets=[],notes=[],shared=[];
 const field=(role,type='quantitative')=>{const id=`F${fields.length+1}`;fields.push({field_id:id,image_role:role,type});return id;};
 const cohort=field('cohort category','nominal'),time=field('ordered time');
 const groups=['Alpha','Beta','Gamma','Delta'];
 const phase=random()*6.28,trendMode=variant%4;
 const trend=(t,g=0,offset=0)=>round(24+g*9+offset+(trendMode===0?38*t:trendMode===1?35*(1-t):trendMode===2?28*Math.sin(Math.PI*t):32*(1-Math.exp(-3*t)))+4*Math.sin(6.28*t+phase+g*.2));
 function leaf(variation,encodings,make,options={}){
  const id=`C${defs.size+1}`;
  defs.set(id,{id,variation,encodings,make,options,rows:[],reps:null});return id;
 }
 const concat=(children,direction='horizontal',weights)=>({type:'concat',direction,gap:20,children,...weights?{weights}:{}});
 const overlay=children=>({type:'overlay',children});
 const facet=(child,f,labels=['Earlier','Later'])=>{const count=2+Math.floor(qualityRandom()*5),values=Array.from({length:count},(_,i)=>labels[i]??`Group ${i+1}`);return {type:'facet',field:f,values,...facetLayout(count,qualityRandom),child};};
 const nest=(parent,child,anchor,fs,width=140,height=100,placement='center',extra={})=>({type:'nest',parent,child,anchor,fields:fs,width,height,placement,...extra});
 const contextOffset=ctx=>Object.values(ctx).reduce((s,v)=>s+(typeof v==='number'?v%7:String(v).length%4),0)%9;
 function mini(kind='line',opts={}){
  if(kind==='bar'||kind==='stacked'){const draw=barKinds[Math.floor(qualityRandom()*3)],selected=barTypes[`C${defs.size+1}`]??draw;kind={bar:'bar',stacked_bar:'stacked',grouped_bar:'grouped'}[selected];}
  const replacement=kind==='area'&&qualityRandom()<.5;
  const streamgraph=replacement&&qualityRandom()<.5;
  if(replacement)kind='stackarea';
  const x=opts.x??time,y=opts.y??field('time-dependent measure'),c=opts.color??cohort;
  if(kind==='pie'||kind==='donut'){
   const amount=field('component amount');return leaf('pie/donut/radial_bar',{'position.theta':amount,color:c},ctx=>groups.map((g,i)=>({[c]:g,[amount]:round(10+random()*35+i*2+contextOffset(ctx))})),{donut:kind==='donut',...opts});
  }
  if(kind==='box')return leaf('single_boxplot',{'position.y':y},ctx=>Array.from({length:80},(_,i)=>({[y]:round(48+15*Math.sin(i*1.17)+10*Math.sin(i*2.39)+contextOffset(ctx))})),opts);
  if(kind==='scatter')return leaf('point',{'position.x':x,'position.y':y,color:c},ctx=>Array.from({length:64},(_,i)=>({[x]:i/63,[y]:trend(i/63,0,contextOffset(ctx))+5*Math.sin(i*7.3),[c]:groups[i%4]})),opts);
  if(kind==='heatmap'){
   const a=field('column category','ordinal'),b=field('row category','ordinal'),v=field('cell measure');
   return leaf('rect_heatmap',{'position.x':a,'position.y':b,color:v},ctx=>Array.from({length:36},(_,i)=>({[a]:i%6+1,[b]:Math.floor(i/6)+1,[v]:trend((i%6)/5,0,contextOffset(ctx))+Math.floor(i/6)*5})),opts);
  }
  const multi=['multi','stacked','grouped','stackarea'].includes(kind),count=['bar','stacked','grouped'].includes(kind)?12:48;
  const make=ctx=>Array.from({length:(multi?3:1)*count},(_,i)=>{const g=Math.floor(i/count),t=(i%count)/(count-1),value=['bar','stacked','grouped'].includes(kind)?round(8+90*(.12+.88*((i*7+Math.floor(phase*19)+g*11)%23)/22)**1.7):trend(t,g,contextOffset(ctx));return {[x]:round(t),[y]:kind==='stacked'||kind==='stackarea'?round(value/3):value,...multi||kind==='bar'?{[c]:groups[multi?g:i%4]}:{},_series:g};});
  if(kind==='area'){
   return leaf('plain_area',{'position.x':x,'position.y':y},make,{trend:true,...opts});
  }
  const variations={line:'single_line',multi:'multi_line',bar:'bar',stacked:'stacked_bar',grouped:'grouped_bar',stackarea:'stacked_area'};
  return leaf(variations[kind],{'position.x':x,'position.y':y,...kind==='grouped'?{'position.x_offset':c}:{},...multi||kind==='bar'?{color:c}:{}},make,{trend:!['bar','stacked','grouped'].includes(kind),streamgraph,...opts});
 }
 function mapLayers(layered=false,regionOffset=0){
  const region=geographies[(family*3+variant+regionOffset)%geographies.length];
  const v=field('synthetic geographic intensity'),lon=field('longitude'),lat=field('latitude');
  const opt={region,anchorFields:[lon,lat]};
  const area=leaf('geo_area',{color:v},ctx=>region.geometry.features.map((f,i)=>({_feature:f.id,[v]:round(25+25*Math.sin(i*.73+phase)+contextOffset(ctx)+random()*20)})),opt);
  if(!layered)return {node:area,region};
  const count=Math.min(18,region.points.length),points=region.points.filter(p=>region.id!=='united-states'||!['02','15'].includes(p.feature)).slice(0,count);
  const point=leaf('geo_point',{'position.x':lon,'position.y':lat,color:cohort},()=>points.map((p,i)=>({[lon]:p.coordinates[0],[lat]:p.coordinates[1],[cohort]:groups[i%4]})),opt);
  const line=leaf('geo_line',{'position.x':lon,'position.y':lat},()=>points.slice(0,8).map((p,i)=>({[lon]:p.coordinates[0],[lat]:p.coordinates[1],_series:0,_order:i})),opt);
  return {node:overlay([area,line,point]),region};
 }
 function scatterHost(){
  const x=field('parent horizontal position'),y=field('parent vertical position');
  const positions=Array.from({length:9},(_,i)=>({[x]:round((i%3)*35+8+random()*10),[y]:round(Math.floor(i/3)*32+8+random()*12),[cohort]:groups[i%4]}));
  const id=leaf('point',{'position.x':x,'position.y':y,color:cohort},()=>positions,{host:'scatter',anchorFields:[x,y]});return {node:id,id,fs:[x,y]};
 }
 function graphHost(){
  const key=field('graph node identity','nominal'),source=field('edge source node','nominal'),target=field('edge target node','nominal');
  const ids=Array.from({length:8},(_,i)=>`node-${i+1}`);
  const id=leaf('point',{color:cohort},()=>ids.map((n,i)=>({[key]:n,[cohort]:groups[i%4],_order:i})),{host:'graph',key,anchorFields:[key]});
  const links=leaf('link',{source,target},()=>ids.flatMap((n,i)=>[{[source]:n,[target]:ids[(i+1)%8]},...(i%2===0?[{[source]:n,[target]:ids[(i+3)%8]}]:[])]),{host:'graph-links',source,target,nodeChart:id});defs.get(links).link_targets=[id];
  return {node:overlay([links,id]),id,fs:[key]};
 }
 function heatmapHost(){
  const x=field('matrix column','ordinal'),y=field('matrix row','ordinal'),v=field('matrix cell intensity');
  const id=leaf('rect_heatmap',{'position.x':x,'position.y':y,color:v},()=>Array.from({length:12},(_,i)=>({[x]:i%4+1,[y]:Math.floor(i/4)+1,[v]:round(10+random()*80)})),{host:'heatmap',anchorFields:[x,y]});return {node:id,id,fs:[x,y]};
 }
 function treeHost(){
  const depth=field('tree depth'),key=field('tree node identity','nominal');
  const rows=Array.from({length:15},(_,i)=>({[depth]:Math.floor(Math.log2(i+1)),[key]:`node-${i+1}`,_node:`node-${i+1}`,_parent:i===0?'':`node-${Math.floor((i-1)/2)+1}`}));
  const id=leaf('tree',{'position.x':depth,'position.y':key},()=>rows,{host:'tree',key,depth,anchorFields:[depth,key]});return {node:id,id,fs:[depth,key],key,leaves:rows.slice(7).map(r=>r[key])};
 }
 function parallelHost(){
  const dim=field('parallel coordinate dimension','ordinal'),value=field('normalized dimension value');
  const id=leaf('parallel_coordinates',{'position.x':dim,'position.y':value,color:cohort},ctx=>Array.from({length:32*6},(_,i)=>{const record=Math.floor(i/6),axis=i%6;return {[dim]:axis+1,[value]:round(15+record%8*8+14*Math.sin(record*.6+axis*.7+phase)+contextOffset(ctx)),[cohort]:groups[record%4],_series:record};}),{host:'parallel',anchorFields:[dim]});return {node:id,id,fs:[dim],dim,value};
 }
 function geoHost(network=false){
  const {node:area,region}=mapLayers(false),lon=field('node longitude'),lat=field('node latitude'),key=field('geographic node identity','nominal');
  const projection=(region.projection==='albersUsa'?geoAlbersUsa():geoMercator()).fitExtent([[0,0],[1000,700]],region.geometry);
  const candidates=region.points.filter(p=>region.id!=='united-states'||!['02','15'].includes(p.feature)).map(p=>({...p,screen:projection(p.coordinates)})).filter(p=>p.screen);
  const selected=[candidates[Math.floor(candidates.length/2)]];
  while(selected.length<Math.min(7,candidates.length)){
   const best=candidates.filter(p=>!selected.includes(p)).sort((a,b)=>Math.min(...selected.map(s=>Math.hypot(b.screen[0]-s.screen[0],b.screen[1]-s.screen[1])))-Math.min(...selected.map(s=>Math.hypot(a.screen[0]-s.screen[0],a.screen[1]-s.screen[1]))))[0];selected.push(best);
  }
  const id=leaf('geo_point',{'position.x':lon,'position.y':lat,color:cohort},()=>selected.map((p,i)=>({[lon]:p.coordinates[0],[lat]:p.coordinates[1],[cohort]:groups[i%4],[key]:`site-${i+1}`})),{region,host:'geo-points',key,anchorFields:[lon,lat]});
  let node=overlay([area,id]);
  if(network){const source=field('geographic edge source','nominal'),target=field('geographic edge target','nominal');const links=leaf('link',{source,target},()=>selected.map((_,i)=>({[source]:`site-${i+1}`,[target]:`site-${(i+1)%selected.length+1}`})),{host:'geo-links',source,target,nodeChart:id,region});defs.get(links).link_targets=[id];node=overlay([area,links,id]);}
  return {node,id,fs:[lon,lat]};
 }
 function alignedBars(x,h){
  const draw=barKinds[Math.floor(qualityRandom()*3)],kind=barTypes[`C${defs.size+1}`]??draw,series=kind==='bar'?null:field('leaf amount component','nominal');
  return leaf(kind,{'position.x':x,'position.y':h.key,...series?{color:series}:{},...kind==='grouped_bar'?{'position.y_offset':series}:{}},()=>h.leaves.flatMap(key=>{const total=round(20+random()*65);return series?[.2,.35,.45].map((weight,i)=>({[x]:round(total*weight),[h.key]:key,[series]:groups[i],_series:i})):[{[x]:total,[h.key]:key,_series:0}];}),{horizontal:true,rowOrder:h.leaves});
 }
 function core(f,secondary=false){
  let h,child,node;
  if(f<=2){
   h=parallelHost();
   if(f===0){child=mini('box',{y:h.value,domainY:[0,100],onAxis:true});defs.get(child).make=ctx=>defs.get(h.id).rows.filter(r=>Object.entries(ctx).every(([f,v])=>r[f]===v)).map(r=>({[h.value]:r[h.value]}));node=nest(h.node,child,h.id,h.fs,58,440,'axis');}
   if(f===1){child=concat([mini(variant%2?'line':'bar'),mini(variant%2?'bar':'area')],'vertical');node=nest(h.node,child,h.id,h.fs,142,190,'above');}
   if(f===2){const count=field('density at dimension value');child=leaf(variant%3===0?'bar':variant%3===1?'plain_area':'single_line',{'position.x':count,'position.y':h.value,},ctx=>Array.from({length:40},(_,i)=>({[count]:round(25*Math.exp(-(((i-21-contextOffset(ctx)/3)/10)**2))),[h.value]:i*2.5})),{onAxis:true,distribution:true,domainY:[0,100]});node=nest(h.node,child,h.id,h.fs,94,440,'axis');}
  }else if([3,4,5,6,7].includes(f)){
   h=[4,7].includes(f)?graphHost():scatterHost();
   child=f===5?mini(variant%2?'pie':'donut'):mapLayers([6,7].includes(f),secondary?4:0).node;
   node=nest(h.node,child,h.id,h.fs,f===5?106:174,f===5?106:124,'center',{nodeContainer:true});
  }else if(f===8||f===9){
   h=geoHost(f===8);child=f===8?mini(variant%2?'donut':'bar'):overlay([mini('area'),mini('line')]);
   node=nest(h.node,child,h.id,h.fs,118,84,'center',{nodeContainer:true});
  }else if(f===10||f===11){h=heatmapHost();child=f===10?mini(['multi','bar','scatter','donut'][variant%4]):variant%2?overlay([mini('area'),mini('line'),mini('scatter')]):concat([mini('donut'),mini('bar')]);node=nest(h.node,child,h.id,h.fs,174,120,'cell');
  }else if(f>=12&&f<=15){
   h=treeHost();child=f===13?mapLayers(true,secondary?5:0).node:mini(['bar','multi','donut'][variant%3]);
   node=nest(h.node,child,h.id,h.fs,f===13?118:100,f===13?78:64,'center',{nodeContainer:true});
   if(f===14||f===15){
    const x=field(f===14?'attribute column':'leaf amount',f===14?'ordinal':'quantitative'),v=field('leaf matrix value');
    const id=f===14?leaf('rect_heatmap',{'position.x':x,'position.y':h.key,color:v},()=>h.leaves.flatMap((key,i)=>Array.from({length:12},(_,j)=>({[x]:j+1,[h.key]:key,[v]:trend(j/11,i%3)}))),{rowOrder:h.leaves}):alignedBars(x,h);
    node={type:'aligned',field:h.key,rowOrder:h.leaves,children:[node,id],weights:[.6,.4]};
   }
  }else if(f>=16&&f<=18){
   const y=field('common quantitative measure');
   const bars=mini(f===18?'multi':f===16?'stacked':'bar',{y});
   const line=mini('line',{y});const area=f===16?null:mini('area');
   const composite=overlay(f===16?[bars,line]:[area,bars,line]);
   // A small set of actual line samples are designated glyph anchors; the line remains dense.
   defs.get(line).options.anchorFields=[time,y];defs.get(line).options.anchorStride=12;
   child=mini(variant%2?'donut':'bar',{x:field('within-node ordered time')});node=nest(composite,child,line,[time,y],94,66,'center',{nodeContainer:true});
  }else{
   const key=field('treemap leaf identity','nominal'),mass=field('hierarchical leaf mass');
   const id=leaf('treemap',{size:mass,color:cohort},()=>Array.from({length:12},(_,i)=>({[key]:`leaf-${i+1}`,[mass]:round(40+random()*20),[cohort]:groups[i%4]})),{host:'treemap',key,anchorFields:[key]});
   child=variant%2?overlay([mini('area'),mini('line')]):concat([mini('donut'),mini('bar')]);node=nest(id,child,id,[key],160,108,'cell');
  }
  return node;
 }
 let root=core(family);
 const primaryIds=nestedLeaves(root);
 function relatedField(exclude=[]){
  const candidates=primaryIds.flatMap(id=>Object.values(defs.get(id).encodings));
  return [cohort,time,...candidates].find(f=>candidates.includes(f)&&!exclude.includes(f));
 }
 function summary(sharedField,y=field('total weight of matching observations')){
  const sourceId=primaryIds.find(id=>Object.values(defs.get(id).encodings).includes(sharedField));
  const draw=barKinds[Math.floor(qualityRandom()*3)],kind=barTypes[`C${defs.size+1}`]??draw,series=kind==='bar'?null:field('observation weight component','nominal');
  return leaf(kind,{'position.x':sharedField,'position.y':y,...series?{color:series}:{},...kind==='grouped_bar'?{'position.x_offset':series}:{}},ctx=>{
   const rows=defs.get(sourceId).rows.filter(r=>Object.entries(ctx).every(([f,v])=>r[f]===undefined||r[f]===v)),counts=new Map();
   const categories=uniq(rows.map(r=>r[sharedField]));
   for(const r of rows){r._observation_weight??=round(1+9*((categories.indexOf(r[sharedField])*7+3)%17)/16);counts.set(r[sharedField],round((counts.get(r[sharedField])??0)+r._observation_weight));}
   return [...counts].flatMap(([x,count])=>series?[.18,.31,.51].map((weight,i)=>({[sharedField]:x,[y]:round(count*weight),[series]:groups[i],_series:i})):[{[sharedField]:x,[y]:count,_series:0}]);
  },{categoryScale:'band',aggregation:{source:sourceId,groupBy:sharedField,operation:'sum',measure:'_observation_weight'}});
 }
 function side(related=false){return related?summary(relatedField()):mini(variant%2?'multi':'bar',{color:field('independent group','nominal'),x:field('independent ordered x')});}
 if(operation===0)root=concat([root,side(false)],'horizontal',[.76,.24]);
 if(operation===1||operation===7){root=concat([root,side(true)],variant%2?'vertical':'horizontal',[.76,.24]);shared.push({fields:[relatedField()],relation:'observation weights summed by an actual source field'});}
 if(operation===2){const f=field('additional chart panel','nominal');root=concat([root,facet(side(true),f)],'horizontal',[.7,.3]);shared.push({fields:[relatedField()],relation:'observation weights summed by an actual source field'});}
 if(operation===3)root=facet(root,field('whole-composite repeat group','nominal'));
 if(operation===4){
  // A genuine second level: replace one embedded leaf by a bar with pies at its tips.
  let target;function find(n){if(typeof n==='string')return;if(n.type==='nest'&&!target){target=n;return;}if(n.children)n.children.forEach(find);if(n.child)find(n.child);}find(root);
  const innerTime=field('second-level ordered time'),parent=mini('bar',{x:innerTime});const def=defs.get(parent);def.options.anchorFields=[innerTime,def.encodings['position.y']];def.options.anchorStride=8;
  const extraChild=mini('donut');
  if(['axis','above'].includes(target.placement))root=nest(root,nest(parent,extraChild,parent,def.options.anchorFields,38,38,'center',{nodeContainer:true}),target.anchor,target.fields,150,150,'above');
  else {target.child=nest(concat([target.child,parent],'vertical'),extraChild,parent,def.options.anchorFields,38,38,'center',{nodeContainer:true});target.width=Math.max(target.width,180);target.height=Math.max(target.height,170);}
 }
 if(operation===5){const f=field('shared panel group','nominal');root=facet(concat([root,side(true)],'horizontal',[.76,.24]),f);shared.push({fields:[f,relatedField()],relation:'same facet cells'});}
 if(operation===6){root=facet(facet(root,field('inner facet group','nominal'),['Low','High']),field('outer facet group','nominal'),['Morning','Evening']);}
 if(operation===8){const f1=relatedField(),f2=relatedField([f1]),bridge=field('total weight of matching observations');const a=summary(f1,bridge),b=summary(f2,bridge);root=concat([root,concat([a,b],'vertical')],'horizontal',[.72,.28]);shared.push({parts:[0,1],fields:[f1]},{parts:[0,2],fields:[f2]},{parts:[1,2],fields:[bridge]});}
 if(operation===9||operation===10){const next=(family+7)%20,second=core(next,true);const firstFields=new Set(nestedLeaves(root).flatMap(id=>Object.values(defs.get(id).encodings))),secondFields=new Set(nestedLeaves(second).flatMap(id=>Object.values(defs.get(id).encodings)));root=concat([root,second],variant%2?'vertical':'horizontal');notes.push(`Second complete constructed composite: ${nestedFamilies[next]}`);shared.push({fields:[...firstFields].filter(f=>secondFields.has(f)),relation:'actual common variables across constructed composites'});}
 // Materialize every leaf in the exact nesting/facet context, deriving v3 repetition fields from that tree.
 function materialize(n,ctx={},reps=[]){
  if(typeof n==='string'){
   const d=defs.get(n);d.reps??=uniq(reps);const rows=d.make(ctx).map(r=>({...r,...ctx}));
   for(const r of rows){r._row=String(d.rows.length);d.rows.push(r);}return;
  }
  if(n.type==='facet'){for(const v of n.values)materialize(n.child,{...ctx,[n.field]:v},[...reps,n.field]);return;}
  if(n.type==='nest'){
   materialize(n.parent,ctx,reps);const d=defs.get(n.anchor);const rows=d.rows.filter(r=>Object.entries(ctx).every(([f,v])=>r[f]===v));
   const seen=new Set();for(const [i,r] of rows.entries()){
    if(d.options.anchorStride&&i%d.options.anchorStride!==0)continue;
    const key=JSON.stringify(n.fields.map(f=>r[f]));if(seen.has(key))continue;seen.add(key);
    materialize(n.child,{...ctx,...Object.fromEntries(n.fields.map(f=>[f,r[f]]))},uniq([...reps,...n.fields]));
   }return;
  }
  n.children.forEach(c=>materialize(c,ctx,reps));
 }
 materialize(root);
 const charts=[];
 for(const d of defs.values()){
  if(!d.rows.length)throw new Error(`Unused chart ${d.id}`);
  const columns=uniq(d.rows.flatMap(Object.keys)).map(name=>({name,type:fields.find(f=>f.field_id===name)?.type??(name==='_observation_weight'?'quantitative':'nominal')}));
  datasets.push({id:`table_${d.id}`,columns,rows:d.rows,primaryKey:['_row']});
  charts.push({chart_id:d.id,variation:d.variation,encodings:d.encodings,repetition_position:d.reps,...d.link_targets?{link_targets:d.link_targets}:{}});
 }
 const annotation={schema_version:'chart_encoding_variation_only_v3',sample_id:`nested-${String(family+1).padStart(2,'0')}-${String(variant+1).padStart(3,'0')}`,charts,data_fields:fields.filter(f=>charts.some(c=>Object.values(c.encodings).includes(f.field_id)||c.repetition_position.includes(f.field_id))).map(({type,...f})=>f),image_observation:`Synthetic ${nestedFamilies[family]}; ${operationNames[operation]}. Children occupy actual parent anchors/cells/axes, not merely related fields. All measurements synthetic; no field/chart IDs or chart names are displayed.`};
 const countFacets=n=>typeof n==='string'?0:n.type==='facet'?1+countFacets(n.child):n.type==='nest'?Math.max(countFacets(n.parent),countFacets(n.child)):Math.max(...n.children.map(countFacets));
 const wide=[0,1,2,14,15].includes(family),facets=countFacets(root);
 const two=operation===9||operation===10;
 const plan={version:1,width:(two&&variant%2===0?2800:wide?1800:1600)*(facets?2:1),height:(two&&variant%2?2100:family>=12&&family<=15?1100:1000)*(facets>1?2:1),datasets,charts:[...defs.values()].map(d=>({id:d.id,datasetId:`table_${d.id}`,options:d.options})),composition:root,appearance:{showFieldLabels:false,palette:palettes[(variant+family)%palettes.length],gradient:['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'],fontSize:11}};
 if(operation===4&&family>=12&&family<=15)plan.height=2000;
 if(operation===4&&family===19){plan.width=2200;plan.height=1600;}
 const facetScale=n=>{
  if(typeof n==='string')return [1,1];
  if(n.type==='facet'){const a=facetScale(n.child);return [a[0]*n.columns,a[1]*Math.ceil(n.values.length/n.columns)];}
  const aa=(n.type==='nest'?[n.parent,n.child]:n.children).map(facetScale);return [Math.max(...aa.map(a=>a[0])),Math.max(...aa.map(a=>a[1]))];
 };
 const scale=facetScale(root);plan.width=Math.round(plan.width/(facets?2:1)*scale[0]);plan.height=Math.round(plan.height/(facets>1?2:1)*scale[1]);
 const shrink=Math.min(1,15500/plan.width,15500/plan.height,Math.sqrt(58000000/(plan.width*plan.height)));
 plan.width=Math.floor(plan.width*shrink);plan.height=Math.floor(plan.height*shrink);
 orientParallelCharts({annotation,plan},()=>qualityRandom()<.5?'horizontal':'vertical');
 varyBarDirections({annotation,plan},()=>qualityRandom()<.5?'horizontal':'vertical');

 const variationSources=Object.fromEntries(uniq(charts.map(c=>c.variation)).map(v=>[v,basis.filter(s=>s.annotation.charts.some(c=>c.variation===v)).map(s=>s.sample_id??s.annotation.sample_id).slice(0,3)]));
 const job={annotation,plan,provenance:{family:nestedFamilies[family],family_index:family,variant,operation:operationNames[operation],seed:seed+family*10007+variant*971,source_kind:'new explicit constructions using basis v3 vocabulary and gallery structures; not pixel reconstructions',variation_sources:variationSources,geographies:uniq([...defs.values()].map(d=>d.options.region?.id).filter(Boolean)),shared_fields:shared,notes,trend_model:['increasing','decreasing','smooth-hump','saturating'][trendMode],row_count:datasets.reduce((s,d)=>s+d.rows.length,0)}};
 refinePositionRelations(job);
 removeReplacedScatterPoints(job);
 varyLinks(job);
 return {...job,scene:compileNested(annotation,plan)};
}
