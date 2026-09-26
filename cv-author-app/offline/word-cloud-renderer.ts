// Adapted from master:src/utils/advancedRenderer.ts's deterministic word cloud:
// bounded spiral search + collision rejection. Use real font metrics and shrink
// the whole cloud together, preserving the size mapping and every source row.
import {vennSeed} from './venn-content.mjs';
export function drawWordCloud(plot:any,rows:any[],e:any,cfg:any,w:number,h:number,color:any,mark:any,point:any){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
 const sorted=[...rows].sort((a,b)=>Number(b[e.size.field])-Number(a[e.size.field])||String(a[e.text.field]).localeCompare(String(b[e.text.field])));
 const vals=sorted.map(r=>Number(r[e.size.field])),lo=Math.min(...vals),hi=Math.max(...vals),seed=vennSeed(JSON.stringify(rows)),shape=cfg.wordCloud?.shape??(seed%2?'ellipse':'rounded');
 const maxFont=Math.min(48,Math.sqrt(w*h/sorted.length)*.72),minFont=maxFont*.34;
 const inside=(x:number,y:number)=>{if(x<3||y<3||x>w-3||y>h-3)return false;const nx=(x-w/2)/(w/2-3),ny=(y-h/2)/(h/2-3);return shape==='ellipse'?nx*nx+ny*ny<=1:Math.pow(Math.abs(nx),4)+Math.pow(Math.abs(ny),4)<=1;};
 let placed:any[]=[];
 for(let pass=0;pass<18;pass++){
  placed=[];const factor=Math.pow(.90,pass);
  for(const [index,row] of sorted.entries()){
   const text=String(row[e.text.field]),font=(minFont+(hi===lo?.5:(Number(row[e.size.field])-lo)/(hi-lo))*(maxFont-minFont))*factor;
   ctx.font=`600 ${font}px Arial`;const m=ctx.measureText(text),tw=Math.max(m.width,m.actualBoundingBoxLeft+m.actualBoundingBoxRight),ascent=m.fontBoundingBoxAscent??font*.95,descent=m.fontBoundingBoxDescent??font*.25,th=Math.max(ascent+descent,font*1.25);
   const rotate=vennSeed(text+seed)%7===0?90:0,bw=(rotate?th:tw)+4,bh=(rotate?tw:th)+4;
   let found:any=null;
   for(let attempt=0;attempt<2400;attempt++){
    const angle=attempt*2.3999632297+index*.37+(seed%100)*.01,radius=.54*Math.sqrt(attempt/2399),x=w/2+Math.cos(angle)*radius*w,y=h/2+Math.sin(angle)*radius*h;
    const left=x-bw/2,top=y-bh/2;
    if(!inside(left,top)||!inside(left+bw,top)||!inside(left,top+bh)||!inside(left+bw,top+bh))continue;
    if(placed.some(p=>left<p.left+p.bw&&left+bw>p.left&&top<p.top+p.bh&&top+bh>p.top))continue;
    found={row,text,font,rotate,x,y,left,top,bw,bh,baseline:(ascent-descent)/2};break;
   }
   if(!found)break;placed.push(found);
  }
  if(placed.length===sorted.length)break;
 }
 if(placed.length!==sorted.length)throw new Error('Word cloud cannot fit all annotated rows in its region');
 plot.attr('data-word-layout','bounded-spiral').attr('data-word-region',shape).attr('data-word-count',placed.length);
 for(const p of placed){const text=plot.append('text').attr('x',0).attr('y',p.baseline).attr('transform',`translate(${p.x},${p.y}) rotate(${p.rotate})`).attr('text-anchor','middle').attr('font-family','Arial').attr('font-size',p.font).attr('font-weight',600).attr('fill',color(p.row)).attr('data-word-box',JSON.stringify([p.left,p.top,p.bw,p.bh])).text(p.text);mark(text,p.row);point(p.row,p.x,p.y);}
}
