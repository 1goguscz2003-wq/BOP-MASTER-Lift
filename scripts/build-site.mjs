import {copyFile, cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const root=new URL('..',import.meta.url).pathname;
const web=join(root,'web');
const dist=join(root,'dist');

await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
await cp(web,dist,{recursive:true});
const app=await readFile(join(dist,'app.html'),'utf8');
await writeFile(join(dist,'index.html'),app);
await copyFile(join(dist,'worker.html'),join(dist,'w.html'));
await rm(join(dist,'app.html'));
