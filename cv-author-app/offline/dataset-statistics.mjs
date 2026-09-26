import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(new URL('../../',import.meta.url).pathname);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=[['seed','data'],['composite','outputs/composite-1100'],['nested','outputs/nested-500']];
const samples=[],sources=[];
for(const [dataset,folder] of inputs){
 const dir=path.join(root,folder),bytes=await readFile(path.join(dir,'manifest.json')),manifest=JSON.parse(bytes);
 if(manifest.sample_count!==manifest.samples.length)throw new Error('Manifest count mismatch');
 sources.push({dataset,folder,annotation_version:manifest.annotation_version,manifest_sha256:hash(bytes)});
 for(const s of manifest.samples){
  const raw=await readFile(path.join(dir,s.annotation));if(hash(raw)!==s.annotation_sha256)throw new Error('Annotation hash mismatch: '+s.sample_id);
  const a=JSON.parse(raw),uses=new Map();
  for(const c of a.charts){
   for(const [role,fields] of [['encoding',[...Object.values(c.encodings),...[c.external_encodings?.size,c.external_encodings?.color].filter(Boolean)]],['repetition',c.external_encodings?.position??c.repetition_position??[]]])for(const f of new Set(fields)){
    if(!uses.has(f))uses.set(f,{encoding:new Set(),repetition:new Set()});uses.get(f)[role].add(c.chart_id);
   }
  }
  const declared=new Set(a.data_fields?.map(f=>f.field_id)??uses.keys());
  if((a.data_fields&&declared.size!==a.data_fields.length)||declared.size!==uses.size||[...uses.keys()].some(f=>!declared.has(f)))throw new Error('Invalid field inventory: '+s.sample_id);
  const shared=[...uses].filter(([,u])=>new Set([...u.encoding,...u.repetition]).size>1).map(([f])=>f);
  samples.push({dataset,id:s.sample_id,mark_groups:a.charts.length,types:a.charts.map(c=>c.variation),fields:declared.size,repeated_mark_groups:a.charts.filter(c=>(c.external_encodings?.position??c.repetition_position??[]).length).length,repetition:a.charts.some(c=>(c.external_encodings?.position??c.repetition_position??[]).length),shared_fields:shared,sharing:shared.length>0,sharing_internal_only:[...uses.values()].some(u=>u.encoding.size>1),sharing_involving_internal:[...uses.values()].some(u=>u.encoding.size>0&&new Set([...u.encoding,...u.repetition]).size>1)});
 }
}
function summarize(selected){
 const sum=fn=>selected.reduce((n,s)=>n+Number(fn(s)),0),types={};for(const s of selected)for(const t of s.types)types[t]=(types[t]??0)+1;
 const neither=selected.filter(s=>!s.repetition&&!s.sharing);
 return {visualizations:selected.length,mark_groups:sum(s=>s.mark_groups),mark_group_types:Object.keys(types).length,annotated_data_fields:sum(s=>s.fields),visualizations_with_repetition:sum(s=>s.repetition),visualizations_with_sharing:sum(s=>s.sharing),visualizations_with_sharing_or_repetition:sum(s=>s.sharing||s.repetition),visualizations_with_both:sum(s=>s.sharing&&s.repetition),visualizations_with_neither:neither.length,neither_single_mg:neither.filter(s=>s.mark_groups===1).length,neither_multiple_mgs:neither.filter(s=>s.mark_groups>1).length,sharing_internal_only:sum(s=>s.sharing_internal_only),sharing_involving_internal:sum(s=>s.sharing_involving_internal),repeated_mark_group_templates:sum(s=>s.repeated_mark_groups),shared_field_ids:sum(s=>s.shared_fields.length),type_counts:Object.fromEntries(Object.entries(types).sort()),neither_samples:neither.map(s=>({id:s.id,dataset:s.dataset,mark_groups:s.mark_groups,types:s.types}))};
}
const report={scope:'Current manifests only; excludes history, previews, backups and repeated rendered instances. Review flags do not change manifest membership.',definitions:{mark_groups:'Number of charts entries (templates, not rendered repetitions).',types:'Distinct literal variation values; normalized_stacked_bar is distinct from stacked_bar.',fields:'Unique field IDs per visualization, summed over visualizations. IDs are local to each visualization.',repetition:'At least one chart has nonempty external_encodings.position (or legacy repetition_position).',sharing:'One field ID is referenced by at least two distinct chart IDs, through internal and external encodings (or legacy repetition_position). Reusing a field in multiple channels of one chart alone is not cross-MG sharing.',union:'Visualizations with sharing OR repetition, counted once.'},sources,statistics:Object.fromEntries([...inputs.map(([name])=>[name,summarize(samples.filter(s=>s.dataset===name))]),['expanded_1600',summarize(samples.filter(s=>s.dataset!=='seed'))],['all_1721',summarize(samples)]]),samples};
const output=path.resolve(process.argv[2]??path.join(root,'outputs/dataset-statistics.json'));await writeFile(output,JSON.stringify(report,null,2)+'\n');
for(const [scope,s] of Object.entries(report.statistics)){const {type_counts,neither_samples,...counts}=s;console.log(scope,counts);}console.log(output);
