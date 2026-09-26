import {applyListLinks,listCandidates} from './list-links.mjs';
import {refinePositionRelations} from './position-relations.mjs';
import {varyBarDirections,barKinds} from './bar-variation.mjs';
import {enrichVenn} from './venn-content.mjs';
import {layerGeographicViews} from './geo-layering.mjs';
import {landscapeStackedAreas} from './area-layout.mjs';
import {varyParallelGeometry} from './parallel-variation.mjs';
import {reflowParallelGeometry} from './parallel-layout.mjs';
import {orientParallelCharts} from './parallel-orientation.mjs';
import {facetLayout,trendFraction} from './quality-rules.mjs';
import { geoCentroid, geoContains, geoBounds } from 'd3';
import { readFile } from 'node:fs/promises';
import { palettes } from './recipes.mjs';
import { compileTarget } from './compile.mjs';
export const densityProfile = Object.freeze({
 version: 3, name: 'structured', repetitions: [2,6], categories: 12, colors: 6,
 quantitativeValues: 48, points: 100, contourPoints: 240, hierarchyNodes: 31,
 parallelRecords: 18, distributionSamples: 80, edges: 36,
 geoPoints: 100, observationsPerArea: 4, calendarWeeks: 20, nestedAnchors: 12,
});
const mockWords = ['Energy','Water','Forest','Climate','Urban','Soil','River','Ocean',
 'Carbon','Solar','Wind','Rain','Habitat','Species','Coast','Lake','Policy','Transit',
 'Waste','Health','Growth','Demand','Supply','Resilience'];
export const expansionKinds=[
 '01-unrelated-view','02-related-mg','03-related-repeated-mg','04-repeat-all-mg-rmg','05-nest-selected-mg',
 '06-facet-two-mgs','07-double-facet-whole','08-merge-two-share-field','09-merge-three-pairwise-fields',
 '10-merge-two-composites','11-pair-complex-idioms',
];
export const expansionLabels=['添加数据无关可视化','添加数据相关 MG','添加数据相关的重复 MG','所有 MG/RMG 增加 repetition','选一个 MG 添加 nested','两个 MG 按同一字段 facet','整体连续 facet 两次','两个单视图共享一个字段','三个单视图两两共享字段','两个已有 composite 共享字段','复杂 idiom 两两组合'];
export const rng=(seed)=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const clone=structuredClone;
const uniq=a=>[...new Set(a)];
const fieldsOf=c=>uniq([...Object.values(c.encodings),...c.repetition_position]);
const posOf=c=>uniq(Object.entries(c.encodings).filter(([k])=>['position.x','position.y','position.theta','position.radius'].includes(k)).map(([,v])=>v));
const primitive=new Set(['bar','point','single_line','link','tick_plot']);
const hierarchy=new Set(['tree','dendrogram','radial_tree','sunburst','icicle','treemap','circlepacking']);
export async function loadBasis(root='data') {
 const manifest=JSON.parse(await readFile(`${root}/manifest.json`,'utf8'));
 return Promise.all(manifest.samples.map(async s=>({annotation:JSON.parse(await readFile(`${root}/${s.annotation}`,'utf8')),manifest:s})));
}
function grid(children, domains=null) {
 if(children.length===1)return children[0];
 const rows=[];for(let i=0;i<children.length;i+=2)rows.push(children.length-i===1?children[i]:{type:'concat',direction:'horizontal',gap:28,children:children.slice(i,i+2),...(domains?{weights:children.slice(i,i+2).map(c=>natural(c,domains)[0])}:{})});
 return rows.length===1?rows[0]:{type:'concat',direction:'vertical',gap:28,children:rows,...(domains?{weights:rows.map(c=>natural(c,domains)[1])}:{})};
}
function chartRefs(n){if(typeof n==='string')return[n];if(n.type==='chart')return[n.chart];if(n.type==='facet')return chartRefs(n.child);if(n.type==='nested')return [...chartRefs(n.parent),...chartRefs(n.child)];if(n.type==='linked')return [...chartRefs(n.child),...n.links.flatMap(chartRefs)];return n.children.flatMap(chartRefs);}
function facetColumns(child,domains,field,leaf=[340,260]) {
 const [width,height]=natural(child,domains,leaf),count=domains[field].length;
 return Math.min(count,Math.max(1,Math.round(Math.sqrt(count*height/width))));
}
function natural(n,domains,leaf=[340,260]) {
 if(typeof n==='string'||n.type==='chart')return leaf;
 if(n.type==='layer')return leaf;
 if(n.type==='facet'){const s=natural(n.child,domains,leaf),count=domains[n.field].length,cols=Math.min(n.columns??2,count);const gap=n.gap??24,label=n.labelHeight??24;return[s[0]*cols+gap*(cols-1),(s[1]+label)*Math.ceil(count/cols)+gap*(Math.ceil(count/cols)-1)];}
 if(n.type==='nested'){const p=natural(n.parent,domains,leaf);return[p[0]+100,p[1]+100];}
 if(n.type==='linked')return natural(n.child,domains,leaf);
 const a=n.children.map(c=>natural(c,domains,leaf)),horizontal=n.direction==='horizontal';
 return horizontal?[a.reduce((s,p)=>s+p[0],0)+(n.gap??28)*(a.length-1),Math.max(...a.map(p=>p[1]))]:[Math.max(...a.map(p=>p[0])),a.reduce((s,p)=>s+p[1],0)+(n.gap??28)*(a.length-1)];
}
export function buildExpansion(basis,kind,index,seed=240924,geometry=null) {
 const qualityRandom=rng(seed+kind*100003+index*1009+731991);
 const random=rng(seed+kind*100003+index*1009),pick=a=>a[Math.floor(random()*a.length)];
 const annotation={schema_version:'chart_encoding_variation_only_v3',sample_id:`composite-${String(kind+1).padStart(2,'0')}-${String(index+1).padStart(3,'0')}`,charts:[],data_fields:[],image_observation:''};
 const provenance={operation:expansionKinds[kind],seed:seed+kind*100003+index*1009,sources:[],shared_fields:[],selected_charts:[],added_fields:[],synthetic_data:true,density_profile:densityProfile,reconstruction:'Source MG encodings and repetition fields are retained under explicit ID maps. Synthetic data and a new layout are constructed; original source pixels/data are not recovered.'};
 let nextF=1,nextC=1;
 function field(role){const f=`F${nextF++}`;annotation.data_fields.push({field_id:f,image_role:role});return f;}
 function addSource(item,charts=null){const original=item.annotation;const selected=charts??original.charts;const all=uniq(selected.flatMap(fieldsOf));const fm=Object.fromEntries(all.map(f=>[f,field(original.data_fields.find(d=>d.field_id===f)?.image_role??f)]));const cm=Object.fromEntries(selected.map(c=>[c.chart_id,`C${nextC++}`]));
  const copied=selected.map(c=>({...clone(c),chart_id:cm[c.chart_id],encodings:Object.fromEntries(Object.entries(c.encodings).map(([k,v])=>[k,fm[v]])),repetition_position:c.repetition_position.map(f=>fm[f]),...(c.link_targets?{link_targets:c.link_targets.map(id=>cm[id])}:{})}));
  annotation.charts.push(...copied);provenance.sources.push({sample_id:original.sample_id,annotation_sha256:item.manifest.annotation_sha256,chart_map:cm,field_map:fm});return copied;
 }
 function rename(from,to){for(const c of annotation.charts){for(const k of Object.keys(c.encodings))if(c.encodings[k]===from)c.encodings[k]=to;c.repetition_position=uniq(c.repetition_position.map(f=>f===from?to:f));}for(const p of provenance.sources)for(const f of Object.keys(p.field_map))if(p.field_map[f]===from)p.field_map[f]=to;annotation.data_fields=annotation.data_fields.filter(f=>f.field_id!==from);}
 const originals=basis.map(x=>x.annotation);const atomic=basis.flatMap(b=>b.annotation.charts.filter(c=>c.variation!=='link').map(c=>({item:b,chart:c})));
 const compatible=atomic.filter(x=>!hierarchy.has(x.chart.variation)&&!x.chart.variation.startsWith('geo_')&&x.chart.variation!=='word_cloud'&&uniq(Object.values(x.chart.encodings)).length>=2);
 const complexes=atomic.filter(x=>!primitive.has(x.chart.variation));
 const complexVariations=uniq(complexes.map(x=>x.chart.variation)).sort();
 let parts=[],nested=null,wholeFields=[],pairFacet=null;
 if(kind===7||kind===8){const count=kind===7?2:3;const selected=[];while(selected.length<count){const p=pick(compatible);if(!selected.some(x=>x.item.annotation.sample_id===p.item.annotation.sample_id&&x.chart.chart_id===p.chart.chart_id))selected.push(p);}
  parts=selected.map(p=>addSource(p.item,[p.chart]));
  const ff=parts.map(p=>uniq(Object.values(p[0].encodings)));
  if(kind===7){rename(ff[1][0],ff[0][0]);provenance.shared_fields.push({parts:[0,1],field:ff[0][0]});}
  else {rename(ff[1][0],ff[0][0]);rename(ff[2][0],ff[0][1]);rename(ff[2][1],ff[1][1]);provenance.shared_fields.push({parts:[0,1],field:ff[0][0]},{parts:[0,2],field:ff[0][1]},{parts:[1,2],field:ff[1][1]});}
 } else if(kind===9){const pool=basis.filter(b=>b.annotation.charts.length>1);const a=pool[index%pool.length],b=pool[(index+1+Math.floor(index/pool.length))%pool.length];parts=[addSource(a),addSource(b)];
  // Preserve each composite's internal field identities; use a compatible numeric binding across sources.
  const eligible=p=>p.flatMap(c=>Object.entries(c.encodings).filter(([ch])=>!['source','target','text'].includes(ch)).map(([,f])=>f));
  const f0=eligible(parts[0])[0],f1=eligible(parts[1])[0];rename(f1,f0);provenance.shared_fields.push({parts:[0,1],field:f0});
 } else if(kind===10){const v0=complexVariations[index%complexVariations.length],v1=complexVariations[(index+1+Math.floor(index/complexVariations.length))%complexVariations.length];const a=pick(complexes.filter(x=>x.chart.variation===v0)),b=pick(complexes.filter(x=>x.chart.variation===v1));parts=[addSource(a.item,[a.chart]),addSource(b.item,[b.chart])];
  if(index%2===0){const choose=c=>c.encodings.color??c.encodings.size??Object.values(c.encodings)[0];const f0=choose(parts[0][0]),f1=choose(parts[1][0]);rename(f1,f0);provenance.shared_fields.push({parts:[0,1],field:f0});}
 } else {
  let pool=basis;
  if(kind===4)pool=basis.filter(b=>b.annotation.charts.some(c=>['bar','point'].includes(c.variation)&&c.encodings['position.x']&&c.encodings['position.y']));
  if(kind===5)pool=basis.filter(b=>b.annotation.charts.filter(c=>c.variation!=='link').length>=2);
  const chosen=pool[(index+kind*37)%pool.length];parts=[addSource(chosen)];
  if(kind<=2){const f1=kind===0?field('新增独立分类'):pick(parts[0].filter(c=>c.variation!=='link').flatMap(c=>Object.values(c.encodings))),f2=field('新增合成测量值');
   const c={chart_id:`C${nextC++}`,variation:pick(['bar','point','single_line']),encodings:{'position.x':f1,'position.y':f2},repetition_position:[]};annotation.charts.push(c);parts.push([c]);provenance.selected_charts.push(c.chart_id);if(kind)provenance.shared_fields.push({parts:[0,1],field:f1});if(kind===2){const f=field('新增 MG 的重复分组');c.repetition_position.push(f);provenance.added_fields.push(f);}
  } else if(kind===3){const f=field('所有 MG/RMG 新增共同重复分组');wholeFields=[f];for(const c of parts[0])c.repetition_position.push(f);provenance.added_fields.push(f);}
  else if(kind===4){const parent=pick(parts[0].filter(c=>['bar','point'].includes(c.variation)&&c.encodings['position.x']&&c.encodings['position.y']));const amount=field('嵌套部分数值'),category=field('嵌套部分分类');const child={chart_id:`C${nextC++}`,variation:'pie/donut/radial_bar',encodings:{'position.theta':amount,color:category},repetition_position:uniq([...parent.repetition_position,...posOf(parent)])};annotation.charts.push(child);parts[0].push(child);nested={parent:parent.chart_id,child:child.chart_id};provenance.selected_charts=[parent.chart_id,child.chart_id];}
  else if(kind===5){const candidates=parts[0].filter(c=>c.variation!=='link'),a=pick(candidates),b=pick(candidates.filter(c=>c!==a)),f=field('两个 MG 的共同分面字段');a.repetition_position.push(f);b.repetition_position.push(f);pairFacet={charts:[a.chart_id,b.chart_id],field:f};provenance.selected_charts=pairFacet.charts;provenance.added_fields.push(f);}
  else if(kind===6){wholeFields=[field('整体外层分面'),field('整体内层分面')];for(const c of annotation.charts)c.repetition_position.push(...wholeFields);provenance.added_fields.push(...wholeFields);}
 }
 // Requested semantic changes are explicit in annotations and provenance.
 provenance.chart_changes=[];
 for(const c of annotation.charts){
  const before={variation:c.variation,encodings:clone(c.encodings)};
  if(c.variation==='normalized_stacked_bar')c.variation='stacked_bar';
  if(c.variation==='plain_area'){
   const e=c.encodings;
   if(e['position.y2']&&provenance.shared_fields.some(s=>s.field===e['position.y2']))e['position.y']=e['position.y2'];
   delete e['position.y2'];
   if(qualityRandom()<.5){c.variation='stacked_area';e.color=field('area series');c._streamgraph=qualityRandom()<.5;}
  }
  if(c.variation==='stacked_bar'&&(!c.encodings['position.x']||c.repetition_position.includes(c.encodings['position.x'])))c.encodings['position.x']=field('stack category');
  if(c.variation!==before.variation||JSON.stringify(c.encodings)!==JSON.stringify(before.encodings))provenance.chart_changes.push({chart_id:c.chart_id,before,after:{variation:c.variation,encodings:clone(c.encodings)},streamgraph:!!c._streamgraph});
 }
 // All field identities are global to the sample. Domains are shared, not independently renamed values.
 const rep=new Set(annotation.charts.flatMap(c=>c.repetition_position));
 const categoryFields=new Set();const colorFields=new Set();const textFields=new Set();const geoFields=new Map();
 for(const c of annotation.charts){const e=c.encodings,k=c.variation;
  for(const [ch,f] of Object.entries(e)){if(['color','shape','position.x_offset','position.y_offset'].includes(ch))colorFields.add(f);if(ch==='text')textFields.add(f);if(ch==='shape'||ch.endsWith('_offset')||(ch==='color'&&!['rect_heatmap','calendar_heatmap','hexbin','horizon_chart','geo_area'].includes(k)))categoryFields.add(f);}
  if(['bar','unit_bar','grouped_bar','stacked_bar','normalized_stacked_bar','rect_heatmap','calendar_heatmap','hexbin','parallel_coordinates','multi_boxplot','violin'].includes(k)&&e['position.x'])categoryFields.add(e['position.x']);
  if(['rect_heatmap','calendar_heatmap','hexbin'].includes(k)&&e['position.y'])categoryFields.add(e['position.y']);
  if(k.startsWith('geo_')){if(e['position.x'])geoFields.set(e['position.x'],'lon');if(e['position.y'])geoFields.set(e['position.y'],'lat');}
 }
 const geoCenters=geometry?.features.map(f=>geoCentroid(f))??[];
 const domains={};
 for(const {field_id:f} of annotation.data_fields){
  const count=rep.has(f)?2+Math.floor(qualityRandom()*5):categoryFields.has(f)?(colorFields.has(f)?densityProfile.colors:densityProfile.categories):densityProfile.quantitativeValues;
  domains[f]=textFields.has(f)?mockWords:geoFields.has(f)?geoCenters.map(p=>p[geoFields.get(f)==='lon'?0:1]):
   rep.has(f)||categoryFields.has(f)?Array.from({length:count},(_,i)=>i+1):Array.from({length:count},(_,i)=>Number((12+i*1.6+random()).toFixed(3)));
 }
 for(const c of annotation.charts)if(hierarchy.has(c.variation)){
  const e=c.encodings;
  if(e['position.x']&&!rep.has(e['position.x']))domains[e['position.x']]=Array.from({length:densityProfile.hierarchyNodes},(_,i)=>i+1);
  if(e['position.y']&&!rep.has(e['position.y']))domains[e['position.y']]=[0,1,2,3,4];
  if(e['position.radius']&&!rep.has(e['position.radius']))domains[e['position.radius']]=[0,1,2,3,4];
 }
 for(const c of annotation.charts)if(c.variation==='calendar_heatmap'){
  const e=c.encodings;if(!rep.has(e['position.x']))domains[e['position.x']]=[1,2,3,4,5,6,7];
  if(!rep.has(e['position.y']))domains[e['position.y']]=Array.from({length:densityProfile.calendarWeeks},(_,i)=>i+1);
 }
 for(const c of annotation.charts)if(c.variation==='horizon_chart'&&c.encodings.color)domains[c.encodings.color]=[1,2,3];
 // In the basis range annotations, position.y is the lower bound and y2 is the upper bound.
 // Resolve constraints globally so every chart sharing either field uses its same numeric domain.
 const rangeCharts=annotation.charts.filter(c=>c.variation==='plain_area'&&c.encodings['position.y2']);
 for(let pass=0;pass<rangeCharts.length+1;pass++)for(const c of rangeCharts){
  const lower=c.encodings['position.y'],upper=c.encodings['position.y2'];
  if(lower===upper)throw new Error('Area boundaries must use distinct fields');
  const minimum=Math.max(...domains[lower].map(Number))+8;
  if(Math.min(...domains[upper].map(Number))<=Math.max(...domains[lower].map(Number))){
   const old=domains[upper],offset=minimum-Math.min(...old.map(Number));
   domains[upper]=old.map(v=>Number((Number(v)+offset).toFixed(3)));
  }
 }
 for(const c of rangeCharts)if(Math.min(...domains[c.encodings['position.y2']])<=Math.max(...domains[c.encodings['position.y']]))throw new Error('Conflicting area bound constraints');
 const plan={version:1,width:1400,height:1000,datasets:[],charts:[],appearance:{showFieldLabels:false,palette:palettes[index%palettes.length],gradient:['#eff3ff','#bdd7e7','#6baed6','#3182bd','#08519c'],pointShape:'circle',fontSize:11}};
 const byId=new Map(annotation.charts.map(c=>[c.chart_id,c]));
 const cartesian=fields=>fields.reduce((acc,f)=>acc.flatMap(r=>domains[f].map(v=>({...r,[f]:v}))),[{}]);
 for(const c of annotation.charts){const e=c.encodings,k=c.variation,reps=c.repetition_position,contexts=cartesian(reps),all=fieldsOf(c),rows=[];const isParent=nested?.parent===c.chart_id;
  const base=()=>Object.fromEntries(all.map(f=>[f,pick(domains[f])]));
  const categorical=uniq(Object.entries(e).filter(([ch,f])=>ch==='text'||ch==='shape'||ch.endsWith('_offset')||ch==='color'&&categoryFields.has(f)).map(([,f])=>f));
  for(const context of contexts){const available=f=>f in context?[context[f]]:domains[f];const put=(r,extras={})=>rows.push({...base(),...r,...context,...extras,_row:String(rows.length)});
   if(hierarchy.has(k)){
    for(let i=0;i<densityProfile.hierarchyNodes;i++){const depth=Math.floor(Math.log2(i+1));const r={};
     if(e['position.x'])r[e['position.x']]=i+1;
     if(e['position.y'])r[e['position.y']]=depth;
     if(e['position.radius'])r[e['position.radius']]=depth;
     put(r,{_node:`n${i}`,_parent:i===0?'none':`n${Math.floor((i-1)/2)}`});}
   } else if(k.startsWith('geo_')){
    const count=k==='geo_area'?geometry.features.length*densityProfile.observationsPerArea:densityProfile.geoPoints;
    for(let i=0;i<count;i++){
     const feature=i%geometry.features.length;let p=geoCenters[feature];
     if(k!=='geo_area'&&i>=geometry.features.length){
      const f=geometry.features[feature],bounds=geoBounds(f);
      for(let attempt=0;attempt<200;attempt++){const candidate=[bounds[0][0]+random()*(bounds[1][0]-bounds[0][0]),bounds[0][1]+random()*(bounds[1][1]-bounds[0][1])];if(geoContains(f,candidate)){p=candidate;break;}}
     }
     put({...e['position.x']?{[e['position.x']]:p[0]}:{},...e['position.y']?{[e['position.y']]:p[1]}:{}}, {_feature:feature});
    }
   } else if(['rect_heatmap','calendar_heatmap','hexbin'].includes(k)){
    const ff=uniq([e['position.x'],e['position.y']].filter(Boolean)).filter(f=>!reps.includes(f));for(const r of cartesian(ff))put(r);
   } else if(k==='horizon_chart') {
    for(const x of available(e['position.x'])){const y=pick(available(e['position.y']));for(let b=0;b<3;b++)put({[e['position.x']]:x,[e['position.y']]:y,...e.color?{[e.color]:b+1}:{}},{_band:b,_series:b});}
   } else if(k==='parallel_coordinates') {
    for(let s=0;s<densityProfile.parallelRecords;s++)for(const x of available(e['position.x']))put({[e['position.x']]:x,...(e.color?{[e.color]:available(e.color)[s%available(e.color).length]}:{})},{_series:s});
   } else if(['multi_boxplot','single_boxplot','violin'].includes(k)){
    const xs=k==='single_boxplot'?[null]:available(e['position.x']);for(const x of xs)for(let j=0;j<densityProfile.distributionSamples;j++)put(x===null?{}:{[e['position.x']]:x});
   } else if(k==='word_cloud') {for(const word of available(e.text))put({[e.text]:word});}
   else if(k==='euler_venn'){for(const v of available(e.color))put({[e.color]:v});}
   else if(k==='link'){for(let i=0;i<densityProfile.edges;i++)put({}, {_edge:i});}
   else if(k==='pie/donut/radial_bar'&&!e['position.radius']){for(const v of e.color?available(e.color):[1,2,3])put(e.color?{[e.color]:v}:{});}
   else if(['point','connected_scatterplot','dotplot','tick_plot','contour'].includes(k)){
    const count=isParent?densityProfile.nestedAnchors:k==='contour'?densityProfile.contourPoints:densityProfile.points;
    for(let i=0;i<count;i++) {const r={};for(const ch of ['position.x','position.y'])if(e[ch]){const d=available(e[ch]);r[e[ch]]=d[(ch.endsWith('y')?i*17+Math.floor(i/d.length):i)%d.length];}if(k==='contour'){
      const cluster=i%3,normal=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,qualityRandom())))*Math.cos(2*Math.PI*qualityRandom());
      for(const [ci,ch] of ['position.x','position.y'].entries())if(e[ch]){const d=available(e[ch]);const center=(ci===0?[.25,.72,.5]:[.3,.38,.76])[cluster];r[e[ch]]=d[Math.max(0,Math.min(d.length-1,Math.round((center+normal()*.085)*(d.length-1))))];}
      if(e.color)r[e.color]=available(e.color)[cluster%available(e.color).length];
     }put(r);}
   } else {
    const axis=e['position.theta']??e['position.x']??e['position.y'];const xs=axis?available(axis):[1,2,3];
    const series=['grouped_bar','stacked_bar','normalized_stacked_bar','stacked_area','multi_line','multi_radar'].includes(k)?densityProfile.colors:1;
    for(let j=0;j<series;j++)for(const [xi,x] of xs.entries()){const r=axis?{[axis]:x}:{};for(const f of categorical)if(f!==axis)r[f]=available(f)[(series>1?j:xi)%available(f).length];if(['single_line','multi_line','plain_area','stacked_area','radial_area'].includes(k)){
      for(const ch of ['position.y','position.radius'])if(e[ch]&&e[ch]!==axis&&!reps.includes(e[ch])){const d=available(e[ch]);const t=xi/Math.max(1,xs.length-1);r[e[ch]]=d[Math.round(trendFraction(t,(index+j)%4,j*.4)*(d.length-1))];}
     }put(r,{_series:j});}
   }
  }
  // Ambiguous coincident points cannot be nested anchors. Keep the same MG but use unique anchor tuples.
  const finalRows=isParent?[...new Map(rows.map(r=>[JSON.stringify([...reps,...posOf(c)].map(f=>r[f])),r])).values()]:rows;
  const extra=uniq(finalRows.flatMap(r=>Object.keys(r))).filter(f=>!all.includes(f));
  const ds={id:`table_${c.chart_id}`,columns:[...all.map(f=>({name:f,type:textFields.has(f)?'nominal':'quantitative'})),...extra.map(name=>({name,type:'nominal'}))],rows:finalRows,primaryKey:['_row']};
  plan.datasets.push(ds);plan.charts.push({id:c.chart_id,datasetId:ds.id,basis:{categoricalFields:[...categoryFields],repetitionFields:reps,donut:index%2===1,...(k.startsWith('geo_')?{geometry}:{}),densityProfile:densityProfile.name,streamgraph:!!c._streamgraph,...(k==='plain_area'?{areaBounds:e['position.y2']?{lower:e['position.y'],upper:e['position.y2']}:{lowerConstant:0,upper:e['position.y']}}:{}),source:'synthetic reconstruction'}});
 }
 // Materialize edge endpoints as real chart-row keys, matching SVG anchor references.
 for(const c of annotation.charts.filter(c=>c.variation==='link')){
  const ds=plan.datasets.find(d=>d.id===`table_${c.chart_id}`),e=c.encodings;
  const targets=c.link_targets.map(id=>({id,rows:plan.datasets.find(d=>d.id===`table_${id}`).rows}));
  for(const [i,r] of ds.rows.entries()){
   const available=t=>({...t,rows:t.rows.filter(row=>c.repetition_position.every(f=>row[f]===undefined||String(row[f])===String(r[f])))});
   const source=available(targets[0]),target=available(targets.length>1?targets[1+i%(targets.length-1)]:targets[0]);
   if(!source.rows.length||!target.rows.length)throw new Error('Link has no endpoints in its repetition context');
   if(e.source)r[e.source]=`${source.id}:${source.rows[i%source.rows.length]._row}`;
   if(e.target)r[e.target]=`${target.id}:${target.rows[(i+1)%target.rows.length]._row}`;
  }
  for(const channel of ['source','target'])if(e[channel]){ds.columns.find(f=>f.name===e[channel]).type='nominal';domains[e[channel]]=uniq(ds.rows.map(r=>r[e[channel]]));}
 }
 for(const c of annotation.charts)delete c._streamgraph;
 function facets(c,child,exclude=[]){let n=child;for(const f of [...c.repetition_position].filter(f=>!exclude.includes(f)).reverse())n={type:'facet',datasetId:`table_${c.chart_id}`,field:f,...facetLayout(domains[f].length,qualityRandom),gap:24,child:n};return n;}
 function composePart(charts){const nodes=[],links=[];for(const c of charts){if(nested?.child===c.chart_id)continue;
   let n=c.chart_id,exclude=wholeFields;
   if(nested?.parent===c.chart_id)n={type:'nested',parent:c.chart_id,parentVisible:true,child:nested.child,size:48,offsetY:-32,childAxes:false};
   n=facets(c,n,exclude);(c.variation==='link'?links:nodes).push(n);
  }
  let root=grid(nodes,domains);if(links.length)root={type:'linked',child:root,links};return root;
 }
 plan.composition=grid(parts.map(composePart),domains);
 if(wholeFields.length)for(const f of [...wholeFields].reverse())plan.composition={type:'facet',field:f,datasetId:plan.datasets[0].id,...facetLayout(domains[f].length,qualityRandom),child:plan.composition};
 const originalComposition=clone(plan.composition);
 function compact(node,leaf){
  if(typeof node==='string'||node.type==='chart')return;
  const factor=leaf[0]/340;
  if(node.type==='facet'){
   compact(node.child,leaf);
   if(leaf[0]<=128){const [w,h]=natural(node.child,domains,leaf),count=domains[node.field].length;node.columns=Math.min(count,Math.max(1,Math.round(Math.sqrt(count*h/w))));node.flow='row';node.budgetReflow=true;}
   node.gap=Math.max(4,Math.round(24*factor));node.labelHeight=Math.max(12,Math.round(24*factor));
  } else if(node.type==='concat'){
   node.children.forEach(n=>compact(n,leaf));node.gap=Math.max(4,Math.round(28*factor));
   node.weights=node.children.map(n=>natural(n,domains,leaf)[node.direction==='horizontal'?0:1]);
  } else if(node.type==='linked'){compact(node.child,leaf);node.links.forEach(n=>compact(n,leaf));}
  else if(node.type==='nested'){compact(node.parent,leaf);compact(node.child,leaf);}
 }
 for(const leaf of [[340,260],[300,230],[260,200],[220,170],[180,140],[150,120],[128,104],[112,92],[100,80],[80,64]]){
  plan.composition=clone(originalComposition);
  if(leaf[0]<340)compact(plan.composition,leaf);
  const [width,height]=natural(plan.composition,domains,leaf);
  plan.width=Math.ceil(width+48);plan.height=Math.ceil(height+48);
  if(plan.width<=16000&&plan.height<=16000&&plan.width*plan.height<=60000000){
   if(leaf[0]<340){plan.appearance.fontSize=Math.max(8,Math.round(11*leaf[0]/340));provenance.compact_leaf_size=leaf;}
   break;
  }
 }
 if(plan.width>16000||plan.height>16000||plan.width*plan.height>60000000)throw new Error(`Dense composition ${annotation.sample_id} exceeds render budget: ${plan.width}x${plan.height}`);
 annotation.image_observation=`${expansionLabels[kind]}。保留来源 MG 的编码与重复字段，并按构造计划加入扩展。所有数值为合成数据；布局是依据标注构造的新布局。共享字段使用同一字段 ID 和数值域，repetition_position 只标重复位置。`;
 provenance.parts=parts.map(p=>p.map(c=>c.chart_id));provenance.nested=nested;provenance.field_domains=domains;provenance.row_counts=Object.fromEntries(plan.datasets.map(d=>[d.id,d.rows.length]));
 enrichVenn({annotation,plan,provenance});
 layerGeographicViews({annotation,plan,provenance});
 landscapeStackedAreas({annotation,plan,provenance});
 orientParallelCharts({annotation,plan,provenance},()=>qualityRandom()<.5?'horizontal':'vertical');
 if(varyParallelGeometry({annotation,plan,provenance}).length)reflowParallelGeometry({annotation,plan,provenance});
 varyBarDirections({annotation,plan,provenance},()=>qualityRandom()<.5?'horizontal':'vertical');
 refinePositionRelations({annotation,plan,provenance});
 if(annotation.charts.some(c=>c.variation==='link')){
  const job={annotation,plan,provenance};
  applyListLinks(job,{enabled:listCandidates(job).length>=2,orientation:qualityRandom()<.5?'left-right':'top-bottom'});
 }
 const scene=compileTarget(annotation,plan);
 return {annotation,plan,scene,provenance};
}
