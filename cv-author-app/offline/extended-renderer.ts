import { geoMercator, geoPath, geoArea, scaleLinear, scaleOrdinal, symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolCross, symbolStar } from 'd3';
const esc = (x:any) => String(x).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const shapes:any={circle:symbolCircle,square:symbolSquare,diamond:symbolDiamond,triangle:symbolTriangle,cross:symbolCross,star:symbolStar};

export function prepareExtendedSource(chart:any, datasets:any[], filters:any) {
  let source=datasets.find(d=>d.id===chart.spec.datasetId);
  const filtered=source.rows.filter((r:any)=>Object.entries(filters).every(([k,v])=>r[k]===v));
  if(chart.graph) {
    const g=chart.graph; const edges=datasets.find(d=>d.id===g.edges);
    const ids=new Set(filtered.map((r:any)=>r[g.key]));
    const edgeRows=edges.rows.filter((r:any)=>ids.has(r[g.source]) && ids.has(r[g.target]));
    const allIds=new Set(source.rows.map((r:any)=>r[g.key]));
    if(allIds.size!==source.rows.length || edges.rows.some((r:any)=>!allIds.has(r[g.source]) || !allIds.has(r[g.target]))) throw new Error('Graph requires unique node keys and valid edge endpoints');
    source={...source,rows:filtered,graph:{nodes:{columns:source.columns,rows:filtered},edges:{columns:edges.columns,rows:edgeRows}}};
  }
  if(chart.parallel) {
    const {dimension,value,recordKey}=chart.parallel;
    const names=[...new Set(filtered.map((r:any)=>r[dimension]))] as string[];
    if(names.length<2) throw new Error('Parallel plot needs at least two dimensions');
    const records=new Map<string,any>(); const seen=new Set();
    for(const row of filtered) {
      const id=row[recordKey], dim=row[dimension], key=JSON.stringify([id,dim]);
      if(seen.has(key)) throw new Error('Parallel record/dimension is not unique'); seen.add(key);
      const record=records.get(id) ?? {[recordKey]:id,...filters};
      const color=chart.spec.encodings.color?.field;
      if(color) {
        if(record[color]!==undefined && record[color]!==row[color]) throw new Error('Parallel color must be constant within a record');
        record[color]=row[color];
      }
      record[`axis_${names.indexOf(dim)}`]=row[value]; records.set(id,record);
    }
    if([...records.values()].some(r=>names.some((_,i)=>r[`axis_${i}`]===undefined))) throw new Error('Incomplete parallel record');
    const dimensions=names.map((name,i)=>({field:`axis_${i}`,type:'quantitative',label:name}));
    // Native renderer labels its fields, so use real dimension names after pivot.
    if(names.some(name=>source.columns.some((c:any)=>c.name===name))) throw new Error('Parallel dimension name collides with source field');
    for(const r of records.values()) names.forEach((name,i)=>{r[name]=r[`axis_${i}`];delete r[`axis_${i}`];});
    source={...source,rows:[...records.values()],primaryKey:[recordKey],columns:[...source.columns.filter((c:any)=>![dimension,value].includes(c.name)),...names.map(name=>({name,type:'quantitative'}))]};
    return {source,parallelFields:dimensions.map((d,i)=>({...d,field:names[i]}))};
  }
  return {source};
}

// Offline geographic adapter: local GeoJSON + Mercator, no Mapbox tiles/token.
// This deliberately declares its own provenance; it is not a deck.gl export.
export function renderGeographic(chart:any, source:any, frame:any, filters:any, appearance:any) {
  const {geo,spec}=chart; const e=spec.encodings;
  const rows=source.rows.filter((r:any)=>Object.entries(filters).every(([k,v])=>r[k]===v));
  const geometry=structuredClone(geo.geometry);
  if(geometry?.type!=='FeatureCollection' || !geometry.features?.length) throw new Error('Expected local GeoJSON FeatureCollection');
  for(const f of geometry.features) {
    if(!['Polygon','MultiPolygon'].includes(f.geometry?.type)) throw new Error('Offline geography supports Polygon/MultiPolygon');
    if(geoArea(f)>2*Math.PI) {
      const polygons=f.geometry.type==='Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polygons.forEach((p:any)=>p.forEach((ring:any)=>ring.reverse()));
    }
  }
  const b=geo.bounds;
  if(!Array.isArray(b)||b.length!==4||b.some((v:any)=>!Number.isFinite(v))||b[0]>=b[2]||b[1]>=b[3]) throw new Error('Invalid geographic bounds');
  const projection=geoMercator().fitExtent([[28,28],[frame.width-28,frame.height-28]],{type:'MultiPoint',coordinates:[[b[0],b[1]],[b[2],b[3]]]} as any);
  const path=geoPath(projection);
  const colors=appearance.palette;
  const gradient=appearance.gradient;
  const categories=e.color ? [...new Set(source.rows.map((r:any)=>r[e.color.field]))] : [];
  const numeric=e.color?.type==='quantitative';
  const values=e.color ? source.rows.map((r:any)=>Number(r[e.color.field])) : [0,1];
  const lo=Math.min(...values),hi=Math.max(...values);
  const color=numeric ? scaleLinear<string>().domain(gradient.map((_:any,i:number)=>lo+(hi-lo)*i/(gradient.length-1))).range(gradient) : scaleOrdinal().domain(categories).range(colors);
  const fill=(r:any)=>e.color ? color(numeric ? Number(r[e.color.field]) : r[e.color.field]) : colors[0];
  let marks=''; const anchors:any[]=[];
  if(spec.chartType==='PolygonLayer') {
    const byKey=new Map(rows.map((r:any)=>[r[geo.key],r]));
    if(byKey.size!==rows.length) throw new Error('Geographic join must be one row per polygon');
    const featureIds=new Set(geometry.features.map((f:any)=>String(f.properties.id)));
    if(rows.some((r:any)=>!featureIds.has(r[geo.key]))) throw new Error('Unmatched geographic key');
    marks=geometry.features.map((f:any)=>{
      const row:any=byKey.get(String(f.properties.id));
      return `<path data-mark-role="geo-area" data-feature-id="${esc(f.properties.id)}" d="${path(f) ?? ''}" fill="${row ? fill(row) : '#f1f5f9'}" stroke="#ffffff" stroke-width="1.2"/>`;
    }).join('');
  } else {
    const sizeValues=e.size ? source.rows.map((r:any)=>Number(r[e.size.field])) : [1,1];
    const size=scaleLinear().domain([Math.min(...sizeValues),Math.max(...sizeValues)]).range([30,180]);
    const shapeValues=e.shape ? [...new Set(source.rows.map((r:any)=>r[e.shape.field]))] : [];
    if(shapeValues.length>6) throw new Error('shape supports at most six categories');
    marks=rows.map((r:any)=>{
      const lon=Number(r[e.x.field]),lat=Number(r[e.y.field]);
      if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3]) throw new Error('Point outside geographic bounds');
      const [x,y]=projection([lon,lat])!;
      const name=e.shape ? Object.keys(shapes)[shapeValues.indexOf(r[e.shape.field])] : appearance.pointShape;
      const d=symbol().type(shapes[name]).size(e.size ? size(Number(r[e.size.field])) : 65)();
      anchors.push({chart:chart.id,x:frame.x+x,y:frame.y+y,filters:{...filters,[e.x.field]:r[e.x.field],[e.y.field]:r[e.y.field]},fields:[e.x.field,e.y.field],row:r});
      return `<path data-mark-role="geo-point" data-longitude="${lon}" data-latitude="${lat}" data-offline-shape="${name}" transform="translate(${x},${y})" d="${d}" fill="${fill(r)}" stroke="#ffffff" stroke-width="0.9"/>`;
    }).join('');
  }
  return {content:`<g data-offline-chart="${chart.id}" data-renderer="offline-geo-mercator-v1" transform="translate(${frame.x},${frame.y})">${marks}</g>`,axisContent:'',anchors,anchorIssues:[]};
}
