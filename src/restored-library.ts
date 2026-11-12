import {addRestoredPrints} from './db';
import {sha256} from './hash';
import {attachment,loadPdf} from './pdf';
import {emptyMetadata} from './model';
import {parsePublicCatalog} from './public-library';
import {archivePdfs,readZipEntries} from './archive-entries';

export async function importRestoredArchive(file:File,progress:(message:string)=>void) {
 progress('ZIPを読み込んでいます');
 const entries=await readZipEntries(file);
 progress('PDFの一覧と分割データを確認しています');
 const items=await archivePdfs(entries);
 const documents=[];
 const files:Blob[]=[];
 for(const [index,item] of items.entries()){
  progress('PDFを検証中 '+(index+1)+' / '+items.length+'：'+item.name);
  const bytes=new Uint8Array(await item.file.arrayBuffer());
  const hash=await sha256(bytes);
  if(item.expectedHash&&item.expectedHash!==hash)throw Error(item.name+' のSHA-256が一致しません');
  const task=loadPdf(bytes);
  try{
   const pdf=await task.promise;
   if(pdf.numPages<1||pdf.numPages>2000||item.expectedPages&&item.expectedPages!==pdf.numPages)throw Error(item.name+' のページ数が一致しません');
   let meta=await attachment(pdf);
   if(!meta){
    if(item.expectedId)throw Error(item.name+' に埋込メタデータがありません');
    // Ordinary PDF ZIPs may not have printlib.json; preserve them without making up classifications.
    meta=emptyMetadata(item.name,hash);
    const mapping=[];
    for(let n=1;n<=pdf.numPages;n++){
     const page=await pdf.getPage(n);
     mapping.push({pdfPage:n,sourcePage:n,printedNumber:null,rotation:page.rotate,blank:null,duplicateOf:null,materialId:null,handwriting:'unverified' as const});
     page.cleanup();
    }
    meta.pageMapping=mapping;
   }
   if(item.expectedId&&item.expectedId!==meta.documentId)throw Error(item.name+' の教材IDが一致しません');
   if(meta.pageMapping.length!==pdf.numPages||meta.pageMapping.some((page,i)=>page.pdfPage!==i+1))throw Error(item.name+' のページ構成が不正です');
   documents.push({path:'pdfs/'+hash+'.pdf',sha256:hash,pageCount:pdf.numPages,fileSize:item.file.size,meta});
   files.push(item.file);
  }catch(e){throw Error(item.name+' を検証できませんでした: '+String(e));}
  finally{await task.destroy();}
 }
 const docs=parsePublicCatalog({version:1,documents});
 progress('検証済みのPDFを端末内に保存しています');
 const added=await addRestoredPrints(docs.map((doc,index)=>({
  doc:{...doc,publicPdfUrl:undefined,restoredPdf:true},file:files[index],
 })));
 return {added,total:docs.length};
}
