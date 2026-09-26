import * as d3 from 'd3';

export function drawParallel(g:any,rows:any[],o:any){
 const {dimension,value,width:w,height:h,orientation='vertical',recordKey='_series',color,chartId}=o;
 const horizontal=orientation==='horizontal';
 const dims=o.axisValues??[...new Set(rows.map(r=>r[dimension]))].sort((a:any,b:any)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
 if(o.axisValues)rows=rows.filter(r=>dims.some((d:any)=>String(d)===String(r[dimension])));
 const span=horizontal?h:w,spacing=dims.length>1?span/(dims.length-1):span;
 const length=o.minSpacingRatio?Math.min(horizontal?w:h,spacing/o.minSpacingRatio):horizontal?w:h;
 const dx=horizontal?(w-length)/2:0,dy=horizontal?0:(h-length)/2;
 const plot=g.append('g').attr('data-parallel-plot','true').attr('transform',`translate(${dx},${dy})`);
 const positions=d3.scalePoint<string>().domain(dims.map(String)).range([0,span]);
 const domain=o.domain??d3.extent(rows.map(r=>Number(r[value])));
 const values=d3.scaleLinear().domain(domain).range(horizontal?[0,length]:[length,0]);
 g.attr('data-parallel-chart',chartId).attr('data-axis-orientation',orientation).attr('data-dimension-field',dimension).attr('data-value-field',value).attr('data-axis-count',dims.length).attr('data-axis-length',length).attr('data-axis-spacing',spacing).attr('data-parallel-context',JSON.stringify(o.context??{}));
 for(const dim of dims){
  const p=positions(String(dim))!;
  const axis=plot.append('g').attr('data-parallel-axis',String(dim)).attr('transform',horizontal?`translate(0,${p})`:`translate(${p},0)`);
  axis.call((horizontal?d3.axisBottom(values):d3.axisLeft(values)).ticks(3)).attr('font-size',9).attr('color','#8c9aaa');
  if(o.labels)axis.append('text').attr('fill','#526374').attr('x',horizontal?-8:0).attr('y',horizontal?3:-8).attr('text-anchor',horizontal?'end':'middle').text(dim);
  o.anchor?.(rows.find(r=>String(r[dimension])===String(dim)),dx+(horizontal?length/2:p),dy+(horizontal?p:length/2),horizontal?{x:dx,y:p-40,width:length,height:80}:{x:p-40,y:dy,width:80,height:length});
 }
 const point=(r:any)=>horizontal?[values(Number(r[value])),positions(String(r[dimension]))!]:[positions(String(r[dimension]))!,values(Number(r[value]))];
 for(const [key,group] of d3.group(rows,(r:any)=>r[recordKey])){
  const order=dims.map(String),ordered=[...group].sort((a,b)=>order.indexOf(String(a[dimension]))-order.indexOf(String(b[dimension])));
  const style=o.lineStyle??'straight',curve=style==='bezier'?(horizontal?d3.curveBumpY:d3.curveBumpX):d3.curveLinear;
  plot.append('path').attr('data-parallel-line','true').attr('data-record',String(key)).attr('data-line-style',style).attr('d',d3.line<any>().x(r=>point(r)[0]).y(r=>point(r)[1]).curve(curve)(ordered)).attr('fill','none').attr('stroke',color(ordered[0])).attr('stroke-width',1.2).attr('opacity',o.opacity??.55);
  for(const r of ordered){const p=point(r);o.point?.(r,p[0]+dx,p[1]+dy);}
 }
}
