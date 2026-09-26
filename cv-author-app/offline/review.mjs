import path from 'node:path';

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const titles = {
  '01-unrelated-view': '01 · 添加数据无关可视化',
  '02-related-mg': '02 · 添加数据相关 MG',
  '03-related-repeated-mg': '03 · 添加数据相关的重复 MG',
  '04-repeat-all-mg-rmg': '04 · 所有 MG/RMG 增加 repetition',
  '05-nest-selected-mg': '05 · 选择 MG 添加 nested',
  '06-facet-two-mgs': '06 · 两个 MG 使用同一字段 facet',
  '07-double-facet-whole': '07 · 整体连续 facet 两次',
  '08-merge-two-share-field': '08 · 两个可视化共享一个字段',
  '09-merge-three-pairwise-fields': '09 · 三个可视化两两共享字段',
  '10-merge-two-composites': '10 · 两个已有 composite 共享字段',
  '11-pair-complex-idioms': '11 · 复杂 idiom 两两组合',
  'dendrogram-nested-bars': 'Dendrogram Facet + node-level bar profiles',
  'treemap-area-facet': 'Treemap + Stacked Area, faceted by scenario',
  'network-matrix-facet': 'Force network + adjacency matrix, faceted by period',
  'parallel-stacked-facet': 'Parallel Coordinates + Stacked Bar',
  'stacked-time-dashboard': 'Overview + faceted Stacked Area and Stacked Bar',
  'topic-hierarchy-dashboard': 'Sunburst + scatter + Stacked Bar, faceted by topic',
  'stacked-matrix-facet': 'Two-level Facet with Stacked Bar + diagnostic lines',
  'geo-statistical-dashboard': 'Manhattan ZIP map + events + statistical views', 
  'polar-concat': 'Polar Concat: pie/donut + radial bars',
  'polar-facet': 'Polar Facet: angular × radial cells',
  'polar-line-facet': 'Polar line Facet',
  'nested-bars-pies': 'Two-level Nested: positions → bars → pies/donuts',
  'multi-facet-bar-pie': 'Two-level Facet: bars + pies/donuts in each cell',
  'concat-then-nested': 'Concat bars and pies, then nest the composite',
  'nested-after-concat': 'Concat two bar charts, then nest on one member',
};

export function reviewDocument(samples, coverage, out, specDir) {
  const link = (filename) => path.relative(specDir, filename).split(path.sep).map(encodeURIComponent).join('/');
  const cards = samples.map((sample, index) => {
    const entry = coverage[index];
    const image = escape(link(path.join(out, sample.image)));
    return `<article data-recipe="${escape(entry.recipe)}"><h2>${escape(titles[entry.recipe] ?? entry.recipe)}</h2>
      <p class="id">${escape(sample.sample_id)}</p>${entry.recipe === 'geo-statistical-dashboard' ? '<p>Synthetic observations on real Manhattan ZIP boundaries.</p>' : ''}
      <a class="image" href="${image}" target="_blank" rel="noopener"><img src="${image}" alt="${escape(titles[entry.recipe] ?? entry.recipe)}; open full-size PNG" loading="lazy"></a>
      <p>${entry.source_samples ? `来源：${escape(entry.source_samples.join(' · '))}<br>` : ''}Templates: ${escape(entry.variations.join(' · '))}<br>Repeated-position field counts: ${escape(entry.repetition_dimensions.join(' / '))}</p>
      <nav aria-label="Sample files"><a href="${escape(link(path.join(out, sample.annotation)))}">annotation</a>
      <a href="${escape(sample.sample_id)}.spec.json">Spec</a><a href="${escape(sample.sample_id)}.plan.json">Construction plan</a>${entry.provenance ? `<a href="${escape(entry.provenance)}">来源与字段映射</a>` : ''}</nav></article>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>VisBricks dataset expansion review</title><style>
    *{box-sizing:border-box}[hidden]{display:none!important}select{padding:8px;font:inherit}body{margin:0;padding:28px;font:15px/1.6 system-ui,sans-serif;color:#172b40;background:#f4f6f8}
    main,header{max-width:1480px;margin:auto}h1{margin:0 0 8px;font-size:26px}header{margin-bottom:26px}
    main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:white;padding:20px;border:1px solid #d9e1e8;border-radius:10px}
    h2{font-size:17px;margin:0}.id{font-size:12px;color:#536679;overflow-wrap:anywhere}.image{display:block;background:white}
    img{display:block;width:100%;height:430px;object-fit:contain}nav{display:flex;gap:20px;flex-wrap:wrap}a{color:#1257a0;text-underline-offset:3px}
    a:focus-visible{outline:3px solid #ce7900;outline-offset:4px}p{margin:10px 0}@media(max-width:850px){main{grid-template-columns:1fr}body{padding:16px}img{height:auto}}
    </style><header><h1>Dataset expansion · ${samples.length} samples</h1>
    <p>Open any image to inspect the full-size PNG. Current annotations follow the format_version in the dataset manifest. Samples are pending review; palette and constant-shape variations do not introduce annotation fields.</p>
    <a href="${escape(link(path.join(out, 'manifest.json')))}">Dataset manifest</a> · <a href="coverage.json">Coverage and reproducibility</a><p><label>筛选类别 <select id="category"><option value="">全部（${samples.length}）</option>${[...new Set(coverage.map(c=>c.recipe))].map(r=>`<option value="${escape(r)}">${escape(titles[r]??r)}（${coverage.filter(c=>c.recipe===r).length}）</option>`).join('')}</select></label></p></header><main>${cards}</main><script>document.getElementById("category").addEventListener("change",e=>{document.querySelectorAll("article").forEach(a=>a.hidden=!!e.target.value&&a.dataset.recipe!==e.target.value);});</script></html>`;
}
