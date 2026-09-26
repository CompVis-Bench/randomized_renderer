#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {basisChannels} from './basis-contracts.mjs';
import {palettes} from './recipes.mjs';

const guideline=await readFile(new URL('../../docs/prompt.txt',import.meta.url),'utf8');
const annotationChannels=Object.fromEntries([...guideline.matchAll(/^([a-z_/]+): ([^\n]+)$/gm)].map(([,name,channels])=>[name,channels.split(', ')]));
const source=`// Generated from docs/prompt.txt, basis-contracts.mjs and recipes.mjs.\n// Regenerate with: node offline/generate-randomized-browser-constants.mjs\nexport const annotationChannels=${JSON.stringify(annotationChannels)};\nexport const basisChannels=${JSON.stringify(basisChannels)};\nexport const palettes=${JSON.stringify(palettes)};\nexport const rng=(seed)=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};\n`;
await writeFile(new URL('./randomized-browser-constants.mjs',import.meta.url),source);
