import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {feature} from 'topojson-client';
import {geoCentroid,geoContains,geoBounds} from 'd3';
export async function loadGeographies(){
 const statesRaw=await readFile(new URL('../node_modules/us-atlas/states-10m.json',import.meta.url));
 const countiesRaw=await readFile(new URL('../node_modules/us-atlas/counties-10m.json',import.meta.url));
 const statesTopo=JSON.parse(statesRaw),countiesTopo=JSON.parse(countiesRaw);
 const states=feature(statesTopo,statesTopo.objects.states),counties=feature(countiesTopo,countiesTopo.objects.counties);
 const result=[{id:'united-states',name:'United States',projection:'albersUsa',geometry:{type:'FeatureCollection',features:states.features.filter(f=>Number(f.id)<=56)}}];
 for(const [id,name] of [['06','California'],['48','Texas'],['36','New York'],['12','Florida'],['53','Washington'],['08','Colorado'],['17','Illinois'],['37','North Carolina'],['04','Arizona'],['26','Michigan'],['42','Pennsylvania'],['25','Massachusetts']])result.push({id:name.toLowerCase().replaceAll(' ','-'),name,projection:'mercator',geometry:{type:'FeatureCollection',features:counties.features.filter(f=>f.id.startsWith(id))}});
 // Representative points must lie inside the real polygon, not in its bbox/ocean.
 for(const region of result)region.points=region.geometry.features.map(f=>{
  let p=geoCentroid(f);if(!geoContains(f,p)){
   const [a,b]=geoBounds(f);let found=false;
   for(let y=1;y<60&&!found;y++)for(let x=1;x<60&&!found;x++){const q=[a[0]+(b[0]-a[0])*x/60,a[1]+(b[1]-a[1])*y/60];if(geoContains(f,q)){p=q;found=true;}}
   if(!found)throw new Error(`No interior point: ${region.id}/${f.id}`);
  }
  return {feature:f.id,coordinates:p};
 });
 return {regions:result,source:{url:'https://github.com/topojson/us-atlas',package:'us-atlas@3.0.1',boundary_vintage:2017,license:'ISC',description:'US Census cartographic boundaries distributed by US Atlas; synthetic measurements, not current administrative-boundary claims.',states_sha256:createHash('sha256').update(statesRaw).digest('hex'),counties_sha256:createHash('sha256').update(countiesRaw).digest('hex')}};
}
