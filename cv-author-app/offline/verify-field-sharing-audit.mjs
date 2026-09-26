import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'vite';
import {chromium} from 'playwright';
import {loadScene} from './render.mjs';
const root=path.resolve(new URL('../../',import.meta.url).pathname),out=path.join(root,'outputs/audits/field-sharing-50');
const read=async f=>JSON.parse(await readFile(f,'utf8'));const audit=await read(path.join(out,'audit.json'));
const built=await build({root:path.join(root,'cv-author-app'),configFile:false,envFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:new URL('./field-sharing-audit-renderer.ts',import.meta.url).pathname,name:'Audit',formats:['iife']}}});
const code=(Array.isArray(built)?built:[built]).flatMap(r=>r.output).find(r=>r.type==='chunk').code;
const browser=await chromium.launch({headless:true}),page=await browser.newPage();await page.setContent('<!doctype html><html><body></body></html>');await page.addScriptTag({content:code});
await mkdir(path.join(out,'replay'),{recursive:true});
try{for(const s of audit.samples){
 const dir=path.join(root,'outputs',s.dataset+'-specs'),scene=await loadScene(path.join(dir,s.id+'.spec.json')),saved=await readFile(path.join(dir,s.id+'.svg'),'utf8');
 const extra=await page.evaluate(async({scene,saved,probes})=>{
  const api=window.fieldSharingAudit,svg=window.offlineRenderer.render(scene);
  const trials=probes.map(p=>{try{const base=api.fingerprint(api.isolate(scene,p.chart));return {chart:p.chart,channel:p.channel,field:p.field,category_collapse_changes:base!==api.fingerprint(api.isolate(scene,p.chart,{channel:p.channel.replace('position.',''),mode:2}))};}catch(e){return {chart:p.chart,channel:p.channel,error:e.message};}});
  async function raster(svg){const img=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=scene.width;canvas.height=scene.height;canvas.getContext('2d').drawImage(img,0,0);return canvas.toDataURL().split(',')[1];}finally{URL.revokeObjectURL(url);}}
  return {fingerprint_equal:api.fingerprint(svg)===api.fingerprint(saved),trials,svg,png:await raster(svg),saved_png:await raster(saved)};
 },{scene,saved,probes:s.binding_probes.filter(p=>p.status==='no_visible_response')});
 await writeFile(path.join(out,'replay',s.id+'.png'),Buffer.from(extra.png,'base64'));await writeFile(path.join(out,'replay',s.id+'.saved-svg.png'),Buffer.from(extra.saved_png,'base64'));
 if(!s.renderer_replay.svg_byte_identical)await writeFile(path.join(out,'replay',s.id+'.svg'),extra.svg);
 s.renderer_replay.visible_signature_identical=extra.fingerprint_equal;s.category_followup=extra.trials;
 console.log(s.id,extra.fingerprint_equal,JSON.stringify(extra.trials));
}await writeFile(path.join(out,'audit.json'),JSON.stringify(audit,null,2)+'\n');}finally{await browser.close();}
