import {renderRandomized} from './randomized-renderer';
import {facetIndex} from './quality-rules.mjs';
import { renderBasis } from './basis-renderer';
import { renderNested } from './nested-renderer';
import { prepareExtendedSource, renderGeographic } from './extended-renderer';
import { axisBottom, axisLeft, scaleLinear, scaleLog, scalePoint, scaleUtc, select, symbol, symbolCircle, symbolSquare, symbolDiamond, symbolTriangle, symbolCross, symbolStar } from 'd3';
import { prepareChartData } from './vendor/visbricks/utils/chartDataPipeline';
import { renderDeterministicChart, chartScalePosition } from './vendor/visbricks/utils/semanticRenderer';
import { getChartBlockSpecification, getChartBlockSpecifications } from './vendor/visbricks/chart-blocks/registry';
import { hasRequiredChartEncodings } from './vendor/visbricks/utils/chartTemplates';
import { globalPalette } from './vendor/visbricks/config/global';
import { csvRowKey } from './vendor/visbricks/utils/csvDataEngine';
import { defaultColorMapping } from './vendor/visbricks/utils/visualMapping';
import { normalizedPolarRadialBoundaries, polarConcatAxisLayout } from './vendor/visbricks/utils/polarConcatLayout';
import { asNode, leafIds, anchorFields } from './composition.mjs';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]!);
const shapes = { circle: symbolCircle, square: symbolSquare, diamond: symbolDiamond, triangle: symbolTriangle, cross: symbolCross, star: symbolStar };
const defaultPalette = ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377'];
const defaultGradient = ['#eff3ff', '#bdd7e7', '#6baed6', '#3182bd', '#08519c'];

function boundFields(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(boundFields);
  return Object.entries(value).flatMap(([key, item]) => key === 'field' && typeof item === 'string'
    ? [item] : boundFields(item));
}

function svgDocument(content: string) {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Renderer produced malformed SVG');
  return doc.documentElement;
}

// Axis labels and point symbols are presentation supplied by this offline adapter.
// Mark geometry, data preparation, and scales come from the pinned VisBricks renderer.
function axisMarkup(result: any, spec: any, guide: any, fontSize: number, placement: any = {}) {
  if (!result.scales || guide.type !== 'Cartesian') return '';
  const root = svgDocument('');
  const plot = result.plotArea;
  const left = placement.left ?? plot.x;
  const bottom = placement.bottom ?? plot.y + plot.height;
  for (const channel of ['x', 'y']) {
    if (spec.axes?.[channel]?.visible === false) continue;
    const scaleSpec = result.scales[channel];
    if (!scaleSpec) continue;
    const scale: any = scaleSpec.type === 'point' ? scalePoint().domain(scaleSpec.domain).padding(0.5)
      : scaleSpec.type === 'utc' ? scaleUtc().domain(scaleSpec.domain.map((v: string) => new Date(v)))
      : scaleSpec.type === 'log' ? scaleLog().domain(scaleSpec.domain) : scaleLinear().domain(scaleSpec.domain);
    scale.range(scaleSpec.range);
    const axis: any = channel === 'x' ? axisBottom(scale) : axisLeft(scale);
    if (scaleSpec.type !== 'point') axis.ticks(4);
    if (spec.axes?.[channel]?.labelsVisible === false) axis.tickFormat(() => '');
    const group = select(root).append('g').attr('data-offline-axis', channel)
      .attr('transform', channel === 'x' ? `translate(0,${bottom})` : `translate(${left},0)`);
    group.call(axis).attr('font-family', 'Arial, sans-serif').attr('font-size', fontSize).attr('color', '#334155');
    const field = spec.encodings[channel]?.field;
    if (field && spec.axes?.[channel]?.labelsVisible !== false) {
      select(root).append('text').attr('x', channel === 'x' ? plot.x + plot.width / 2 : left)
        .attr('y', channel === 'x' ? bottom + fontSize * 3 : plot.y - fontSize)
        .attr('text-anchor', channel === 'x' ? 'middle' : 'start').attr('font-family', 'Arial, sans-serif')
        .attr('font-size', fontSize).attr('fill', '#334155').text(field);
    }
  }
  return root.innerHTML;
}

function render(scene: any) {
  if (scene.composition?.type === 'randomized') return renderRandomized(scene);
  if (scene.charts.every((chart:any)=>chart.spec.chartType==='OfflineNestedIdiom')) return renderNested(scene);
  if (!CSS.supports('color', scene.background)) throw new Error('background must be a CSS color');
  const appearance = scene.appearance ?? {};
  const palette = appearance.palette ?? defaultPalette;
  const gradient = appearance.gradient ?? defaultGradient;
  for (const colors of [palette, gradient]) {
    if (!Array.isArray(colors) || colors.length < 2 || colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
      throw new Error('palette and gradient must contain at least two six-digit hex colors');
    }
  }
  const pointShape = appearance.pointShape ?? 'circle';
  if (!(pointShape in shapes)) throw new Error(`Unknown pointShape: ${pointShape}`);
  const fontSize = appearance.fontSize ?? 11;
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 20) throw new Error('fontSize must be in [8, 20]');
  // Mutate arrays in place because native modules keep references to the palette.
  globalPalette.categorical.splice(0, globalPalette.categorical.length, ...palette);
  globalPalette.gradient.splice(0, globalPalette.gradient.length, ...gradient);
  defaultColorMapping.stops = gradient.map((color: string, index: number) => ({
    offset: index / (gradient.length - 1), color,
  }));
  const charts = new Map<string, any>(scene.charts.map((chart: any) => [chart.id, chart]));
  let instance = 0;

  function draw(id: string, frame: any, filters: any = {}, options: any = {}) {
    const axes = options.axes !== false;
    const chart = charts.get(id);
    if (!chart) throw new Error(`Unknown chart reference: ${id}`);
    const spec = structuredClone(chart.spec);
    if (spec.chartType === 'OfflineBasisIdiom') return renderBasis(chart, scene.datasets, frame, filters, {...appearance,palette,gradient,pointShape}, options);
    const block = getChartBlockSpecification(spec.chartType);
    if (!block) throw new Error(`${id}: unknown chartType ${spec.chartType}; use --list-types`);
    if (block.coordinateSystem === 'Geographic' && !chart.geo) throw new Error(`${id}: geographic charts require offline geo configuration`);
    if (spec.link) throw new Error('Graph Link composition requires the editor; spec.link is not supported');
    const extended = prepareExtendedSource(chart, scene.datasets, filters);
    const source = extended.source;
    if (extended.parallelFields) spec.parallelFields = extended.parallelFields;
    if(chart.parallel?.axisOrientation==='horizontal'){
      const {dimension,value,recordKey}=chart.parallel;
      const original=scene.datasets.find((d:any)=>d.id===spec.datasetId);
      const adapted={...original,rows:original.rows.map((r:any)=>({...r,_series:r[recordKey]}))};
      const parallel={...chart,spec:{...spec,offlineVariation:'parallel_coordinates',encodings:{...spec.encodings,x:{field:value,type:'quantitative'},y:{field:dimension,type:'nominal'}},offlineAnchorFields:[],offlineOptions:{parallelDimension:dimension,parallelValue:value,axisOrientation:'horizontal',categoricalFields:original.columns.filter((c:any)=>c.type!=='quantitative').map((c:any)=>c.name)}}};
      return renderBasis(parallel,[adapted],frame,filters,{...appearance,palette,gradient,pointShape},options);
    }
    if (chart.geo) return renderGeographic(chart, source, frame, filters, { ...appearance, palette, gradient, pointShape });
    if (!source) throw new Error(`${id}: unknown dataset ${spec.datasetId}`);
    for (const field of Object.keys(filters)) {
      if (!source.columns.some((column: any) => column.name === field)) throw new Error(`${id}: inherited filter field ${field} is absent`);
    }
    spec.filters = { ...spec.filters, ...filters };
    const chartId = `${id}-instance-${++instance}`;
    const prepared = prepareChartData(chartId, source, spec);
    // The native structural inference may select a numeric edge column. The
    // current v3 link target has no value/width encoding, so keep links constant.
    if (chart.graph) delete prepared.chartSpec.encodings.value;
    if (!prepared.dataset.rows.length) throw new Error(`${id}: composition filter produced no rows`);
    const fields = new Set(prepared.dataset.columns.map((column: any) => column.name));
    for (const field of boundFields({
      encodings: prepared.chartSpec.encodings, roleBindings: prepared.chartSpec.roleBindings,
      series: prepared.chartSpec.series, seriesFields: prepared.chartSpec.seriesFields,
      valueFields: prepared.chartSpec.valueFields, angleFields: prepared.chartSpec.angleFields,
      parallelFields: prepared.chartSpec.parallelFields,
    })) {
      if (!fields.has(field)) throw new Error(`${id}: unknown data field ${field}`);
    }
    if (!hasRequiredChartEncodings(prepared.chartSpec)) throw new Error(`${id}: missing required bindings for ${spec.chartType}`);
    if (chart.projection === 'polar' && !options.polar) throw new Error(`${id}: polar projection needs a Polar composition`);
    if (options.polar && block.coordinateSystem !== 'Polar' && chart.projection !== 'polar') throw new Error(`${id}: Cartesian chart cannot occupy a Polar composition cell`);
    const coordinateGuide = options.polar ? {
      type: 'Polar', origin: { x: frame.width / 2, y: frame.height / 2 },
      radius: Math.min(frame.width, frame.height) * 0.38,
      radiusScale: chart.projection === 'polar' ? 0.38 / 0.42 : 1,
      angleOffset: options.polar.startAngle, angleSpan: options.polar.angleSpan,
      innerRadiusRatio: options.polar.innerRadiusRatio, outerRadiusRatio: options.polar.outerRadiusRatio,
      showDiscreteLabels: false,
    } : chart.coordinateGuide ?? (block.coordinateSystem === 'Polar' ? {
      type: 'Polar', origin: { x: frame.width / 2, y: frame.height / 2 },
      radius: Math.min(frame.width, frame.height) / 2 - (axes ? 12 : 2), angleOffset: 0, angleSpan: 360,
      showDiscreteLabels: axes,
    } : { type: 'Cartesian', origin: { x: 0, y: frame.height }, xDirection: 1, yDirection: -1 });
    if (appearance.pieLabels && axes && Math.min(frame.width, frame.height) >= 140 && ['PieChart', 'DonutChart'].includes(spec.chartType)) {
      prepared.chartSpec.markGroups ??= [];
      let arcGroup = prepared.chartSpec.markGroups.find((group: any) => group.role === 'arc');
      if (!arcGroup) {
        arcGroup = { id: `${chartId}-arc-labels`, role: 'arc', sharedConfig: {} } as any;
        prepared.chartSpec.markGroups.push(arcGroup!);
      }
      arcGroup!.sharedConfig.labelsVisible = true;
    }
    const result = renderDeterministicChart({
      chartId, chartSpec: prepared.chartSpec, dataset: prepared.dataset,
      width: frame.width, height: frame.height, minX: 0, minY: 0, coordinateGuide,
      nestedChildFrames: options.treeChildFrame && spec.chartType === 'Dendrogram'
        ? prepared.dataset.rows.map((row:any)=>({...options.treeChildFrame,parentDataKey:JSON.stringify({nodeKey:row[spec.encodings.key.field]}),shape:'rect'})) : undefined,
      polarConcatDirection: options.polarConcatDirection,
      polarFacetCell: options.polar && (options.polarFacet || chart.projection === 'polar') ? options.polar : undefined,
    });
    if (!result.content) throw new Error(`${id}: renderer produced empty SVG`);
    const root = svgDocument(result.content);
    if (options.linksId) {
      const group = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg','g');
      group.setAttribute('data-offline-chart', options.linksId);
      root.querySelectorAll('[data-mark-role="link"]').forEach(link => group.append(link));
      root.insertBefore(group, root.firstChild);
    }
    for (const element of Array.from(root.querySelectorAll('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        if (['d', 'x', 'y', 'cx', 'cy', 'r', 'width', 'height', 'transform'].includes(attribute.name)
          && /NaN|Infinity/.test(attribute.value)) throw new Error(`${id}: non-finite SVG geometry`);
      }
    }
    const shapeField = spec.encodings.shape?.field;
    const shapeNames = Object.keys(shapes);
    const shapeValues = shapeField ? [...new Set(source.rows.map((row: any) => row[shapeField]))] : [];
    if (shapeValues.length > shapeNames.length) throw new Error('shape supports at most six distinct values');
    const rowsByKey = new Map(prepared.dataset.rows.map((row: any, index: number) => [csvRowKey(prepared.dataset, row, index), row]));
    const anchors: any[] = [];
    const anchorIssues: any[] = [];
    if (['Scatterplot', 'SingleBarChart'].includes(spec.chartType)) {
      const xField = spec.encodings.x?.field;
      const yField = spec.encodings.y?.field;
      if (xField && yField) {
        for (const mark of Array.from(root.querySelectorAll('[data-mark-role="point"], rect[data-mark-role="bar"]'))) {
          let row: any;
          let cx: number;
          let cy: number;
          if (mark.tagName === 'circle') {
            row = rowsByKey.get(mark.getAttribute('data-row-key') ?? '');
            cx = Number(mark.getAttribute('cx'));
            cy = Number(mark.getAttribute('cy'));
          } else {
            if (spec.axisSwapped) throw new Error('Swapped bar anchoring is not supported');
            const category = mark.getAttribute('data-category-key');
            const value = mark.getAttribute('data-value');
            const candidates = prepared.dataset.rows.filter((item: any) => item[xField] === category && Number(item[yField]) === Number(value));
            // Do not invent a join from a raw row when the bar shows an aggregate.
            if (candidates.length !== 1) {
              anchorIssues.push({ chart: id, message: 'Bar anchor does not identify exactly one source row (aggregation or duplicate keys)' });
              continue;
            }
            row = candidates[0];
            cx = Number(mark.getAttribute('x')) + Number(mark.getAttribute('width')) / 2;
            cy = Number(mark.getAttribute('y')) + (Number(value) < 0 ? Number(mark.getAttribute('height')) : 0);
          }
          if (row) anchors.push({ chart: id, x: frame.x + cx, y: frame.y + cy,
            filters: { ...filters, [xField]: row[xField], [yField]: row[yField] },
            fields: [xField, yField], row });
          else anchorIssues.push({ chart: id, message: 'Point anchor has no matching source row' });
        }
      }
    }
    if (spec.chartType === 'Dendrogram' && spec.offlineAnchorFields) {
      const fields=spec.offlineAnchorFields;
      for (const mark of Array.from(root.querySelectorAll('g[data-mark-role="node"]'))) {
        const row:any=rowsByKey.get(mark.getAttribute('data-row-key') ?? '');
        const match=mark.getAttribute('transform')?.match(/^translate\(([-\d.e+]+)[ ,]+([-\d.e+]+)\)$/);
        if(!row || !match) throw new Error('Unable to resolve native tree node anchor');
        anchors.push({chart:id,x:frame.x+Number(match[1]),y:frame.y+Number(match[2]),filters:{...filters,...Object.fromEntries(fields.map((f:string)=>[f,row[f]]))},fields,row});
      }
    }
    if(options.treeChildFrame && spec.chartType === 'Dendrogram') root.querySelectorAll('g[data-mark-role="node"] > circle').forEach(node=>node.remove());
    const pointSelector = spec.chartType === 'ForceDirectedGraph' ? 'g[data-mark-role="node"] > circle' : 'circle[data-mark-role="point"]';
    for (const circle of Array.from(root.querySelectorAll(pointSelector))) {
      const row: any = rowsByKey.get(circle.getAttribute('data-row-key') ?? '');
      const name = shapeField ? shapeNames[shapeValues.indexOf(row?.[shapeField])] : pointShape;
      if (!name || !(name in shapes)) throw new Error(`${id}: unable to resolve point shape binding`);
      if (name === 'circle') continue;
      const node = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
      for (const attribute of Array.from(circle.attributes)) {
        if (!['cx', 'cy', 'r'].includes(attribute.name)) node.setAttribute(attribute.name, attribute.value);
      }
      const radius = Number(circle.getAttribute('r'));
      node.setAttribute('d', symbol().type(shapes[name as keyof typeof shapes]).size(Math.PI * radius * radius)()!);
      node.setAttribute('transform', `translate(${circle.getAttribute('cx')},${circle.getAttribute('cy')})`);
      node.setAttribute('data-offline-shape', name);
      circle.replaceWith(node);
    }
    const marks = root.innerHTML;
    const axis = axes && spec.chartType !== 'Dendrogram' ? axisMarkup(result, prepared.chartSpec, coordinateGuide, fontSize) : '';
    const polarAttributes = options.polar ? ` data-offline-polar-start="${options.polar.startAngle}" data-offline-polar-span="${options.polar.angleSpan}" data-offline-polar-inner="${options.polar.innerRadiusRatio}" data-offline-polar-outer="${options.polar.outerRadiusRatio}"` : '';
    const axisContent = `<g transform="translate(${frame.x},${frame.y})">${axis}</g>`;
    return { ...result, marks, axis, anchors, anchorIssues, axisContent, dataset: prepared.dataset, spec: prepared.chartSpec,
      content: `<g data-offline-chart="${escape(id)}" data-offline-frame="${frame.x},${frame.y},${frame.width},${frame.height}"${polarAttributes} transform="translate(${frame.x},${frame.y})">${marks}${axis}</g>` };
  }

  function combine(parts: any[], decoration = '', attributes = ''): any {
    return { content: `<g${attributes}>${decoration}${parts.map((part) => part.content).join('')}</g>`,
      axisContent: parts.map((part) => part.axisContent).join(''), anchors: parts.flatMap((part) => part.anchors), units: parts.flatMap(part=>part.units??[]),
      anchorIssues: parts.flatMap((part) => part.anchorIssues ?? []) };
  }
  function initialPolar(node: any, options: any) {
    return options.polar ?? { startAngle: node.angleOffset ?? -90, angleSpan: node.angleSpan ?? 360,
      innerRadiusRatio: node.innerRadiusRatio ?? 0.14, outerRadiusRatio: 1 };
  }
  function polarLabel(text: string, frame: any, angle: number, radiusRatio: number, radial = false) {
    const radius = Math.min(frame.width, frame.height) * 0.38 * radiusRatio;
    const radians = angle * Math.PI / 180;
    const x = frame.x + frame.width / 2 + Math.cos(radians) * radius;
    const y = frame.y + frame.height / 2 + Math.sin(radians) * radius;
    const rotate = radial ? ` transform="rotate(${angle > 90 && angle < 270 ? angle + 180 : angle},${x},${y})"` : '';
    return `<text data-offline-facet-label="true" x="${x}" y="${y}"${rotate} font-family="Arial, sans-serif" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" fill="#334155" stroke="#fff" stroke-width="3" paint-order="stroke">${escape(text)}</text>`;
  }

  function compose(input: any, frame: any, filters: any = {}, options: any = {}): any {
    const node = asNode(input);
    if (frame.width < 16 || frame.height < 16) throw new Error('Composition cell is too small (minimum 16 × 16)');
    if (node.type === 'chart') return draw(node.chart, frame, filters, options);
    if (node.type === 'linked') {
      const base = compose(node.child, frame, filters, options);
      return combine([base, ...node.links.map((child:any) => compose(child, frame, filters, {...options,targetUnits:base.units}))], '', ' data-offline-composition="linked"');
    }
    if (node.type === 'network') return draw(node.nodes, frame, filters, {...options, linksId:node.links});
    if (node.type === 'layer') return combine(node.children.map((id:string,i:number)=>draw(id,frame,filters,{...options,geoBackground:i===0})), '', ' data-offline-composition="geo-layer"');
    if (node.type === 'concat') {
      if(node.alignment) options={...options,sharedPosition:node.alignment};
      if (['radial', 'angular'].includes(node.direction)) {
        const polar = initialPolar(node, options);
        const ids = node.children.map((_: any, index: number) => `member-${index}`);
        const links = ids.slice(1).map((id: string, index: number) => ({ sourceNodeId: id, targetNodeId: ids[index],
          direction: node.direction, position: 'after', sharedChannels: [] }));
        // Use the same axis graph and radial-boundary normalization as the editor.
        const layout = polarConcatAxisLayout(ids, links as any, node.direction);
        const boundaries = normalizedPolarRadialBoundaries({ polarRadialBoundaries: node.radialBoundaries } as any, layout.count);
        const parts = node.children.map((child: any, index: number) => {
          const slot = layout.positions.get(ids[index])!;
          const cell = { ...polar };
          if (node.direction === 'radial') {
            const span = polar.outerRadiusRatio - polar.innerRadiusRatio;
            cell.innerRadiusRatio = polar.innerRadiusRatio + span * boundaries[slot]!;
            cell.outerRadiusRatio = polar.innerRadiusRatio + span * boundaries[slot + 1]!;
          } else {
            cell.startAngle = polar.startAngle + polar.angleSpan * slot / layout.count;
            cell.angleSpan = polar.angleSpan / layout.count;
          }
          return compose(child, frame, filters, { ...options, polar: cell, polarConcatDirection: node.direction });
        });
        return combine(parts, '', ` data-offline-composition="polar-concat" data-direction="${node.direction}"${node.alignment?' data-position-contract="'+escape(JSON.stringify(node.alignment))+'"':''}`);
      }
      if (options.polar) throw new Error('Cartesian concat cannot consume a Polar cell');
      const horizontal = node.direction === 'horizontal';
      const gap = node.gap ?? 24;
      const count = node.children.length;
      return combine(node.children.map((child: any, index: number) => {
        const weights = node.weights ?? node.children.map(() => 1);
        const total = weights.reduce((a:number,b:number)=>a+b,0);
        const extent = (horizontal ? frame.width : frame.height) - gap * (count - 1);
        const length = extent * weights[index] / total;
        const offset = extent * weights.slice(0,index).reduce((a:number,b:number)=>a+b,0) / total + index * gap;
        const width = horizontal ? length : frame.width;
        const height = horizontal ? frame.height : length;
        return compose(child, { x: frame.x + (horizontal ? offset : 0),
          y: frame.y + (horizontal ? 0 : offset), width, height }, filters, options);
      }), '', ` data-offline-composition="concat"${node.alignment?' data-position-contract="'+escape(JSON.stringify(node.alignment))+'"':''}`);
    }
    if (node.type === 'facet') {
      const dataset = scene.datasets.find((item: any) => item.id === node.datasetId);
      if (!dataset || !dataset.columns.some((column: any) => column.name === node.field)) throw new Error('Facet field/dataset is missing');
      const rows = dataset.rows.filter((row: any) => Object.entries(filters).every(([key, value]) => row[key] === value));
      const values = [...new Set(rows.map((row: any) => row[node.field]))];
      if (values.length < 2) throw new Error(`Facet field ${node.field} must have at least two visible values`);
      if (node.coordinateSystem === 'Polar') {
        const polar = initialPolar(node, options);
        const labels: string[] = [];
        const parts = values.map((value, index) => {
          const cell = { ...polar };
          if (node.direction === 'angular') {
            cell.startAngle = polar.startAngle + index * polar.angleSpan / values.length;
            cell.angleSpan = polar.angleSpan / values.length;
            const angularGap = Math.min(3, cell.angleSpan * 0.04);
            cell.startAngle += angularGap;
            cell.angleSpan -= angularGap * 2;
            cell.columnValue = String(value);
            labels.push(polarLabel(`${node.field} = ${value}`, frame, cell.startAngle + cell.angleSpan / 2, polar.outerRadiusRatio + 0.13));
          } else {
            const span = (polar.outerRadiusRatio - polar.innerRadiusRatio) / values.length;
            cell.innerRadiusRatio = polar.innerRadiusRatio + index * span;
            cell.outerRadiusRatio = cell.innerRadiusRatio + span;
            // A small fixed gutter makes independent radius bands visible even
            // when adjacent bars use the same category color and reach a maximum.
            cell.innerRadiusRatio += span * 0.025;
            cell.outerRadiusRatio -= span * 0.025;
            cell.rowValue = String(value);
            labels.push(polarLabel(`${node.field} = ${value}`, frame, cell.startAngle + 2,
              (cell.innerRadiusRatio + cell.outerRadiusRatio) / 2, true));
          }
          return compose(node.child, frame, { ...filters, [node.field]: value }, { ...options, polar: cell, polarFacet: true });
        });
        const result = combine(parts, '', ` data-offline-composition="polar-facet" data-field="${escape(node.field)}" data-direction="${node.direction}"`);
        result.content += labels.join('');
        return result;
      }
      if (options.polar) throw new Error('Cartesian facet cannot consume a Polar cell');
      const shared=options.sharedPosition;
      if(shared?.field===node.field && ['x','y'].includes(shared.axis)) {
        const horizontal=shared.axis==='x', count=shared.domain.length;
        const start=horizontal?frame.x+46:frame.y+32;
        const span=horizontal?frame.width-64:frame.height-70, step=span/count;
        return combine(shared.domain.map((value:any,index:number)=>{
          const center=start+(index+.5)*step;
          const cell=horizontal?{x:center-step*.47,y:frame.y,width:step*.94,height:frame.height}:{x:frame.x,y:center-step*.47,width:frame.width,height:step*.94};
          const label=24;
          const result=compose(node.child,{...cell,y:cell.y+label,height:cell.height-label},{...filters,[node.field]:String(value)},{...options,sharedPosition:undefined});
          return {...result,content:`<g data-position-facet="${escape(node.field)}" data-position-value="${escape(value)}" data-position-axis="${shared.axis}" data-position-coordinate="${center}"><rect data-facet-border="true" x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="none" stroke="#aab8c5"/><text x="${cell.x+10}" y="${cell.y+16}" font-size="11" font-family="Arial" fill="#334155">${escape(value)}</text>${result.content}</g>`};
        }),'',' data-offline-composition="aligned-facet"');
      }
      const columns = Math.min(node.columns ?? 2, values.length);
      const rowCount = Math.ceil(values.length / columns);
      const gap = node.gap ?? 24;
      const width = (frame.width - gap * (columns - 1)) / columns;
      const height = (frame.height - gap * (rowCount - 1)) / rowCount;
      return combine(values.map((value, index) => {
        const [col,row]=facetIndex(index,values.length,columns,node.flow);
        const x = frame.x + col * (width + gap);
        const y = frame.y + row * (height + gap);
        const labelHeight = node.labelHeight ?? 24;
        const title = `<text x="${x + 12}" y="${y + Math.min(14, labelHeight - 2)}" font-family="Arial, sans-serif" font-size="${fontSize}" fill="#334155">${appearance.showFieldLabels===false?'':escape(node.field)+' = '}${escape(value)}</text>`;
        const result = compose(node.child, { x, y: y + labelHeight, width, height: height - labelHeight }, { ...filters, [node.field]: value }, options);
        return { ...result, content: `<rect data-facet-border="true" x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="#aab8c5" stroke-width="1.2"/>` + title + result.content };
      }), '', ' data-offline-composition="facet"');
    }
    if (node.type === 'nested') {
      if (options.polar) throw new Error('Nested anchors currently require Cartesian parent coordinates');
      const parentIds = leafIds(node.parent);
      const anchorId = node.anchorChart ?? parentIds[0];
      const anchorSpec = charts.get(anchorId)?.spec;
      if (!anchorSpec) throw new Error(`Unknown nested anchor ${anchorId}`);
      anchorFields(anchorSpec);
      const width = node.width ?? node.size ?? 52;
      const height = node.height ?? node.size ?? 52;
      const dx = node.offsetX ?? 0;
      const dy = node.offsetY ?? 0;
      // Reserve the entire child footprint, including constant offsets, before
      // obtaining anchors from native marks. Never crop edge children silently.
      const insetX = width / 2 + Math.abs(dx);
      const insetY = height / 2 + Math.abs(dy);
      const parentFrame = { x: frame.x + insetX, y: frame.y + insetY,
        width: frame.width - 2 * insetX, height: frame.height - 2 * insetY };
      const treeParent = anchorSpec.chartType === 'Dendrogram';
      const parent = compose(node.parent, parentFrame, filters, treeParent ? {...options,treeChildFrame:{width,height,offset:{x:dx,y:dy}}} : options);
      const issue = parent.anchorIssues?.find((item: any) => item.chart === anchorId);
      if (issue) throw new Error(`${anchorId}: ${issue.message}`);
      const anchors = parent.anchors.filter((anchor: any) => anchor.chart === anchorId);
      if (!anchors.length) throw new Error(`Nested parent ${anchorId} has no unambiguous native anchors`);
      const seen = new Set();
      const childNode = asNode(node.child);
      const simplePolarChild = childNode.type === 'chart' && ['PieChart', 'DonutChart'].includes(charts.get(childNode.chart)?.spec.chartType);
      const parts = anchors.map((anchor: any) => {
        const key = JSON.stringify(anchor.filters);
        if (seen.has(key)) throw new Error('Nested anchor fields must identify a unique mark');
        seen.add(key);
        const childFrame = { x: anchor.x + dx - width / 2, y: anchor.y + dy - height / 2, width, height };
        const result = compose(node.child, childFrame, anchor.filters, { axes: node.childAxes ?? !simplePolarChild });
        const backdrop = treeParent ? `<rect x="${childFrame.x}" y="${childFrame.y}" width="${width}" height="${height}" rx="3" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.7"/>` : '';
        return { ...result, content: `<g data-offline-nested-anchor="${escape(anchorId)}" data-anchor-x="${anchor.x}" data-anchor-y="${anchor.y}" data-anchor-filter="${escape(JSON.stringify(anchor.filters))}">${backdrop}${result.content}</g>` };
      });
      const outerAxis = node.parentVisible ? '' : `<g transform="translate(${parentFrame.x},${parentFrame.y})">${axisMarkup(parent, parent.spec, { type: 'Cartesian' }, fontSize, {
        left: -insetX + fontSize * 3, bottom: frame.height - insetY - fontSize * 4,
      })}</g>`;
      const visibleParent = node.parentVisible ? parent : { content: outerAxis, axisContent: outerAxis, anchors: [] };
      return combine([visibleParent, ...parts], '', ' data-offline-composition="nested"');
    }
    throw new Error(`Unsupported composition: ${node.type}`);
  }

  let content = scene.composition
    ? compose(scene.composition, { x: 24, y: 24, width: scene.width - 48, height: scene.height - 48 }).content
    : scene.charts.map((chart: any) => draw(chart.id, chart).content).join('');
  if(appearance.showFieldLabels===false)content=content.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g,(_all,start,label,end)=>{
    const clean=label.replace(/\b[FC]\d+\b\s*(?:=\s*)?/g,'').trim();return clean?start+clean+end:'';
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}"><rect width="100%" height="100%" fill="${escape(scene.background)}"/>${content}</svg>`;
}

(window as any).offlineRenderer = {
  render,
  listTypes: () => getChartBlockSpecifications()
    .filter((block) => block.coordinateSystem !== 'Geographic')
    .map((block) => ({ chartType: block.chartType, coordinateSystem: block.coordinateSystem, roles: block.roles })),
};
