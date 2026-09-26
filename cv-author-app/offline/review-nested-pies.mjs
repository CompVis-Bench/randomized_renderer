import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('outputs'),out=path.join(root,'nested-pie-review');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const report=await read(path.join(root,'nested-500-specs/position-revision.json'));
if(!report.backup)throw new Error('Publish the revision before building its comparison page');
await mkdir(out,{recursive:true});
const selected=[...report.samples.filter(s=>s.rejected?.length),...['nested-06-001','nested-06-002','nested-01-005'].map(id=>report.samples.find(s=>s.id===id))];
let cards='';
for(const sample of selected){
 const id=sample.id,before=path.join(report.backup,'nested-500'),after=path.join(root,'nested-500');
 const old=await read(path.join(before,'annotations',id+'.json')),current=await read(path.join(after,'annotations',id+'.json'));
 const changes=current.charts.flatMap(c=>{
  const previous=old.charts.find(p=>p.chart_id===c.chart_id),items=[];
  for(const [channel,field] of Object.entries(c.encodings))if(previous.encodings[channel]!==field)items.push(`${channel}: ${previous.encodings[channel]} → ${field}`);
  if(JSON.stringify(previous.repetition_position)!==JSON.stringify(c.repetition_position))items.push(`repetition_position: ${previous.repetition_position.join(', ')} → ${c.repetition_position.join(', ')}`);
  return items.length?[`${c.chart_id} (${c.variation}) — ${items.join('; ')}`]:[];
 });
 const pair=[['修订前',before],['修订后',after]].map(([label,dir])=>{const url=path.relative(out,path.join(dir,'images',id+'.png'));return `<figure><figcaption>${label}</figcaption><a href="${url}"><img loading="lazy" src="${url}"></a></figure>`;}).join('');
 cards+=`<section><h2>${id}</h2><p>${sample.rejected?.length?'已取消间接 pie/bar 定位字段关联，保留实际线图锚点。':'Pie/donut 去边框；保留原有直接锚点关系。'}</p><div class="pair">${pair}</div><ul>${changes.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><a href="../nested-500/annotations/${id}.json">当前 annotation</a> · <a href="../nested-500-specs/${id}.provenance.json">修订记录</a></section>`;
}
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Nested pie 修订对照</title><style>body{font:15px system-ui;background:#f2f5f7;color:#203040;margin:32px}main{max-width:1600px;margin:auto}section{background:white;padding:24px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;height:430px;object-fit:contain}figcaption{padding:8px}a{color:#175ca5}li{margin:6px}</style><main><h1>Nested pie 位置关联与边框修订</h1><p>保留 500 张；32 张取消间接 pie/bar 关联；180 张含 pie/donut 的图片去边框。这里列出全部 32 张关联修订及 3 张边框示例，点击图片查看原图。字段标识仅显示在审核说明中。</p>${cards}</main></html>`);
console.log(path.join(out,'index.html'));
