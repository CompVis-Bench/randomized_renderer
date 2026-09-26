// Refresh spatial diagnostics with the final renderer, keeping identical pixels.
import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {createRenderer,loadScene} from './render.mjs';
const name=process.argv[2]??'composite-1100',out='outputs/.position-stage/'+name,specs=out+'-specs';
const read=async f=>JSON.parse(await readFile(f,'utf8')),json=x=>JSON.stringify(x,null,2)+'\n',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=await read(out+'/manifest.json'),coverage=await read(specs+'/coverage.json'),report=await read(specs+'/position-revision.json');
let renderer,count=0;
try{for(const s of manifest.samples){const id=s.sample_id,prov=await read(specs+'/'+id+'.provenance.json'),r=prov.position_revision;
 prov.shared_fields=r.retained.map(e=>({field:r.chart_field_map[e.charts[0]][e.field]??e.field,charts:e.charts,evidence:e.evidence}));
 await writeFile(specs+'/'+id+'.provenance.json',json(prov));
 const plan=name==='nested-500'?await read(specs+'/'+id+'.plan.json'):null;
 const overlayBars=plan&&JSON.stringify(plan.composition).includes('overlay')&&plan.charts.some(c=>c.options.barOrientation);
 if(!r.alignments.length&&!overlayBars)continue;
 if(!renderer)renderer=await createRenderer();if(count&&count%30===0){await renderer.close();renderer=await createRenderer();}
 const loaded=await loadScene(specs+'/'+id+'.spec.json'),old=await readFile(specs+'/'+id+'.svg','utf8'),svg=await renderer.renderSvg(loaded);
 const pixels=svg=>svg.replace(/<metadata\b[^>]*><\/metadata>/g,'').replace(/ data-position-contract="[^"]*"/g,'');
 if(pixels(svg)!==pixels(old)){const {png}=await renderer.render(loaded);await writeFile(out+'/'+s.image,png);s.image_sha256=hash(png);report.samples.find(x=>x.id===id).rerendered=true;}
 await writeFile(specs+'/'+id+'.svg',svg);coverage.samples.find(c=>c.sample_id===id).svg_sha256=hash(svg);count++;if(count%30===0)console.log(`${name}: finalized ${count} aligned images`);
 }
 report.summary.rerendered=report.samples.filter(s=>s.rerendered).length;
 await writeFile(out+'/manifest.json',json(manifest));await writeFile(specs+'/coverage.json',json(coverage));await writeFile(specs+'/position-revision.json',json(report));console.log({dataset:name,aligned_images:count});
}finally{await renderer?.close();}
