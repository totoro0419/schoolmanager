import {Unzip,UnzipInflate} from 'fflate';
import {sha256} from './hash';

const MiB=1024*1024;
const maxZip=500*MiB;
const maxExpanded=600*MiB;
const maxPdf=100*MiB;
const maxEntries=1000;
const checksums='PDFファイルSHA256一覧.csv';

export interface ArchivePdf {
 name:string;
 file:Blob;
 expectedHash?:string;
 expectedPages?:number;
 expectedId?:string;
}

function safePath(value:string) {
 const path=value.replaceAll('\\','/');
 if(!path||path.startsWith('/')||/^[a-z]:/i.test(path)||/[\x00-\x1f]/.test(path)||path.split('/').some(segment=>segment==='.'||segment==='..'||!segment))throw Error('ZIP内に不正なファイル名があります');
 return path;
}

function basename(path:string){return path.slice(path.lastIndexOf('/')+1);}
function isRelevant(name:string){const base=basename(name);return /\.pdf$/i.test(base)||/\.bin$/i.test(base)||base==='catalog.json'||base===checksums||base==='manifest.json';}

export async function readZipEntries(file:File) {
 if(file.size>maxZip)throw Error('ZIPが500MBを超えています。分割して追加してください');
 if(!/\.zip$/i.test(file.name))throw Error('ZIPファイルを選択してください');
 const entries=new Map<string,Blob>();
 const names=new Set<string>();
 let expanded=0;
 let failure:Error|null=null;
 const fail=(reason:string)=>{if(!failure)failure=new Error(reason);};
 const archive=new Unzip(entry=>{
  if(entry.name.endsWith('/'))return;
  let name:string;
  try{name=safePath(entry.name);}catch(e){fail(String(e));return;}
  if(!isRelevant(name))return;
  if(names.has(name)||names.size>=maxEntries){fail('ZIPに重複したファイル名、または多すぎるファイルがあります');return;}
  names.add(name);
  const limit=/\.pdf$/i.test(name)?maxPdf:/\.bin$/i.test(name)?maxPdf:2*MiB;
  if(entry.originalSize!==undefined&&entry.originalSize>limit){fail(basename(name)+' が上限サイズを超えています');return;}
  const chunks:BlobPart[]=[];
  let size=0;
  entry.ondata=(error,chunk,final)=>{
   if(failure)return;
   if(error){fail(basename(name)+' の解凍に失敗しました');return;}
   size+=chunk.byteLength;expanded+=chunk.byteLength;
   if(size>limit||expanded>maxExpanded){fail('展開後のPDFが大きすぎます（上限600MB）');return;}
   chunks.push(chunk as Uint8Array<ArrayBuffer>);
   if(final)entries.set(name,new Blob(chunks,{type:/\.pdf$/i.test(name)?'application/pdf':'application/octet-stream'}));
  };
  entry.start();
 });
 archive.register(UnzipInflate);
 const reader=file.stream().getReader();
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   archive.push(value);
   if(failure)throw failure;
  }
  archive.push(new Uint8Array(),true);
  if(failure)throw failure;
 }catch(e){throw Error('ZIPを読み込めませんでした: '+String(e));}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(!entries.size)throw Error('ZIP内にPDFが見つかりませんでした');
 return entries;
}

function locate(entries:Map<string,Blob>,name:string) {
 const path=safePath(name);
 if(entries.has(path))return entries.get(path)!;
 const candidates=[...entries].filter(([key])=>key.endsWith('/'+path));
 if(candidates.length!==1)throw Error(path+' がZIP内で見つからないか重複しています');
 return candidates[0][1];
}

async function parseJson(entries:Map<string,Blob>,name:string) {
 const matching=[...entries].filter(([path])=>basename(path)===name);
 if(!matching.length)return null;
 if(matching.length>1)throw Error(name+' がZIP内で重複しています');
 try{return JSON.parse(await matching[0][1].text()) as any;}
 catch{throw Error(name+' のJSONが正しくありません');}
}

export async function archivePdfs(entries:Map<string,Blob>):Promise<ArchivePdf[]> {
 const backup=await parseJson(entries,'manifest.json');
 if(backup?.format==='printlib-backup-1')throw Error('これはバックアップZIPです。「設定とバックアップ」→「ZIPから復元」を使用してください（既存データの置き換えに注意）');
 const catalog=await parseJson(entries,'catalog.json');
 if(catalog?.format==='schoolmanager-public-library-1'){
  if(!Array.isArray(catalog.documents)||catalog.documents.length<1||catalog.documents.length>100)throw Error('catalog.jsonの教材件数が不正です');
  if(catalog.count!==undefined&&catalog.count!==catalog.documents.length)throw Error('catalog.jsonの件数が一致しません');
  const documents:ArchivePdf[]=[];
  for(const doc of catalog.documents){
   if(typeof doc?.fileName!=='string'||typeof doc?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(doc.sha256)||!Number.isSafeInteger(doc.pageCount)||doc.pageCount<1)throw Error('catalog.jsonのPDF情報が不正です');
   let file:Blob;
   const pdfCandidates=[...entries].filter(([name])=>/\.pdf$/i.test(name)&&basename(name)===doc.fileName);
   if(pdfCandidates.length===1){file=pdfCandidates[0][1];}
   else if(pdfCandidates.length>1)throw Error(doc.fileName+' が複数あります');
   else{
    if(!Array.isArray(doc.parts)||!doc.parts.length||doc.parts.length>300)throw Error(doc.fileName+' のPDF本体が見つかりません');
    const parts:Blob[]=[];
    for(const part of doc.parts){
     if(typeof part?.path!=='string'||!Number.isSafeInteger(part.size)||part.size<1||!/^[a-f0-9]{64}$/.test(part.sha256))throw Error('分割PDFの管理情報が不正です');
     const piece=locate(entries,part.path);
     if(piece.size!==part.size||await sha256(await piece.arrayBuffer())!==part.sha256)throw Error(doc.fileName+' の分割データが破損しています');
     parts.push(piece);
    }
    file=new Blob(parts,{type:'application/pdf'});
   }
   if(file.size!==doc.sizeBytes||file.size>maxPdf)throw Error(doc.fileName+' のファイルサイズが一致しません');
   documents.push({name:doc.fileName,file,expectedHash:doc.sha256,expectedPages:doc.pageCount,expectedId:doc.id});
  }
  return documents;
 }
 const csvEntries=[...entries].filter(([path])=>basename(path)===checksums);
 if(csvEntries.length>1)throw Error('PDFファイルSHA256一覧.csv が重複しています');
 if(csvEntries.length===1){
  const [header,...lines]=(await csvEntries[0][1].text()).trimEnd().split(/\r?\n/);
  if(!header.startsWith('file,bytes,sha256,pages,documentId,')||!lines.length)throw Error('SHA-256一覧の形式が不正です');
  const documents:ArchivePdf[]=[];
  for(const line of lines){
   const [name,bytes,hash,pages,id]=line.split(',');
   if(!name||!/^[a-f0-9]{64}$/.test(hash)||!Number.isSafeInteger(Number(bytes))||!Number.isSafeInteger(Number(pages))||Number(pages)<1||!id)throw Error('SHA-256一覧に不正な行があります');
   const file=locate(entries,name);
   if(!/\.pdf$/i.test(name)||file.size!==Number(bytes)||file.size>maxPdf)throw Error(name+' のサイズが一致しません');
   documents.push({name:basename(name),file,expectedHash:hash,expectedPages:Number(pages),expectedId:id});
  }
  return documents;
 }
 const pdfs=[...entries].filter(([path])=>/\.pdf$/i.test(path)&&!path.startsWith('__MACOSX/'));
 if(!pdfs.length)throw Error('PDFが見つかりません。分割データの場合はcatalog.jsonも含めてください');
 if(pdfs.length>100)throw Error('PDFは一度に100件以内で追加してください');
 return pdfs.sort(([a],[b])=>a.localeCompare(b,'ja',{numeric:true})).map(([path,file])=>({name:basename(path),file}));
}
