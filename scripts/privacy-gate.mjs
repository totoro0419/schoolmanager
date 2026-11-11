import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,readdir,stat} from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const library='public/library/';
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const schema=JSON.parse(await readFile('public/printlib.schema.json','utf8'));
const ajv=new Ajv();
addFormats(ajv);
const validate=ajv.compile(schema);
const catalog=JSON.parse(await readFile(library+'catalog.json','utf8'));
const ids=new Set();
const approved=new Map();
if(catalog.version!==1||!Array.isArray(catalog.documents))throw Error('Invalid public catalog');
for(const entry of catalog.documents){
  const {path,sha256,pageCount,fileSize,meta}=entry;
  if(!/^[a-f0-9]{64}$/.test(sha256)||path!==`pdfs/${sha256}.pdf`||approved.has(path)||
      !validate(meta)||ids.has(meta.documentId)||!Number.isSafeInteger(pageCount)||pageCount<1||
      meta.pageMapping.length!==pageCount||meta.pageMapping.some((page,index)=>page.pdfPage!==index+1)||
      !Number.isSafeInteger(fileSize)||fileSize<1||fileSize>100*1024*1024){
    throw Error('Invalid public catalog entry');
  }
  approved.set(path,{sha256,fileSize});
  ids.add(meta.documentId);
}

for(const path of tracked){
  const isApproved=path.startsWith(library)&&approved.has(path.slice(library.length));
  if((/\.(pdf|zip)$/i.test(path)&&!isApproved)||/(^|\/)\.env(?!\.example$)/.test(path)||/^(data|fixtures)\//.test(path)){
    throw Error('Refusing to publish private-file path: '+path);
  }
}

async function checkBuild(dir){
  for(const item of await readdir(dir,{withFileTypes:true})){
    const path=dir+'/'+item.name;
    if(item.isDirectory())await checkBuild(path);
    else if(/\.(pdf|zip)$/i.test(path)&&!(path.startsWith('dist/library/')&&approved.has(path.slice('dist/library/'.length)))){
      throw Error('Unlisted build asset: '+path);
    }
  }
}
await checkBuild('dist');
for(const [path,{sha256,fileSize}] of approved){
  if(!tracked.includes(library+path))throw Error('Public PDF is not tracked: '+path);
  for(const dir of [library,'dist/library/']){
    const file=dir+path;
    if((await stat(file)).size!==fileSize)throw Error('Unexpected PDF file size: '+file);
    const hash=createHash('sha256');
    for await(const chunk of createReadStream(file))hash.update(chunk);
    if(hash.digest('hex')!==sha256)throw Error('Unexpected PDF SHA-256: '+file);
  }
}
if(!(await readFile(library+'catalog.json')).equals(await readFile('dist/library/catalog.json'))){
  throw Error('Built catalog differs from source');
}
console.log(`Privacy gate: ${approved.size} catalogued public PDFs and no unlisted PDF or ZIP files.`);
