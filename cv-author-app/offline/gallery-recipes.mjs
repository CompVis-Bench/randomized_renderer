import {readFileSync} from 'node:fs';
import {geoArea, geoBounds, geoContains} from 'd3';
const geometry=JSON.parse(readFileSync(new URL('./assets/manhattan.geojson',import.meta.url),'utf8'));
const t=(chart_id,variation,encodings,repetition_position=[],extra={})=>({chart_id,variation,encodings,repetition_position,...extra});
const xy=(x,y)=>({'position.x':x,'position.y':y});
export const galleryTargets={
  'dendrogram-nested-bars':{level:9,charts:[t('C1','tree',xy('F1','F2'),['F7']),t('C2','bar',{...xy('F3','F4'),color:'F3'},['F7','F1','F2'])]},
  'treemap-area-facet':{level:8,charts:[t('C1','treemap',{size:'F3',color:'F4'},['F5']),t('C2','stacked_area',{...xy('F6','F7'),color:'F4'},['F5'])]},
  'network-matrix-facet':{level:9,charts:[t('C1','point',{color:'F2',size:'F3'},['F5']),t('C2','link',{},['F5'],{link_targets:['C1']}),t('C3','rect_heatmap',{...xy('F1','F4'),color:'F6'},['F5'])]},
  'parallel-stacked-facet':{level:8,charts:[t('C1','parallel_coordinates',{...xy('F1','F2'),color:'F3'},['F4']),t('C2','stacked_bar',{...xy('F1','F5'),color:'F3'},['F4'])]},
  'stacked-time-dashboard':{level:8,charts:[t('C1','bar',xy('F1','F2')),t('C2','stacked_area',{...xy('F1','F3'),color:'F4'},['F5']),t('C3','stacked_bar',{...xy('F1','F3'),color:'F4'},['F5'])]},
  'topic-hierarchy-dashboard':{level:9,charts:[t('C1','sunburst',{'position.theta':'F1','position.radius':'F2',color:'F3'},['F4']),t('C2','point',{...xy('F5','F6'),color:'F3'},['F4']),t('C3','stacked_bar',{...xy('F7','F8'),color:'F3'},['F4'])]},
  'stacked-matrix-facet':{level:9,charts:[t('C1','stacked_bar',{...xy('F1','F2'),color:'F3'},['F4','F5']),t('C2','single_line',xy('F1','F6'),['F4','F5'])]},
  'geo-statistical-dashboard':{level:9,charts:[t('C1','geo_area',{color:'F1'}),t('C2','geo_point',{...xy('F2','F3'),color:'F4',size:'F5'}),t('C3','stacked_bar',{...xy('F6','F7'),color:'F4'}),t('C4','point',{...xy('F5','F8'),color:'F4'})]},
};
export function buildGalleryRecipe(name,variant,seed,appearance,random){
  const integer=(lo,hi)=>Math.floor(random()*(hi-lo+1))+lo;
  const plan={version:1,width:1600,height:1100,datasets:[],charts:[],appearance:{...appearance,fontSize:12,pieLabels:true}};
  const fields={},types={};
  const f=(id,type,role)=>{fields[id]=role;types[id]=type;};
  const table=(id,names,rows,key=[])=>{const d={id,columns:names.map(name=>({name,type:types[name]??'nominal'})),rows,primaryKey:key};plan.datasets.push(d);return d;};
  const chart=(id,datasetId,config={})=>{const c={id,datasetId,...config};plan.charts.push(c);return c;};
  const concat=(direction,children,gap=24)=>({type:'concat',direction,children,gap});
  const facet=(datasetId,field,child,columns=2)=>({type:'facet',datasetId,field,child,columns,gap:32});
  const hierarchy=(prefix,extra={})=>Array.from({length:variant%2?15:7},(_,i)=>({F1:`${prefix}${i}`,F2:Math.floor(Math.log2(i+1)),_parent:i?`${prefix}${Math.floor((i-1)/2)}`:'',...extra}));
  let observation='';
  if(name==='dendrogram-nested-bars'){
    f('F1','nominal','hierarchy_node_order_identity');f('F2','quantitative','hierarchy_depth');f('F3','nominal','node_profile_category');f('F4','quantitative','node_profile_amount');f('F7','nominal','classifier_panel');
    const nodes=['Model A','Model B'].flatMap((F7,i)=>hierarchy(`M${i}-`,{F7}));
    table('tree',['F1','F2','_parent','F7'],nodes,['F1']);
    table('profiles',['F1','F2','F3','F4','F7'],nodes.flatMap(n=>['A','B','C'].map(F3=>({F1:n.F1,F2:n.F2,F7:n.F7,F3,F4:integer(10,80)}))),['F1','F3']);
    chart('C1','tree',{hierarchy:{key:'F1',parent:'_parent',depth:'F2'}});chart('C2','profiles');
    plan.width=1900;plan.height=1000;
    plan.composition=facet('tree','F7',{type:'nested',parent:'C1',parentVisible:true,child:'C2',width:variant%2?84:130,height:variant%2?76:100,offsetY:0,childAxes:false});
    observation='参考 basis 树节点小柱及 Gallery Dendrogram Profiles。两个模型分面内，以原生 Dendrogram 节点为实际锚点放置三类柱图。F1 表示按层级排序的节点身份，F2 为显式验证的树深度；子图继承 F1/F2/F7。';
  }else if(name==='treemap-area-facet'){
    f('F3','quantitative','leaf_area_weight');f('F4','nominal','shared_branch_category');f('F5','nominal','scenario');f('F6','ordinal','month');f('F7','quantitative','monthly_category_amount');
    const nodes=[],series=[];
    for(const F5 of ['Before','After']){
      nodes.push({_id:F5,_parent:'',F3:0,F4:'Group A',F5});
      for(let j=0;j<3;j++){
        const F4=`Group ${String.fromCharCode(65+j)}`,branch=`${F5}-${j}`;
        nodes.push({_id:branch,_parent:F5,F3:0,F4,F5});
        for(let k=0;k<4;k++)nodes.push({_id:`${branch}-${k}`,_parent:branch,F3:integer(12,95),F4,F5});
        for(let m=1;m<=12;m++)series.push({F4,F5,F6:`M${String(m).padStart(2,'0')}`,F7:integer(10,40)+Math.round(15*Math.sin(m/3+j)+20)});
      }
    }
    table('hierarchy',['_id','_parent','F3','F4','F5'],nodes,['_id']);table('series',['F4','F5','F6','F7'],series,['F5','F6','F4']);
    chart('C1','hierarchy',{hierarchy:{key:'_id',parent:'_parent'},tile:variant%2?'squarify':'binary'});chart('C2','series');
    plan.composition=facet('hierarchy','F5',concat('vertical',['C1','C2']));
    observation='每个情景中，上方 Treemap 表示叶节点面积，下方 Stacked Area 表示同一类别的月度数量。两模板仅由情景 F5 重复；面积 F3 与时间序列 F7 是独立量。';
  }else if(name==='network-matrix-facet'){
    f('F1','nominal','source_node_identity');f('F2','nominal','community');f('F3','quantitative','node_size');f('F4','nominal','target_node_identity');f('F5','nominal','network_panel');f('F6','quantitative','edge_weight');
    const nodes=[],edges=[],matrix=[];
    for(const [p,F5] of ['Period A','Period B'].entries()){
      const ns=Array.from({length:12},(_,i)=>({F1:`P${p}N${i+1}`,F2:['Red','Blue','Green'][i%3],F3:integer(15,100),F5}));nodes.push(...ns);
      for(let i=0;i<ns.length;i++) for(let j=i+1;j<ns.length;j++) if(j===i+1||random()<.22)edges.push({_source:ns[i].F1,_target:ns[j].F1,F6:integer(1,9)});
      for(const a of ns)for(const b of ns){const edge=edges.find(e=>(e._source===a.F1&&e._target===b.F1)||(e._source===b.F1&&e._target===a.F1));matrix.push({F1:a.F1,F4:b.F1,F5,F6:edge?.F6??0});}
    }
    table('nodes',['F1','F2','F3','F5'],nodes,['F1']);table('edges',['_source','_target','F6'],edges,['_source','_target']);table('matrix',['F1','F4','F5','F6'],matrix,['F1','F4']);
    chart('C1','nodes',{chartType:'ForceDirectedGraph',graph:{key:'F1',edges:'edges',source:'_source',target:'_target'}});
    chart('C2','nodes',{nodeChart:'C1'});chart('C3','matrix');
    plan.width=1800;plan.height=1100;plan.composition=facet('nodes','F5',concat('vertical',[{type:'network',nodes:'C1',links:'C2'},'C3']));
    observation='借鉴 Gallery Matrix Network：两个时期分别显示原生力导网络与对应邻接矩阵。力布局不是两个额外数据字段；节点只标 color/size，独立 link 指向 C1，二者仅继承时期 F5。矩阵数值与边表相同，网络线宽固定，不暗示未标注的边权编码。';
  }else if(name==='parallel-stacked-facet'){
    f('F1','nominal','measurement_dimension');f('F2','quantitative','record_value_on_dimension');f('F3','nominal','cohort');f('F4','nominal','scenario');f('F5','quantitative','cohort_sum_on_dimension');
    const rows=[],summary=[];
    for(const F4 of ['Baseline','Follow-up']){
      for(let i=0;i<18;i++)for(const F1 of ['Speed','Quality','Capacity','Efficiency','Recovery'])rows.push({_record:`${F4}-${i}`,F1,F2:integer(15,95),F3:['A','B','C'][i%3],F4});
      for(const F1 of ['Speed','Quality','Capacity','Efficiency','Recovery'])for(const F3 of ['A','B','C'])summary.push({F1,F3,F4,F5:rows.filter(r=>r.F1===F1&&r.F3===F3&&r.F4===F4).reduce((s,r)=>s+r.F2,0)});
    }
    table('records',['_record','F1','F2','F3','F4'],rows,['_record','F1']);table('summary',['F1','F3','F4','F5'],summary,['F1','F3','F4']);
    chart('C1','records',{recordKey:'_record'});chart('C2','summary');
    plan.composition=facet('records','F4',concat('vertical',['C1','C2']));
    observation='平行坐标的维度名 F1 和维度值 F2 先以长表显式定义，再透视为原生平行坐标的五个轴。同组颜色 F3 与下方堆叠柱一致；柱高 F5 是组内 F2 求和。两个模板继承情景 F4。';
  }else if(name==='stacked-time-dashboard'){
    f('F1','ordinal','time_bin');f('F2','quantitative','overall_count');f('F3','quantitative','metric_series_amount');f('F4','nominal','series_category');f('F5','nominal','metric_panel');
    const rows=[];
    for(const F5 of ['Volume','Latency','Throughput'])for(let i=1;i<=24;i++)for(let c=0;c<3;c++)rows.push({F1:String(i).padStart(2,'0'),F3:integer(8,30)+Math.round(18*(Math.sin(i/4+c)+1)),F4:['A','B','C'][c],F5});
    table('series',['F1','F3','F4','F5'],rows,['F1','F4','F5']);
    table('totals',['F1','F2'],Array.from({length:24},(_,i)=>({F1:String(i+1).padStart(2,'0'),F2:integer(40,150)})),['F1']);
    chart('C1','totals');chart('C2','series');chart('C3','series');
    plan.height=1700;plan.composition=concat('vertical',['C1',facet('series','F5',concat('horizontal',['C2','C3']),1)]);
    // More room for three metric rows than the overview.
    plan.composition.weights=[1,3];
    observation='参考时间概览加指标行的结构。顶部总计柱图不重复；下方每个指标行同时含 Stacked Area 和 Stacked Bar，共享时间 F1、数量 F3、系列 F4，并继承 F5。这里生成的是堆叠面积，不将参考图中的 Horizon 标签误用。';
  }else if(name==='topic-hierarchy-dashboard'){
    f('F1','quantitative','hierarchy_leaf_mass');f('F2','quantitative','hierarchy_depth');f('F3','nominal','shared_category');f('F4','nominal','topic');f('F5','quantitative','percentage');f('F6','quantitative','probability');f('F7','ordinal','time_bin');f('F8','quantitative','category_count');
    const nodes=[],points=[],bars=[];
    for(const [p,F4] of ['Topic A','Topic B','Topic C'].entries()){
      nodes.push({_id:`T${p}`,_parent:'',F1:0,F2:0,F3:'A',F4});
      for(let j=0;j<3;j++){
        const F3=['A','B','C'][j],branch=`T${p}-${j}`;nodes.push({_id:branch,_parent:`T${p}`,F1:0,F2:1,F3,F4});
        for(let k=0;k<4;k++)nodes.push({_id:`${branch}-${k}`,_parent:branch,F1:integer(5,40),F2:2,F3,F4});
        for(let k=0;k<10;k++)points.push({F3,F4,F5:integer(1,99),F6:integer(1,99)/100});
        for(let k=1;k<=6;k++)bars.push({F3,F4,F7:`M${k}`,F8:integer(10,65)});
      }
    }
    table('hierarchy',['_id','_parent','F1','F2','F3','F4'],nodes,['_id']);table('points',['F3','F4','F5','F6'],points);table('bars',['F3','F4','F7','F8'],bars,['F3','F4','F7']);
    chart('C1','hierarchy',{hierarchy:{key:'_id',parent:'_parent',depth:'F2'}});chart('C2','points');chart('C3','bars');
    plan.width=1800;plan.height=1450;plan.composition=facet('hierarchy','F4',concat('vertical',['C1','C2','C3']),3);
    observation='参考三主题列：每列为 Sunburst、散点、堆叠柱。三个独立模板都继承主题 F4，颜色共享类别 F3。Sunburst 的角度来自叶质量 F1，半径层级来自已验证树深度 F2。';
  }else if(name==='stacked-matrix-facet'){
    f('F1','ordinal','attribute_bin');f('F2','quantitative','class_count');f('F3','nominal','predicted_class');f('F4','nominal','subgroup');f('F5','nominal','attribute');f('F6','quantitative','diagnostic_curve_value');
    const rows=[],lines=[];
    for(const F4 of ['Group I','Group II'])for(const F5 of ['Score','Age','Cost'])for(let i=1;i<=8;i++){
      const F1=String(i);for(const F3 of ['Positive','Negative'])rows.push({F1,F2:integer(10,80),F3,F4,F5});lines.push({F1,F4,F5,F6:integer(10,70)});
    }
    table('bars',['F1','F2','F3','F4','F5'],rows,['F1','F3','F4','F5']);table('lines',['F1','F4','F5','F6'],lines,['F1','F4','F5']);
    chart('C1','bars');chart('C2','lines');
    plan.width=1900;plan.height=1300;plan.composition=facet('bars','F4',facet('bars','F5',concat('vertical',['C1','C2'],8),3),1);
    observation='参考表格式多属性诊断图：子组行与属性列构成两层 Facet。每格是堆叠柱加独立诊断折线；两模板共同继承 F4/F5，类别仅作为柱图内部 color。';
  }else if(name==='geo-statistical-dashboard'){
    f('F1','quantitative','ZIP_intensity');f('F2','quantitative','longitude');f('F3','quantitative','latitude');f('F4','nominal','selection_class');f('F5','quantitative','event_amount');f('F6','ordinal','event_amount_bin');f('F7','quantitative','event_count');f('F8','quantitative','response_time');
    const areas=geometry.features.map(g=>({_zip:g.properties.id,F1:integer(10,100)}));
    const points=[];
    for(const feature of geometry.features){
      const normalized=structuredClone(feature);if(geoArea(normalized)>2*Math.PI){const polys=normalized.geometry.type==='Polygon'?[normalized.geometry.coordinates]:normalized.geometry.coordinates;polys.forEach(p=>p.forEach(r=>r.reverse()));}
      const [[west,south],[east,north]]=geoBounds(normalized);
      for(let i=0;i<3;i++){
        let position;
        for(let attempt=0;attempt<10000;attempt++){
          const candidate=[west+random()*(east-west),south+random()*(north-south)];
          if(geoContains(normalized,candidate)){position=candidate;break;}
        }
        if(!position)throw new Error('Unable to sample a point within ZIP geometry');
        points.push({_zip:feature.properties.id,F2:position[0],F3:position[1],F4:i%2?'Selected':'Other',F5:integer(5,95),F8:integer(5,95)});
      }
    }
    table('areas',['_zip','F1'],areas,['_zip']);table('events',['_zip','F2','F3','F4','F5','F8'],points);
    const bins=[];for(let k=0;k<5;k++)for(const F4 of ['Other','Selected'])bins.push({F6:`${k*20}-${k*20+19}`,F4,F7:points.filter(p=>p.F4===F4&&Math.floor(p.F5/20)===k).length});
    table('histogram',['F6','F4','F7'],bins,['F6','F4']);
    const geo={geometry,bounds:[-74.025,40.695,-73.90,40.88],key:'_zip'};
    chart('C1','areas',{geo});chart('C2','events',{geo});chart('C3','histogram');chart('C4','events');
    plan.width=1700;plan.height=1250;plan.composition=concat('horizontal',[{type:'layer',children:['C1','C2']},concat('vertical',['C3','C4'])]);
    observation='地图使用 Gallery 中保留原坐标的 Manhattan ZIP GeoJSON 子集；数量与事件均为合成数据，不代表真实观测。geo_area 的颜色 F1 与 geo_point 的颜色 F4 独立。地图与统计图共享类别 F4、事件量 F5；F7 是按 F6 分箱的事件数。离线 Mercator 适配不调用 Mapbox/deck.gl。';
  } else throw new Error(`Unknown Gallery-inspired recipe ${name}`);
  return {level:galleryTargets[name].level,plan,annotation:{schema_version:'chart_encoding_variation_only_v3',sample_id:`synthetic-${name}-${variant}`,charts:structuredClone(galleryTargets[name].charts),data_fields:Object.entries(fields).map(([field_id,image_role])=>({field_id,image_role})),image_observation:observation}};
}
