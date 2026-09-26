import {makeVennContext,vennSeed} from './venn-content.mjs';
const icons:Record<string,string>={leaf:'M-6,6 Q-10,-7 7,-8 Q10,7 -6,6 M-6,6 L4,-4',person:'M0,-2 a3,3 0 1,0 0,-6 a3,3 0 1,0 0,6 M-5,7 V3 Q-5,-1 0,-1 Q5,-1 5,3 V7 Z',star:'M0,-8 L2.4,-2.5 L8,-2.5 L3.5,1.5 L5,7 L0,3.7 L-5,7 L-3.5,1.5 L-8,-2.5 L-2.4,-2.5 Z',diamond:'M0,-8 L6,0 L0,8 L-6,0 Z',heart:'M0,7 C-13,-1 -6,-12 0,-5 C6,-12 13,-1 0,7 Z'};
export function drawVenn(plot:any,rows:any[],field:string,cfg:any,filters:any,w:number,h:number,color:any,mark:any,point:any){
 const context=cfg.venn?.contexts.find((c:any)=>Object.entries(c.filters).every(([f,v])=>String(filters[f])===String(v)));
 if(cfg.venn&&!context)throw new Error('Missing Euler/Venn context');
 const data=context??makeVennContext([...new Set(rows.map(r=>String(r[field])))],vennSeed(JSON.stringify(rows)),'mixed','overlap');
 const count=data.panels.length,cols=Math.min(count,Math.max(1,Math.round(Math.sqrt(count*w/h)))),nr=Math.ceil(count/cols),cw=w/cols,ch=h/nr;
 const byValue=new Map(rows.map(r=>[String(r[field]),r]));
 plot.attr('data-venn-content',cfg.venn?.mode??'mixed');
 data.panels.forEach((panel:any,index:number)=>{
  const x=(index%cols)*cw,y=Math.floor(index/cols)*ch;
  const g=plot.append('g').attr('transform',`translate(${x},${y})`).attr('data-venn-panel',index);
  for(const s of panel.sets){const row=byValue.get(s.value),ellipse=g.append('ellipse').attr('cx',s.x*cw).attr('cy',s.y*ch).attr('rx',s.rx*cw).attr('ry',s.ry*ch).attr('fill',color(row)).attr('fill-opacity',.10).attr('stroke',color(row)).attr('stroke-width',1.5);
   mark(ellipse,row);point(row,x+s.x*cw,y+s.y*ch);
  }
  for(const s of panel.sets){const row=byValue.get(s.value),label=`Set ${s.value}`,font=Math.min(12,ch*.048,cw*.20/(label.length*.62));g.append('text').attr('x',s.x*cw).attr('y',(s.y-s.ry+.065)*ch).attr('text-anchor','middle').attr('dominant-baseline','central').attr('font-family','Arial,sans-serif').attr('font-size',font).attr('font-weight',600).attr('fill',color(row)).attr('stroke','#fff').attr('stroke-width',2).attr('paint-order','stroke').text(label);}
  for(const item of panel.items){const gitem=g.append('g').attr('data-venn-member',item.id).attr('data-set-memberships',JSON.stringify(item.members)).attr('transform',`translate(${item.x*cw},${item.y*ch})`);
   gitem.append('title').text(`${item.label} — sets ${item.members.join(', ')}`);
   if(item.kind==='word')gitem.append('text').attr('text-anchor','middle').attr('dominant-baseline','central').attr('font-family','Arial,sans-serif').attr('font-size',Math.min(13,ch*.048,(item.halfWidth*1.7*cw)/(item.label.length*.65))).attr('fill','#354454').text(item.label);
   else gitem.append('path').attr('d',icons[item.icon]).attr('transform',`scale(${Math.min(1.1,item.halfWidth*cw/10,item.halfHeight*ch/10)})`).attr('fill',item.icon==='leaf'?'none':'#46566a').attr('stroke','#46566a').attr('stroke-width',1.3).attr('stroke-linejoin','round').attr('stroke-linecap','round');
  }
 });
}
