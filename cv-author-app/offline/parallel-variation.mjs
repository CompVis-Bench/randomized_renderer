import {vennSeed} from './venn-content.mjs';
// The axis domain is an explicit view subset, not a field identity rename.
// Existing rows remain intact; two-axis sources gain one synthetic dimension.
export function varyParallelGeometry(job,chooseStyle){
 const changes=[];
 for(const c of job.annotation.charts.filter(c=>c.variation==='parallel_coordinates')){
  const cfg=job.plan.charts.find(d=>d.id===c.chart_id),o=cfg.basis;if(!o)continue;
  const table=job.plan.datasets.find(t=>t.id===cfg.datasetId),dimension=o.parallelDimension??c.encodings[o.axisOrientation==='horizontal'?'position.y':'position.x'],value=o.parallelValue??c.encodings[o.axisOrientation==='horizontal'?'position.x':'position.y'];
  const seed=vennSeed(`${job.annotation.sample_id}/${c.chart_id}/parallel-v2`),sort=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true});
  let dims=[...new Set(table.rows.map(r=>String(r[dimension])))].sort(sort),added=[];
  if(dims.length<3){
   const contexts=new Map();for(const row of table.rows){const key=JSON.stringify(c.repetition_position.map(f=>row[f]));if(!contexts.has(key))contexts.set(key,[]);contexts.get(key).push(row);}
   while(dims.length<3){const name=table.columns.find(t=>t.name===dimension).type==='quantitative'?String(Math.max(...dims.map(Number))+1):`Axis ${dims.length+1}`;
    for(const rows of contexts.values()){
     const records=[...new Map(rows.map(r=>[String(r._series),r])).values()];
     for(const [i,r] of records.entries())table.rows.push({...r,[dimension]:name,[value]:rows[(i*7+seed)%rows.length][value],_row:`parallel-axis-${name}-${r._row}`});
    }dims.push(name);added.push(name);
   }
  }
  const count=Math.min(dims.length,3+seed%6),axisValues=Array.from({length:count},(_,i)=>dims[Math.round(i*(dims.length-1)/(count-1))]);
  const records=[...new Set(table.rows.map(r=>String(r._series)))].sort((a,b)=>vennSeed(`${seed}/${a}`)-vennSeed(`${seed}/${b}`)||sort(a,b));
  const lineStyle=chooseStyle?.(c.chart_id)??(seed%2?'bezier':'straight');
  Object.assign(o,{parallelDimension:dimension,parallelValue:value,parallelAxisValues:axisValues,parallelMinSpacingRatio:.5,parallelLineStyle:lineStyle});
  changes.push({chart:c.chart_id,dimension,value,axis_count:count,axis_values:axisValues,added_synthetic_axes:added,line_style:lineStyle,line_counts:{bezier:lineStyle==='bezier'?records.length:0,straight:lineStyle==='straight'?records.length:0},seed});
 }
 if(changes.length){job.provenance??={};job.provenance.parallel_geometry_revision={version:2,changes,selection:'Visible axes are an explicit subset of the dimension domain. Existing rows/field IDs are retained; added dimensions are synthetic.'};
  job.provenance.row_counts=Object.fromEntries(job.plan.datasets.map(t=>[t.id,t.rows.length]));
  for(const change of changes)if(change.added_synthetic_axes.length&&job.provenance.field_domains?.[change.dimension])job.provenance.field_domains[change.dimension]=[...new Set([...job.provenance.field_domains[change.dimension].map(String),...change.added_synthetic_axes])];
 }
 return changes;
}
export function validateParallelGeometry(o,rows,repetition){
 if(!o.parallelAxisValues)return;
 const axes=o.parallelAxisValues.map(String),fail=()=>{throw new Error('Invalid parallel axis domain, spacing or line styles');};
 if(axes.length<3||axes.length>8||new Set(axes).size!==axes.length||!(o.parallelMinSpacingRatio>=.5))fail();
 const groups=new Map();for(const r of rows){const key=JSON.stringify([...repetition.map(f=>String(r[f])),String(r._series)]);if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(String(r[o.parallelDimension]));if(!['bezier','straight'].includes(o.parallelLineStyle))fail();}
 for(const values of groups.values())if(axes.some(a=>!values.has(a)))fail();

}
