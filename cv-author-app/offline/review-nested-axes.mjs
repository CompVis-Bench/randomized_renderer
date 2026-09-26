import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('outputs'),out=path.join(root,'nested-axis-review');
const report=JSON.parse(await readFile(path.join(root,'nested-500-specs/position-revision.json'),'utf8'));
if(report.render_revision!=='nested-internal-anchors-and-axis-insets-v1'||!report.backup)throw new Error('Publish the nested axis revision first');
await mkdir(out,{recursive:true});
const ids=['nested-06-002','nested-04-001','nested-07-003','nested-17-002','nested-18-002','nested-01-005'];
const cards=ids.map(id=>{
 const sample=report.samples.find(s=>s.id===id);
 const pair=[['修订前',path.join(report.backup,'nested-500')],['修订后',path.join(root,'nested-500')]].map(([label,dir])=>{const file=path.relative(out,path.join(dir,'images',id+'.png'));return `<figure><figcaption>${label}</figcaption><a href="${file}"><img loading="lazy" src="${file}"></a></figure>`;}).join('');
 return `<section><h2>${id}</h2><p>${sample.removed_scatter_points?.length?'已移除被子图替代的 scatterplot 点及其可见标注。':'保留原图形，仅调整嵌套子图的轴内余量。'}子图中心仍对应真实数据坐标。</p><div class="pair">${pair}</div><p><a href="../nested-500/annotations/${id}.json">当前 annotation</a> · <a href="../nested-500-specs/${id}.provenance.json">修订记录</a></p></section>`;
}).join('');
await writeFile(path.join(out,'index.html'),`<!doctype html><html lang="zh"><meta charset="utf-8"><title>Nested 坐标轴内布局对照</title><style>body{font:15px system-ui;background:#f2f5f7;color:#203040;margin:32px}main{max-width:1600px;margin:auto}section{background:white;padding:24px;margin:24px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}img{width:100%;height:450px;object-fit:contain}figcaption{padding:8px}a{color:#175ca5}</style><main><h1>Nested 子图完整保留在坐标轴内</h1><p>原始 scatterplot 点在被子图替代后，不再绘制或单独标注。调整坐标域以容纳子图完整尺寸，保留真实定位关系。点击图片查看原始尺寸。</p>${cards}</main></html>`);
console.log(path.join(out,'index.html'));
