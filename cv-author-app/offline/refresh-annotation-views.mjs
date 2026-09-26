// Keep review metadata in sync with public v5 annotations; render IDs remain
// those of the frozen plan/spec and are mapped explicitly in provenance.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {reviewDocument} from './review.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const write=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const revision=(await read(path.join(root,'outputs/composite-1100/manifest.json'))).annotation_version;
const report=await read(path.join(root,'outputs/audits',revision,'report.json'));
const records=new Map(report.samples.map(s=>[s.id,s]));
for(const dataset of ['composite-1100','nested-500']){
 const out=path.join(root,'outputs',dataset),specs=out+'-specs';
 const manifest=await read(out+'/manifest.json');
 if(manifest.annotation_version!==revision)throw new Error('Publish current annotations first');
 const backup=path.join(root,'outputs/backups',revision,dataset+'-specs');
 await mkdir(backup,{recursive:true});
 await copyFile(specs+'/coverage.json',backup+'/coverage.json',1).catch(e=>{if(e.code!=='EEXIST')throw e;});
 const coverage=await read(specs+'/coverage.json');
 const byId=new Map(coverage.samples.map(s=>[s.sample_id,s]));
 for(const sample of manifest.samples){
  const a=await read(path.join(out,sample.annotation)),entry=byId.get(sample.sample_id),record=records.get(sample.sample_id);
  entry.variations=a.charts.map(c=>c.variation);
  entry.repetition_dimensions=a.charts.map(c=>c.external_encodings.position.length);
  const file=path.join(specs,sample.sample_id+'.provenance.json');
  await copyFile(file,path.join(backup,sample.sample_id+'.provenance.json'),1).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const provenance=await read(file);
  provenance.annotation_revision={revision,format_version:manifest.format_version,
   render_annotation:sample.sample_id+'.render-annotation.json',
   render_chart_to_annotation_chart:record.chart_id_map,changes:record.changes,
   note:'Existing plan/spec and earlier provenance describe frozen rendering inputs; public annotations are image-grounded v5 labels.'};
  await write(file,provenance);
 }
 coverage.annotation_revision={revision,format_version:manifest.format_version,report:`../audits/${revision}/report.json`};
 await write(specs+'/coverage.json',coverage);
 await copyFile(specs+'/review.html',backup+'/review.html',1).catch(e=>{if(e.code!=='EEXIST')throw e;});
 await writeFile(specs+'/review.html',reviewDocument(manifest.samples,coverage.samples,out,specs));
 console.log(dataset,manifest.samples.length,'review entries updated');
}
