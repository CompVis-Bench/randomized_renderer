// Annotation -> sampled presentation -> synthetic data -> render scene.
// This path never calls refinePositionRelations: field identities are immutable.
import {geoCentroid} from 'd3';
import {facetLayout, trendFraction} from './quality-rules.mjs';
import {enrichVenn} from './venn-content.mjs';
import {annotationChannels,basisChannels,palettes,rng} from './randomized-browser-constants.mjs';

export {annotationChannels};
const uniq = xs => [...new Set(xs)];
const equalSet = (a,b) => a.length===b.length && a.every(x=>b.includes(x));
const check = (v,m) => {if(!v) throw new Error(m);};
const bars = ['bar','stacked_bar','grouped_bar','normalized_stacked_bar','unit_bar'];
const hierarchy = ['tree','radial_tree','treemap','circlepacking','sunburst','icicle'];
const fields = c => uniq([...Object.values(c.encodings), ...c.external_encodings.position, ...['size','color'].map(k=>c.external_encodings[k]).filter(Boolean)]);
const positions = c => uniq(['x','y','theta','radius'].map(k=>c.encodings['position.'+k]).filter(Boolean));
export const defaultPolicy = Object.freeze({layerProbability:.5,nestedProbability:.5,minRepetitions:2,maxRepetitions:6,maxInstances:512,maxRows:150000,maxPixels:60000000});

export function validateAnnotation(a) {
 check(a && Object.keys(a).join(',')==='charts' && Array.isArray(a.charts) && a.charts.length>0 && a.charts.length<=64,'Expected v5 {charts:[...]} with 1–64 templates');
 const ids=new Set(a.charts.map(c=>c.chart_id));check(ids.size===a.charts.length,'Duplicate chart IDs');
 const links=new Set(a.charts.filter(c=>c.variation==='link').map(c=>c.chart_id));
 for(const c of a.charts){
  const keys=['chart_id','variation','encodings','external_encodings',...(c.variation==='link'?['link_targets']:[])];
  check(equalSet(Object.keys(c),keys)&&/^C[1-9]\d*$/.test(c.chart_id),`Invalid chart properties: ${c.chart_id}`);
  check(annotationChannels[c.variation],`Unknown variation: ${c.variation}`);
  check(c.encodings && !Array.isArray(c.encodings) && Object.keys(c.encodings).every(k=>annotationChannels[c.variation].includes(k)),`Invalid native channel: ${c.chart_id} (${Object.keys(c.encodings??{}).filter(k=>!annotationChannels[c.variation].includes(k)).join(', ')})`);
  const ext=c.external_encodings;check(ext && Object.keys(ext).every(k=>['position','size','color'].includes(k)) && Array.isArray(ext.position) && uniq(ext.position).length===ext.position.length,`Invalid external encodings: ${c.chart_id}`);
  check(['size','color'].every(k=>!(k in ext)||typeof ext[k]==='string'&&/^F[1-9]\d*$/.test(ext[k])),`Invalid whole-instance field: ${c.chart_id}`);
  check(fields(c).every(f=>typeof f==='string'&&/^F[1-9]\d*$/.test(f)),`Invalid field ID: ${c.chart_id}`);
  if(c.variation==='link')check(Array.isArray(c.link_targets)&&uniq(c.link_targets).length===c.link_targets.length&&c.link_targets.every(id=>ids.has(id)&&!links.has(id)),`Invalid link targets: ${c.chart_id}`);
 }
 return a;
}

export function buildRandomizedAnnotation(input, {seed=23,policy:overrides={},geometry=null}={}) {
 validateAnnotation(input);
 const policy={...defaultPolicy,...overrides};
 check(Object.keys(overrides).every(k=>k in defaultPolicy),'Unknown policy option');
 for(const [k,v] of Object.entries(policy))check(Number.isFinite(v)&&(k.endsWith('Probability')?v>=0&&v<=1:Number.isInteger(v)&&v>0),`Invalid policy.${k}`);
 check(policy.minRepetitions>=2&&policy.maxRepetitions>=policy.minRepetitions&&policy.maxRepetitions<=6,'Repetition counts must be in [2,6]');
 check(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff,'seed must be a uint32');
 const random=rng(seed),pick=a=>a[Math.floor(random()*a.length)],integer=(min,max)=>min+Math.floor(random()*(max-min+1));
 const annotation=structuredClone(input), frozen=JSON.stringify(annotation),charts=annotation.charts;
 const decisions=[],domains={},categorical=new Set(),rep=new Set(charts.flatMap(c=>c.external_encodings.position));
 // Keep field domains compact and chart appropriate. A shared field gets the
 // intersection of the ranges requested by every chart that uses it.
 const domainHints=new Map();
 const hint=(field,min,max)=>{
  if(!field)return;
  const previous=domainHints.get(field);
  domainHints.set(field,previous?{min:Math.max(previous.min,min),max:Math.min(previous.max,max)}:{min,max});
 };
 const cfg=new Map(),numericViews=new Set(['point','connected_scatterplot','single_line','multi_line','plain_area','contour','dotplot','tick_plot']);
 for(const c of charts){
  const e=c.encodings,k=c.variation;
  // Reject unsupported bindings instead of silently dropping a channel.
  const implemented=new Set(basisChannels[k]??[]);
  if(k==='circlepacking')implemented.delete('color');
  if(k==='tree')for(const ch of ['color','size','stroke.color','stroke.width'])implemented.add(ch);
  if(k==='multi_radar')implemented.add('color');
  for(const ch of Object.keys(e))check(implemented.has(ch),`${c.chart_id}: renderer does not yet implement ${k}.${ch}`);
  check(!(['point','connected_scatterplot','multi_line'].includes(k)&&e['position.theta']),`${c.chart_id}: polar ${k} requires a renderer extension`);
  // Radar color is rendered as the series color in the basis adapter.
  if(k==='link'){check(c.link_targets.length>0,`${c.chart_id}: cannot render unidentified link targets`);check(!c.external_encodings.size&&!c.external_encodings.color,`${c.chart_id}: external size/color on a link is not yet implemented`);}
  if(k==='euler_venn')check(e.color,`${c.chart_id}: Venn synthesis requires a color field`);
  const horizontal=!!e['position.y_offset']||bars.includes(k)&&!e['position.y'];
  const o={categoricalFields:[],repetitionFields:c.external_encodings.position,donut:random()<.5,barOrientation:horizontal?'horizontal':'vertical',axisOrientation:'vertical',streamgraph:k==='stacked_area'&&random()<.5,treeLayout:random()<.5?'tree':'cluster',treemapTile:pick(['squarify','binary','slice','dice']),linkSeed:Math.floor(random()*0xffffffff)};
  if(k.startsWith('geo_')){check(geometry?.features?.length,`${c.chart_id}: supply local GeoJSON geometry`);o.geometry=geometry;}
  cfg.set(c.chart_id,o);
  decisions.push({kind:'presentation',chart:c.chart_id,donut:k==='pie/donut/radial_bar'&&!e['position.radius']?o.donut:undefined,streamgraph:k==='stacked_area'?o.streamgraph:undefined,treeLayout:k==='tree'?o.treeLayout:undefined,treemapTile:k==='treemap'?o.treemapTile:undefined});
  for(const [ch,f] of Object.entries(e))if(ch==='shape'||ch==='stroke.color'||ch.endsWith('_offset')||ch==='text'||ch==='color'&&!['rect_heatmap','calendar_heatmap','hexbin','geo_area'].includes(k))categorical.add(f);
  if(bars.includes(k)&&e[horizontal?'position.y':'position.x'])categorical.add(e[horizontal?'position.y':'position.x']);
  if(['rect_heatmap','calendar_heatmap','hexbin'].includes(k))for(const ch of ['position.x','position.y'])if(e[ch])categorical.add(e[ch]);
  if(k==='parallel_coordinates')categorical.add(e['position.x']);
  for(const [ch,f] of Object.entries(e)){
   if(ch==='position.theta')hint(f,3,10); // radar/polar categories: never fewer than 3 or more than 10
   else if(ch==='position.radius')hint(f,5,10);
   else if(ch.endsWith('_offset'))hint(f,2,4);
   else if(ch==='color'||ch==='shape'||ch==='text'||ch==='stroke.color')hint(f,4,8);
   else if(ch==='position.x'||ch==='position.y'){
    const compact=['bar','stacked_bar','grouped_bar','rect_heatmap','calendar_heatmap','hexbin','single_boxplot','multi_boxplot','violin','parallel_coordinates'].includes(k);
    hint(f,compact?4:8,compact?8:14);
   }
  }
 }
 for(const f of uniq(charts.flatMap(fields))){
  if(rep.has(f)){
   const n=policy.minRepetitions+Math.floor(random()*(policy.maxRepetitions-policy.minRepetitions+1));
   domains[f]=Array.from({length:n},(_,i)=>i+1);
   continue;
  }
  const requested=domainHints.get(f)??(categorical.has(f)?{min:4,max:8}:{min:8,max:14});
  const min=Math.max(3,requested.min),max=Math.max(min,requested.max);
  const n=integer(min,max);
  domains[f]=Array.from({length:n},(_,i)=>categorical.has(f)?i+1:12+i*5);
 }
 for(const c of charts){const e=c.encodings;
  if(e.text)domains[e.text]=['Energy','Water','Forest','Climate','Urban','Soil','River','Ocean','Carbon','Solar','Wind','Rain'];
  if(c.variation.startsWith('geo_')){const centers=geometry.features.map(geoCentroid);if(e['position.x'])domains[e['position.x']]=uniq(centers.map(p=>p[0]));if(e['position.y'])domains[e['position.y']]=uniq(centers.map(p=>p[1]));}
  if(c.variation==='plain_area'&&e['position.y2']){check(e['position.y']!==e['position.y2'],'Area boundary fields must differ');domains[e['position.y2']]=domains[e['position.y']].map(v=>v+100);}
 }
 
 const remaining=c=>c.external_encodings.position;
 
 const nodes=charts.filter(c=>c.variation!=='link').map(c=>({node:c.chart_id,reps:[...remaining(c)],ids:[c.chart_id]}));
 const byId=new Map(charts.map(c=>[c.chart_id,c]));
 // A visible host is eligible only when its actual positional fields account
 // for the child's additional repetition fields. No anonymous replacement IDs.
 for(const child of [...nodes]){
  if(!nodes.includes(child)||typeof child.node!=='string')continue;
  const candidates=nodes.filter(host=>host!==child&&typeof host.node==='string'&&['point','single_line','bar','rect_heatmap'].includes(byId.get(host.node).variation)&&positions(byId.get(host.node)).length&&equalSet(child.reps,uniq([...host.reps,...positions(byId.get(host.node))])));
  if(candidates.length&&random()<policy.nestedProbability){const host=pick(candidates),anchor=host.node,fs=positions(byId.get(anchor));host.node={type:'nest',parent:host.node,child:child.node,anchor,fields:fs};host.ids.push(...child.ids);nodes.splice(nodes.indexOf(child),1);decisions.push({kind:'nested',host:anchor,child:child.node,fields:fs});}
 }
 function combine(items){
  if(items.length===1)return items[0].reps.reduceRight((n,f)=>repeat(f,n),items[0].node);
  // Factor a common enclosing field before choosing local composition.
  const common=items[0].reps.filter(f=>items.every(n=>n.reps.includes(f)));
  if(common.length){const f=pick(common);return repeat(f,combine(items.map(n=>({...n,reps:n.reps.filter(x=>x!==f)}))));}
  // Align compatible pairs; field IDs are never renamed to fit a layout.
  const pending=[...items],out=[];
  while(pending.length){const a=pending.shift();let paired=false;
   if(!a.reps.length&&typeof a.node==='string')for(let i=0;i<pending.length;i++){
    const b=pending[i];if(b.reps.length||typeof b.node!=='string')continue;
    const ca=byId.get(a.node),cb=byId.get(b.node),shared=['x','y'].filter(k=>ca.encodings['position.'+k]&&ca.encodings['position.'+k]===cb.encodings['position.'+k]);
    if(!shared.length)continue;
    const compatible=numericViews.has(ca.variation)&&numericViews.has(cb.variation)&&ca.variation!==cb.variation&&!([ca.variation,cb.variation].includes('plain_area')&&[ca.variation,cb.variation].some(k=>['single_line','multi_line'].includes(k)));
    const layer=shared.length===2&&compatible&&random()<policy.layerProbability;
    const axis=pick(shared),direction=axis==='x'?'vertical':'horizontal';
    const node={type:layer?'layer':'concat',direction,gap:28,children:[a.node,b.node],shared:shared.map(k=>({axis:k,field:ca.encodings['position.'+k]})),weights:[1,1]};
    out.push({node,reps:[],ids:[...a.ids,...b.ids]});pending.splice(i,1);paired=true;decisions.push({kind:layer?'layered':'aligned-concat',charts:[a.node,b.node],shared:node.shared,direction:layer?undefined:direction});break;
   }
   if(!paired)out.push({...a,node:a.reps.reduceRight((n,f)=>repeat(f,n),a.node),reps:[]});
  }
  if(out.length===1)return out[0].node;
  const direction=random()<.5?'horizontal':'vertical';
  return {type:'concat',direction,gap:28,children:out.map(n=>n.node),weights:out.map(()=>.8+random()*.4)};
 }
 function repeat(field,child){
  const layout=facetLayout(domains[field].length,random);
  // Keep repeated charts readable on the page. Four columns gives every
  // facet a stable cell while avoiding a single ultra-wide strip.
  layout.columns=Math.min(layout.columns,4);
  decisions.push({kind:'facet',field,...layout});
  return {type:'repeat',field,values:domains[field],...layout,child};
 }
 check(nodes.length>0,'At least one non-link template is required');
 let composition=combine(nodes);
 // Independent repetitions may also be realized as a hidden coordinate scaffold.
 function scaffold(n){if(typeof n==='string')return n;if(n.type==='repeat'){
  if(n.child?.type==='repeat'&&random()<policy.nestedProbability){const inner=n.child;decisions.push({kind:'nested-scaffold',fields:[n.field,inner.field]});return {type:'scaffold',fields:[n.field,inner.field],child:scaffold(inner.child)};}
  return {...n,child:scaffold(n.child)};
 }if(n.type==='nest')return {...n,parent:scaffold(n.parent),child:scaffold(n.child)};return {...n,children:n.children.map(scaffold)};}
 composition=scaffold(composition);
 const datasets=[],renderCharts=[],cartesian=fs=>{let result=[{}];for(const f of fs){check(result.length*domains[f].length<=policy.maxInstances,`Repetition exceeds maxInstances for ${fs}`);result=result.flatMap(r=>domains[f].map(v=>({...r,[f]:v})));}return result;};
 let rowCount=0;
 for(const c of charts){const e=c.encodings,k=c.variation,o=cfg.get(c.chart_id),fs=fields(c),rows=[];
  o.categoricalFields=[...categorical];o.fieldDomains=domains;
  const contexts=cartesian(c.external_encodings.position);
  for(const context of contexts){const values=f=>f?(f in context?[context[f]]:domains[f]):[1,2,3,4];
   const put=(v={},extra={})=>{check(++rowCount<=policy.maxRows,'Synthetic data exceeds maxRows');rows.push({...Object.fromEntries(fs.map(f=>[f,pick(values(f))])),...v,...context,...extra,_row:String(rows.length)});};
   if(hierarchy.includes(k)){for(let i=0;i<15;i++){const v={};if(e['position.x'])v[e['position.x']]=i+1;if(e['position.y'])v[e['position.y']]=Math.floor(Math.log2(i+1));if(e['position.radius'])v[e['position.radius']]=Math.floor(Math.log2(i+1));put(v,{_node:'n'+i,_parent:i?'n'+Math.floor((i-1)/2):'none'});}}
   else if(k.startsWith('geo_'))geometry.features.forEach((f,i)=>{const p=geoCentroid(f);put({...e['position.x']?{[e['position.x']]:p[0]}:{},...e['position.y']?{[e['position.y']]:p[1]}:{}},{_feature:i});});
   else if(k==='parallel_coordinates'){const dim=e[o.axisOrientation==='horizontal'?'position.y':'position.x'],value=e[o.axisOrientation==='horizontal'?'position.x':'position.y'];check(dim&&value,`${c.chart_id}: parallel coordinates need both axes`);o.parallelDimension=dim;o.parallelValue=value;o.parallelLineStyle=random()<.5?'straight':'bezier';for(let j=0;j<12;j++)for(const x of values(dim))put({[dim]:x,...e.color?{[e.color]:values(e.color)[j%values(e.color).length]}:{}},{_series:j});}
   else if(['rect_heatmap','calendar_heatmap','hexbin'].includes(k)){for(const x of values(e['position.x']))for(const y of values(e['position.y']))put({...e['position.x']?{[e['position.x']]:x}:{},...e['position.y']?{[e['position.y']]:y}:{}});}
   else if(['single_boxplot','multi_boxplot','violin'].includes(k)){for(const x of k==='single_boxplot'?[null]:values(e['position.x']))for(let j=0;j<40;j++)put(x===null?{}:{[e['position.x']]:x});}
   else if(k==='word_cloud'){check(e.text,`${c.chart_id}: word cloud synthesis requires text`);for(const word of values(e.text))put({[e.text]:word});}
   else if(k==='euler_venn'){for(const color of values(e.color))put({[e.color]:color});}
   else if(k==='link'){for(let i=0;i<12;i++)put(Object.fromEntries(Object.values(e).map(f=>[f,values(f)[i%values(f).length]])), {_edge:i});}
   else if(k==='pie/donut/radial_bar'&&!e['position.radius']){for(const [i,v] of values(e.color).entries())put(e.color?{[e.color]:v}:{},{_series:i});}
   else if(['point','connected_scatterplot','dotplot','tick_plot','contour'].includes(k)){
    const count=k==='contour'?180:Math.min(40,Math.max(values(e['position.x']).length,values(e['position.y']).length));
    for(let i=0;i<count;i++){const v={};for(const [j,ch] of ['position.x','position.y'].entries())if(e[ch]){const d=values(e[ch]);v[e[ch]]=d[(i*(j?7:1)+Math.floor(i/d.length))%d.length];}put(v);}
   }else{
    const axis=e['position.theta']??e[o.barOrientation==='horizontal'&&bars.includes(k)?'position.y':'position.x']??e['position.y'];
    const series=['multi_line','multi_radar','stacked_area','stacked_bar','normalized_stacked_bar','grouped_bar','horizon_chart'].includes(k)?3:1;
    for(let j=0;j<series;j++)for(const [i,x] of values(axis).entries()){
     const v=axis?{[axis]:x}:{};for(const f of uniq([e.color,e['position.x_offset'],e['position.y_offset']].filter(Boolean)))if(f!==axis)v[f]=values(f)[(series>1?j:i)%values(f).length];
     if(['single_line','multi_line','plain_area','stacked_area','radial_area','horizon_chart'].includes(k))for(const ch of ['position.y','position.radius'])if(e[ch]&&e[ch]!==axis){const d=values(e[ch]);v[e[ch]]=d[Math.round(trendFraction(i/Math.max(1,values(axis).length-1),seed%4,j*.4)*(d.length-1))];}
     put(v,{_series:j,_band:j});
    }
   }
  }
  const all=uniq(rows.flatMap(Object.keys)),table={id:'table_'+c.chart_id,columns:all.map(name=>({name,type:rows.some(r=>typeof r[name]==='string')?'nominal':'quantitative'})),rows};datasets.push(table);
  renderCharts.push({id:c.chart_id,spec:{chartType:'OfflineBasisIdiom',datasetId:table.id,encodings:Object.fromEntries(Object.entries(e).map(([k,f])=>[k.replace('position.',''),{field:f,type:'quantitative'}])),offlineVariation:k,offlineOptions:o,offlineAnchorFields:positions(c),offlineLinkTargets:c.link_targets??[],external:structuredClone(c.external_encodings)}});
 }
 // Instance-level whole-chart values are shared by field and repetition context.
 for(const c of charts)for(const key of ['size','color']){const f=c.external_encodings[key];if(!f)continue;const table=datasets.find(t=>t.id==='table_'+c.chart_id);const contexts=cartesian(c.external_encodings.position);contexts.forEach((ctx,i)=>{const value=ctx[f]??domains[f][i%domains[f].length];for(const row of table.rows)if(Object.entries(ctx).every(([k,v])=>row[k]===v))row[f]=value;});}
 const scaleDomains=Object.fromEntries(Object.entries(domains).map(([f,d])=>[f,uniq([...d,...datasets.flatMap(t=>t.rows.map(r=>r[f]).filter(v=>v!==undefined))]).sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b)))]));
 for(const c of renderCharts)c.spec.offlineOptions.fieldDomains=scaleDomains;
 const legacy={sample_id:'random-'+seed,charts:charts.map(c=>({chart_id:c.chart_id,variation:c.variation,encodings:c.encodings,repetition_position:c.external_encodings.position}))};
 const plan={charts:renderCharts.map(c=>({id:c.id,datasetId:c.spec.datasetId,basis:c.spec.offlineOptions})),datasets};enrichVenn({annotation:legacy,plan});
 function chartSize(id){
  const variation=byId.get(id)?.variation;
  if(['pie/donut/radial_bar','single_radar','multi_radar','radial_area'].includes(variation))return [360,360];
  if(variation==='parallel_coordinates')return [640,360];
  if(['rect_heatmap','calendar_heatmap','hexbin'].includes(variation))return [400,340];
  if(['single_boxplot','multi_boxplot','violin'].includes(variation))return [400,300];
  if(['tree','dendrogram','radial_tree','treemap','circlepacking','sunburst','icicle'].includes(variation))return [480,360];
  return [420,300];
 }
 function measure(n){if(typeof n==='string')return chartSize(n);if(n.type==='scaffold'){const [w,h]=measure(n.child);return [w*domains[n.fields[0]].length+70,h*domains[n.fields[1]].length+50];}if(n.type==='nest'){const child=measure(n.child);return [Math.max(950,child[0]*3),Math.max(740,child[1]*3)];}if(n.type==='repeat'){const [w,h]=measure(n.child),cols=n.columns,rows=Math.ceil(n.values.length/cols);return [cols*w+(cols-1)*20,rows*(h+24)+(rows-1)*20];}if(n.type==='layer')return [460,340];const sizes=n.children.map(measure),axis=n.direction==='horizontal'?0:1;return [0,1].map(i=>i===axis?sizes.reduce((s,v)=>s+v[i],0)+(sizes.length-1)*n.gap:Math.max(...sizes.map(v=>v[i])));}
 const size=measure(composition),width=Math.ceil(size[0]+48),height=Math.ceil(size[1]+48);
 check(width<=16384&&height<=16384&&width*height<=policy.maxPixels,`Composition exceeds pixel budget: ${width}x${height}; lower repetition limits or split the input`);
 const appearance={palette:pick(palettes),gradient:pick([['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'],['#ffffd4','#fed98e','#fe9929','#d95f0e','#993404'],['#f2f0f7','#cbc9e2','#9e9ac8','#756bb1','#54278f']]),showFieldLabels:false,fontSize:11};
 const scene={version:1,width,height,background:'#ffffff',appearance,datasets,charts:renderCharts,composition:{type:'randomized',child:composition,domains,scaleDomains,links:charts.filter(c=>c.variation==='link').map(c=>c.chart_id)}};
 validateRandomizedScene(annotation,scene);
 check(JSON.stringify(annotation)===frozen,'Rendering mutated the frozen annotation');
 return {annotation,scene,provenance:{renderer:'randomized-annotation-v1',seed,policy,decisions,synthetic_data:true,one_render_per_target:true,field_domains:scaleDomains,repetition_domains:Object.fromEntries([...rep].map(f=>[f,domains[f]])),annotation_unchanged:true,review_status:'generated_pending_review'}};
}

export function validateRandomizedScene(annotation,scene){
 const expected=new Map(annotation.charts.filter(c=>c.variation!=='link').map(c=>[c.chart_id,c.external_encodings.position]));
 const seen=new Set();
 function visit(n,inherited=[]){
  if(typeof n==='string'){check(!seen.has(n)&&expected.has(n),`Duplicate or unknown template ${n}`);seen.add(n);check(equalSet(uniq(inherited),expected.get(n)),`Lost repetition fields on ${n}`);return;}
  if(n.type==='repeat')visit(n.child,[...inherited,n.field]);
  else if(n.type==='scaffold')visit(n.child,[...inherited,...n.fields]);
  else if(n.type==='nest'){visit(n.parent,inherited);visit(n.child,[...inherited,...n.fields]);}
  else n.children.forEach(c=>visit(c,inherited));
 }
 visit(scene.composition.child);check(seen.size===expected.size,'Missing visible templates');
 for(const c of annotation.charts){const s=scene.charts.find(x=>x.id===c.chart_id)?.spec;check(s&&s.offlineVariation===c.variation,`Variation changed: ${c.chart_id}`);check(JSON.stringify(s.external)===JSON.stringify(c.external_encodings),`External bindings changed: ${c.chart_id}`);check(equalSet(Object.keys(s.encodings),Object.keys(c.encodings).map(k=>k.replace('position.',''))),`Encoding channels changed: ${c.chart_id}`);for(const [k,f] of Object.entries(c.encodings))check(s.encodings[k.replace('position.','')].field===f,`Field identity changed: ${c.chart_id}`);}
 return true;
}
