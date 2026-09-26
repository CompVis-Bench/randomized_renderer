// Seeded, independent decisions: 50% wrapping and 50% row/column traversal.
export function facetLayout(count, random) {
 const wrap=random()<.5, flow=random()<.5?'row':'column';
 const major=wrap?Math.max(1,Math.ceil(Math.sqrt(count))):count;
 return {columns:flow==='row'?major:Math.ceil(count/major),flow,wrap,border:true};
}
export function facetIndex(index, count, columns, flow='row') {
 const rows=Math.ceil(count/columns);
 return flow==='column'?[Math.floor(index/rows),index%rows]:[index%columns,Math.floor(index/columns)];
}
export function trendFraction(t, mode=0, phase=0) {
 const main=mode===0?t:mode===1?1-t:mode===2?Math.sin(Math.PI*t):(1-Math.exp(-3*t));
 return Math.max(0,Math.min(1,.1+.78*main+.025*Math.sin(t*2*Math.PI+phase)));
}
