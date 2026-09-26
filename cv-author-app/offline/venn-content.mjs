// Synthetic set members are materialized in the plan, including exact membership.
// Ellipse area and member counts are illustrative, not quantitative encodings.
export const vennModes=['words','icons','mixed'];
export const vennLayouts=['overlap','chain','containment'];
const words=['Birch','Fern','Cedar','Moss','Willow','Iris','Maple','Reed','Clover','Pine','Sage','Aster','Elm','Lily','Oak','Rush','Ash','Rose'];
export function vennSeed(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export function memberships(sets,x,y){return sets.filter(s=>((x-s.x)/s.rx)**2+((y-s.y)/s.ry)**2<=1).map(s=>String(s.value)).sort();}
export function boxMemberships(sets,x,y,hw,hh){
 const result=[];for(const s of sets){const far=((Math.abs(x-s.x)+hw)/s.rx)**2+((Math.abs(y-s.y)+hh)/s.ry)**2,near=(Math.max(0,Math.abs(x-s.x)-hw)/s.rx)**2+(Math.max(0,Math.abs(y-s.y)-hh)/s.ry)**2;
  if(far<=1)result.push(String(s.value));else if(near<=1)return null;
 }return result.sort();
}
export function makeVennContext(values,seed,mode,layout){
 const rand=random(seed),panels=[];
 for(let offset=0;offset<values.length;offset+=3){
  const vs=values.slice(offset,offset+3),n=vs.length,style=layout??vennLayouts[Math.floor(rand()*3)];
  const positions=n===1?[[.5,.5,.4,.4]]:style==='containment'?[[.5,.5,.44,.43],[.44,.49,.29,.28],[.55,.54,.15,.17]]:style==='chain'?[[.27,.47,.23,.34],[.5,.52,.25,.38],[.75,.48,.20,.30]]:[[.36,.40,.30,.32],[.65,.42,.29,.34],[.51,.66,.31,.28]];
  const sets=vs.map((value,i)=>{const [x,y,rx,ry]=positions[i];return {value:String(value),x:x+(rand()-.5)*.025,y:y+(rand()-.5)*.025,rx:rx*(.94+rand()*.1),ry:ry*(.94+rand()*.1)};});
  const items=[],labels=sets.map(s=>({x:s.x,y:s.y-s.ry+.065}));
  for(let tries=0;tries<6000&&items.length<14;tries++){
   const x=.065+rand()*.87,y=.075+rand()*.85,index=items.length,kind=mode==='mixed'?(index%2?'icon':'word'):mode==='icons'?'icon':'word';
   const label=words[(index+offset+seed%words.length)%words.length],halfWidth=kind==='word'?.0125*label.length+.010:.032,halfHeight=.038;
   const members=boxMemberships(sets,x,y,halfWidth,halfHeight);if(!members?.length)continue;
   if(labels.some(p=>Math.abs(x-p.x)<halfWidth+.07&&Math.abs(y-p.y)<.072))continue;
   if(items.some(p=>Math.abs(x-p.x)<halfWidth+p.halfWidth+.025&&Math.abs(y-p.y)<.10))continue;
   items.push({id:`member-${offset+1}-${index+1}`,label,icon:['leaf','person','star','diamond','heart'][(index+seed)%5],kind,x,y,halfWidth,halfHeight,members});
  }
  panels.push({layout:style,sets,items});
 }
 return {panels};
}
export function enrichVenn(job,choices={}){
 const changes=[];
 for(const c of job.annotation.charts.filter(c=>c.variation==='euler_venn')){
  const cfg=job.plan.charts.find(d=>d.id===c.chart_id),table=job.plan.datasets.find(d=>d.id===cfg.datasetId),field=c.encodings.color;
  if(!cfg.basis||!field)throw new Error('Euler/Venn requires an explicit color binding');
  const seed=vennSeed(`${job.annotation.sample_id}/${c.chart_id}`),mode=choices.mode??vennModes[seed%3],layout=choices.layout??vennLayouts[Math.floor(seed/3)%3];
  const contexts=new Map();for(const row of table.rows){const filters=Object.fromEntries(c.repetition_position.map(f=>[f,String(row[f])])),key=JSON.stringify(filters);if(!contexts.has(key))contexts.set(key,{filters,values:[]});const entry=contexts.get(key);if(!entry.values.includes(String(row[field])))entry.values.push(String(row[field]));}
  cfg.basis.venn={version:1,mode,layout,seed,semantics:'Synthetic illustrative set members; color encodes set identity. Ellipse area and item count do not encode a quantity. Labels and icons identify members, not additional encoding channels.',contexts:[...contexts.values()].map(({filters,values})=>({filters,...makeVennContext(values,vennSeed(`${seed}:${JSON.stringify(filters)}`),mode,layout)}))};
  changes.push({chart:c.chart_id,mode,layout,contexts:contexts.size,sets:cfg.basis.venn.contexts.reduce((n,x)=>n+x.panels.reduce((m,p)=>m+p.sets.length,0),0)});
 }
 if(changes.length){job.provenance??={};job.provenance.venn_revision={version:1,changes};}
 return changes;
}
export function validateVenn(config,rows,field,repetitions){
 if(!config)return;const fail=()=>{throw new Error('Invalid Euler/Venn membership or context');};
 if(config.version!==1||!vennModes.includes(config.mode)||!Array.isArray(config.contexts))fail();
 const expected=new Map();for(const row of rows){const key=JSON.stringify(repetitions.map(f=>String(row[f])));if(!expected.has(key))expected.set(key,new Set());expected.get(key).add(String(row[field]));}
 const seen=new Set();for(const ctx of config.contexts){const key=JSON.stringify(repetitions.map(f=>String(ctx.filters[f])));if(seen.has(key)||!expected.has(key)||Object.keys(ctx.filters).length!==repetitions.length)fail();seen.add(key);
  const values=ctx.panels.flatMap(p=>p.sets.map(s=>String(s.value)));if(values.length!==new Set(values).size||JSON.stringify([...values].sort())!==JSON.stringify([...expected.get(key)].sort()))fail();
  for(const panel of ctx.panels){if(!panel.items.length)fail();for(const s of panel.sets)if(![s.x,s.y,s.rx,s.ry].every(Number.isFinite)||s.rx<=0||s.ry<=0||s.x-s.rx<0||s.y-s.ry<0||s.x+s.rx>1||s.y+s.ry>1)fail();
   for(const item of panel.items){if(!['word','icon'].includes(item.kind)||typeof item.label!=='string'||!['leaf','person','star','diamond','heart'].includes(item.icon)||![item.x,item.y,item.halfWidth,item.halfHeight].every(Number.isFinite)||item.halfWidth<=0||item.halfHeight<=0)fail();
    if(!item.members.length||JSON.stringify(boxMemberships(panel.sets,item.x,item.y,item.halfWidth,item.halfHeight))!==JSON.stringify([...item.members].sort()))fail();
   }
  }
 }if(seen.size!==expected.size)fail();
}
