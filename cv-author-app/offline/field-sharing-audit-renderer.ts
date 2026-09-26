// Diagnostic-only entry. It never writes or alters a dataset.
import {renderBasis} from './basis-renderer';
import {renderNested} from './nested-renderer';
import './renderer';

function fingerprint(svg:string){
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
 const attrs=['d','x','y','x1','x2','y1','y2','cx','cy','r','width','height','points','transform','fill','stroke','stroke-width','opacity','fill-opacity','stroke-opacity','font-size'];
 const marks=[...doc.querySelectorAll('path,rect,circle,line,polygon,polyline,text')].filter(e=>!e.closest('.tick')&&!e.classList.contains('domain'));
 return JSON.stringify(marks.map(e=>({tag:e.tagName,attributes:Object.fromEntries(attrs.filter(a=>e.hasAttribute(a)).map(a=>[a,e.getAttribute(a)])),...(e.tagName==='text'?{text:e.textContent}:{})})));
}
function isolate(scene:any,id:string,mutation?:any){
 scene=structuredClone(scene);
 const chart=scene.charts.find((c:any)=>c.id===id),s=chart.spec,table=scene.datasets.find((d:any)=>d.id===s.datasetId),cfg=s.offlineOptions;
 const first=table.rows[0],reps=s.offlineRepetition??cfg.repetitionFields??[];
 const filters=Object.fromEntries(reps.map((f:string)=>[f,first[f]]));
 if(mutation){
  const {channel,mode}=mutation,field=s.encodings[channel].field,alias='_audit_value';
  const domain=[...new Set(table.rows.map((r:any)=>r[field]))].sort((a:any,b:any)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
  table.columns.push({name:alias,type:table.columns.find((c:any)=>c.name===field).type});
  for(const row of table.rows){const i=domain.indexOf(row[field]);row[alias]=mode===2?domain[Math.floor(i/2)]:mode===0?domain[(i+1)%domain.length]:domain[(domain.length-1-i+domain.length)%domain.length];}
  s.encodings[channel].field=alias;
  if(cfg.categoricalFields?.includes(field))cfg.categoricalFields.push(alias);
  if(s.offlineVariation==='parallel_coordinates'){
   const dim=cfg.axisOrientation==='horizontal'?'y':'x';
   if(channel===dim)cfg.parallelDimension=alias;else if(channel===(dim==='x'?'y':'x'))cfg.parallelValue=alias;
  }
  if(cfg.areaBounds){if(channel==='y')cfg.areaBounds[s.encodings.y2?'lower':'upper']=alias;if(channel==='y2')cfg.areaBounds.upper=alias;}
 }
 if(s.chartType==='OfflineNestedIdiom'){
  for(const t of scene.datasets)t.rows=t.rows.filter((r:any)=>Object.entries(filters).every(([f,v])=>r[f]===undefined||String(r[f])===String(v)));
  scene.width=560;scene.height=400;scene.composition=id;
  return renderNested(scene);
 }
 const targets=scene.charts.filter((c:any)=>c.spec.offlineVariation!=='link').map((c:any,i:number)=>({chart:c.id,frame:{x:30+i*120,y:70+(i%2)*90,width:100,height:70},filters,rows:scene.datasets.find((d:any)=>d.id===c.spec.datasetId).rows}));
 return `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="400">${renderBasis(chart,scene.datasets,{x:0,y:0,width:560,height:400},filters,scene.appearance,{axes:false,targetUnits:targets}).content}</svg>`;
}
(window as any).fieldSharingAudit={isolate,fingerprint};
