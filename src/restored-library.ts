import {Unzip,UnzipInflate} from 'fflate';
import {addRestoredPrints} from './db';
import {sha256} from './hash';
import {attachment,loadPdf} from './pdf';
import {parsePublicCatalog} from './public-library';

const maxPdf=100*1024*1024;
const maxArchive=300*1024*1024;
const checksums='PDFファイルSHA256一覧.csv';

async function readArchive(file:File) {
  if(file.size>maxArchive)throw Error('復元PDFのZIPは300MB以内にしてください');
  const entries=new Map<string,Blob>();
  const names=new Set<string>();
  let total=0;
  const archive=new Unzip(entry=>{
    const name=entry.name;
    const pdf=/\.pdf$/i.test(name);
    if(!pdf&&name!==checksums)return;
    if(!/^[^/\\\x00-\x1f]+$/.test(name)||names.has(name)||names.size>=100)throw Error('ZIP内のファイル名が不正です');
    names.add(name);
    const limit=pdf?maxPdf:256*1024;
    if(entry.originalSize!==undefined&&entry.originalSize>limit)throw Error('ZIP内のファイルが大きすぎます');
    const chunks:BlobPart[]=[];
    let size=0;
    entry.ondata=(error,chunk,final)=>{
      if(error)throw error;
      size+=chunk.byteLength;
      total+=chunk.byteLength;
      if(size>limit||total>maxArchive)throw Error('ZIPの展開サイズが上限を超えています');
      chunks.push(chunk as Uint8Array<ArrayBuffer>);
      if(final){
        entries.set(name,new Blob(chunks,{type:pdf?'application/pdf':'text/csv'}));
        chunks.length=0;
      }
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
    }
    archive.push(new Uint8Array(),true);
  }finally{
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  if(names.size!==entries.size||!entries.has(checksums))throw Error('復元PDF一式の管理情報が見つかりません');
  return entries;
}

export async function importRestoredArchive(file:File,progress:(message:string)=>void) {
  const entries=await readArchive(file);
  const csv=await entries.get(checksums)!.text();
  entries.delete(checksums);
  const [header,...lines]=csv.trimEnd().split(/\r?\n/);
  if(!header.startsWith('file,bytes,sha256,pages,documentId,')||!entries.size||lines.length!==entries.size)throw Error('復元PDFとSHA-256一覧の件数が一致しません');
  const documents=[];
  const files:Blob[]=[];
  for(const [i,line] of lines.entries()){
    const [name,size,hash,pages,id]=line.split(',');
    const blob=entries.get(name);
    if(!blob||blob.size!==Number(size)||!/^[a-f0-9]{64}$/.test(hash))throw Error('SHA-256一覧に不整合があります');
    entries.delete(name);
    progress(`復元PDFを検証中 ${i+1} / ${lines.length}`);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(await sha256(bytes)!==hash)throw Error(`${name} のSHA-256が一致しません`);
    const task=loadPdf(bytes);
    try{
      const pdf=await task.promise;
      const meta=await attachment(pdf);
      if(!meta||meta.documentId!==id||pdf.numPages!==Number(pages))throw Error(`${name} の教材IDまたはページ数が一致しません`);
      documents.push({path:`pdfs/${hash}.pdf`,sha256:hash,pageCount:pdf.numPages,fileSize:blob.size,meta});
      files.push(blob);
    }finally{
      await task.destroy();
    }
  }
  const docs=parsePublicCatalog({version:1,documents});
  progress('検証済みの復元PDFをこの端末に保存中');
  const added=await addRestoredPrints(docs.map((doc,index)=>({
    doc:{...doc,publicPdfUrl:undefined,restoredPdf:true},file:files[index],
  })));
  return {added,total:docs.length};
}
