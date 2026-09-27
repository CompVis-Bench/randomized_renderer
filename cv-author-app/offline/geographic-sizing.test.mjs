import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {buildRandomizedAnnotation} from './randomized-annotation.mjs';
import {createRenderer} from './render.mjs';

const geometry=JSON.parse(await readFile(new URL('./assets/manhattan.geojson',import.meta.url),'utf8'));
const chart=(id,variation,external={position:[]})=>({chart_id:id,variation,encodings:{'position.x':'F1','position.y':'F2',color:'F3'},external_encodings:external});
const near=(a,b)=>assert(Math.abs(a-b)<.02,`${a} differs from ${b}`);

test('maps fill wide and tall cells without stretching geography or dropping size encodings',async()=>{
 const renderer=await createRenderer(),browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  const inspect=async scene=>{
   await page.setContent(await renderer.renderSvg(scene));
   return page.evaluate(()=>[...document.querySelectorAll('[data-randomized-instance]')].map(node=>{
    const frame=JSON.parse(node.getAttribute('data-instance-frame'));
    const land=[...node.querySelectorAll('path.land')].map(p=>p.getBBox());
    const x=Math.min(...land.map(b=>b.x)),y=Math.min(...land.map(b=>b.y));
    return {frame,plot:JSON.parse(node.querySelector('[data-geo-frame]')?.getAttribute('data-geo-frame')??'null'),
     bounds:land.length?{x,y,width:Math.max(...land.map(b=>b.x+b.width))-x,height:Math.max(...land.map(b=>b.y+b.height))-y}:null};
   }));
  };
  let ratio;
  for(const variation of ['geo_area','geo_point','geo_line'])for(const [width,height] of [[948,548],[548,948]]){
   const {scene}=buildRandomizedAnnotation({charts:[chart('C1',variation)]},{geometry});
   Object.assign(scene,{width,height});
   const [{frame,plot,bounds}]=await inspect(scene);
   assert.deepEqual(frame,{x:24,y:24,width:width-48,height:height-48});
   assert.deepEqual(plot,[32,32,width-64,height-64]);
   // Geographic bounds touch at least one pair of inset edges, stay inside
   // the other pair, and retain the same aspect ratio in both orientations.
   const [, ,w,h]=plot;
   near(Math.max(bounds.width/(w-8),bounds.height/(h-8)),1);
   near(bounds.x+bounds.width/2,w/2);near(bounds.y+bounds.height/2,h/2);
   assert(bounds.x>=3.98&&bounds.y>=3.98);
   ratio??=bounds.width/bounds.height;near(bounds.width/bounds.height,ratio);
  }
  const mixed=buildRandomizedAnnotation({charts:[chart('C1','geo_area'),chart('C2','bar')]},{geometry}).scene;
  mixed.width=1048;mixed.height=848;
  mixed.composition.child={type:'concat',direction:'horizontal',gap:96,weights:[1,1],children:['C1','C2']};
  const [map,bar]=await inspect(mixed);
  assert.deepEqual(map.frame,{x:24,y:24,width:452,height:800});
  assert.equal(bar.frame.width,360);assert.equal(bar.frame.height,300);

  const sized=buildRandomizedAnnotation({charts:[chart('C1','geo_area',{position:['F4'],size:'F5'})]},
   {geometry,policy:{minRepetitions:2,maxRepetitions:2}}).scene;
  const frames=(await inspect(sized)).map(m=>m.frame);
  assert.equal(frames.length,2);
  assert.notEqual(frames[0].width*frames[0].height,frames[1].width*frames[1].height);
 }finally{await browser.close();await renderer.close();}
});
