import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {reviewDocument} from './review.mjs';
const name=process.argv[2]??'composite-1100',root=path.resolve('outputs'),out=path.join(root,name),stage=path.resolve(process.argv[3]??path.join(root,'.position-stage'),name),specs=out+'-specs',ss=stage+'-specs';
const read=async p=>JSON.parse(await readFile(p,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=await read(stage+'/manifest.json'),coverage=await read(ss+'/coverage.json'),report=await read(ss+'/position-revision.json'),validation=await read(ss+'/position-validation.json'),original=await read(out+'/manifest.json');
if(report.issues.length||validation.issues.length||manifest.samples.length!==original.samples.length||validation.samples!==original.samples.length)throw new Error('Incomplete or failed spatial validation');
for(const s of manifest.samples){const r=report.samples.find(r=>r.id===s.sample_id),old=original.samples.find(x=>x.sample_id===s.sample_id);if(hash(await readFile(out+'/'+old.image))!==r.original_image_sha256||hash(await readFile(out+'/'+old.annotation))!==r.original_annotation_sha256)throw new Error('Source changed during staging: '+s.sample_id);if(hash(await readFile(stage+'/'+s.image))!==s.image_sha256||hash(await readFile(stage+'/'+s.annotation))!==s.annotation_sha256)throw new Error('Stage hash mismatch');const cv=coverage.samples.find(c=>c.sample_id===s.sample_id);if(hash(await readFile(ss+'/'+s.sample_id+'.spec.json'))!==cv.spec_sha256||hash(await readFile(ss+'/'+s.sample_id+'.svg'))!==cv.svg_sha256)throw new Error('Stage spec/SVG hash mismatch');}
const backup=path.join(root,'backups',name+'-position-'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(backup,{recursive:true});
const transfer=[[new URL('./annotation_guidelines.md',import.meta.url).pathname,out+'/annotation_guidelines.md']];for(const s of manifest.samples){transfer.push([stage+'/'+s.image,out+'/'+s.image],[stage+'/'+s.annotation,out+'/'+s.annotation]);for(const ext of ['plan.json','spec.json','svg','provenance.json'])transfer.push([ss+'/'+s.sample_id+'.'+ext,specs+'/'+s.sample_id+'.'+ext]);}
if(name==='nested-500'){
 const geometry=await read(ss+'/validation.json'),quality=await read(ss+'/quality-validation.json');
 if(!geometry.passed||geometry.samples!==original.samples.length||quality.issues.length||quality.samples!==original.samples.length)throw new Error('Nested geometry/quality validation failed');
 for(const file of ['validation.json','quality-validation.json','checks.json'])transfer.push([ss+'/'+file,specs+'/'+file]);
}
const previousReports=[];
for(const file of ['position-revision.json','position-validation.json'])try{await read(specs+'/'+file);previousReports.push(specs+'/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
for(const file of [out+'/manifest.json',specs+'/coverage.json',specs+'/review.html',...previousReports,...transfer.map(x=>x[1])]){const dest=path.join(backup,path.relative(root,file));await mkdir(path.dirname(dest),{recursive:true});await copyFile(file,dest);}
for(const [from,to] of transfer){await copyFile(from,to+'.position-new');await rename(to+'.position-new',to);}
report.backup=backup;report.published_at=new Date().toISOString();report.validation=validation;
if(previousReports.includes(specs+'/position-revision.json')){
 const previous=await read(path.join(backup,path.relative(root,specs+'/position-revision.json')));
 report.previous_publication={revision:previous.revision,render_revision:previous.render_revision,backup:previous.backup,published_at:previous.published_at,summary:previous.summary};
}
report.summary.rejected_indirect_pie_bar_relations=report.samples.reduce((n,s)=>n+(s.rejected?.length??0),0);
const sourceFiles=['position-relations.mjs','basis-expansion.mjs','nested-recipes.mjs','nested-layout.mjs','nested-contracts.mjs','basis-renderer.ts','nested-renderer.ts','renderer.ts','compile.mjs','composition.mjs','audit-position-relations.mjs','audit-nested.mjs'];report.source_hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,hash(await readFile(new URL(f,import.meta.url)))])));
coverage.position_revision={revision:report.revision,summary:report.summary,backup};coverage.notes=(coverage.notes??'')+' Position revision supersedes prior field-sharing identities; source mappings are historical and must be composed with position_revision.chart_field_map.';
await writeFile(out+'/manifest.json',json(manifest));await writeFile(specs+'/coverage.json',json(coverage));await writeFile(specs+'/position-revision.json',json(report));await writeFile(specs+'/position-validation.json',json(validation));await writeFile(specs+'/review.html',reviewDocument(manifest.samples,coverage.samples,out,specs));console.log({dataset:name,...report.summary,backup});
