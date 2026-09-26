import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {reviewDocument} from './review.mjs';
const root=path.resolve('outputs'),out=path.join(root,'link-review'),read=async p=>JSON.parse(await readFile(p,'utf8'));
await mkdir(out,{recursive:true});
const names={'rmg-rmg':'RMG → RMG','within-rmg':'RMG 内部','mg-rmg':'MG → RMG','mg-mg':'MG → MG（没有可用的独立 RMG 端点）'},cards=[];
for(const dataset of ['composite-1100','nested-500']){
 const target=path.join(root,dataset),specs=target+'-specs',m=await read(target+'/manifest.json'),cv=await read(specs+'/coverage.json'),r=await read(specs+'/link-revision.json');
 await writeFile(specs+'/review.html',reviewDocument(m.samples,cv.samples,target,specs));
 for(const item of r.samples){const id=item.id,relations=item.changes.map(c=>`${names[c.relation]} · ${c.style==='straight'?'直线':'贝塞尔'} · ${c.edges} 条`).join('；');
 const images=[['修改前',path.resolve(r.backup,dataset,'images',id+'.png')],['修改后',path.join(target,'images',id+'.png')]].map(([label,p])=>`<figure><figcaption>${label}</figcaption><a href="${path.relative(out,p)}"><img loading="lazy" src="${path.relative(out,p)}"></a></figure>`).join('');
 cards.push(`<section data-relations="${item.changes.map(c=>c.relation).join(' ')}"><h2>${id}</h2><p>${relations}</p><div class="pair">${images}</div><p><a href="../${dataset}/annotations/${id}.json">当前标注</a> · <a href="../${dataset}-specs/${id}.provenance.json">修订记录</a></p></section>`);
 }
}
await writeFile(out+'/index.html',`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Link 单独修订对照</title><style>body{font:15px system-ui;background:#f2f5f7;color:#203040;margin:24px}main{max-width:1800px;margin:auto}section{background:white;padding:20px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;height:480px;object-fit:contain}figcaption{padding:8px}a{color:#175ca5}select{padding:8px}</style><main><h1>Link 单独修订 · 253 张</h1><p>原有 link 组数保留；同组统一关系与线形；端点按固定随机种子分配。点击图片查看原尺寸。</p><label>连接关系 <select id="filter"><option value="">全部</option>${Object.entries(names).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label>${cards.join('')}</main><script>document.querySelector('select').onchange=e=>document.querySelectorAll('section').forEach(s=>s.hidden=e.target.value&&!s.dataset.relations.split(' ').includes(e.target.value))</script></html>`);
console.log(out+'/index.html');
