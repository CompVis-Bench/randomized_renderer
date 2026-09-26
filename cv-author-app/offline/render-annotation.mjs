import {readFile} from 'node:fs/promises';
import path from 'node:path';

// Geometry audits replay construction inputs. Current semantic labels are
// independently checked by revise-annotations-v5.py against the v5 guidelines.
export async function readRenderAnnotation(out,sample){
 const current=JSON.parse(await readFile(path.join(out,sample.annotation),'utf8'));
 if(current.schema_version)return current;
 return JSON.parse(await readFile(path.join(out+'-specs',sample.sample_id+'.render-annotation.json'),'utf8'));
}
