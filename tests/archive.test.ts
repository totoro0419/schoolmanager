import {describe,expect,it} from 'vitest';
import {strToU8,zipSync} from 'fflate';
import {archivePdfs,readZipEntries} from '../src/archive-entries';
import {sha256} from '../src/hash';

function sampleZip(files:Record<string,Uint8Array|string>) {
 const content=Object.fromEntries(Object.entries(files).map(([name,value])=>[name,typeof value==='string'?strToU8(value):value]));
 const bytes=zipSync(content,{level:0});
 return new File([bytes.slice().buffer],'import.zip',{type:'application/zip'});
}

describe('ZIP import formats and integrity checks',()=>{
 it('accepts normal PDF ZIPs and nested PDF directories',async()=>{
  const entries=await readZipEntries(sampleZip({'class/01.pdf':'%PDF-one','class/02.pdf':'%PDF-two','notes.txt':'ignored'}));
  const documents=await archivePdfs(entries);
  expect(documents.map(d=>d.name)).toEqual(['01.pdf','02.pdf']);
  expect(await documents[1].file.text()).toBe('%PDF-two');
 });
 it('accepts the restored 27-document catalog structure with binary parts',async()=>{
  const data=strToU8('%PDF-split-example');
  const first=data.subarray(0,7),second=data.subarray(7);
  const expectedHash=await sha256(data);
  const cat={format:'schoolmanager-public-library-1',count:1,documents:[{id:'doc-1',fileName:'01_教材.pdf',sha256:expectedHash,sizeBytes:data.length,pageCount:1,parts:[
   {path:'print-library/data/01/000.bin',size:first.length,sha256:await sha256(first)},
   {path:'print-library/data/01/001.bin',size:second.length,sha256:await sha256(second)},
  ]}]};
  const entries=await readZipEntries(sampleZip({
   'package/catalog.json':JSON.stringify(cat),
   'package/print-library/data/01/000.bin':first,
   'package/print-library/data/01/001.bin':second,
  }));
  const docs=await archivePdfs(entries);
  expect(docs).toHaveLength(1);
  expect(docs[0].expectedId).toBe('doc-1');
  expect(docs[0].expectedHash).toBe(expectedHash);
  expect(await docs[0].file.text()).toBe('%PDF-split-example');
 });
 it('accepts the original checksum CSV format',async()=>{
  const pdf=strToU8('%PDF-legacy');
  const hash=await sha256(pdf);
  const csv='file,bytes,sha256,pages,documentId,status\nlegacy.pdf,'+pdf.length+','+hash+',1,document-1,confirmed\n';
  const entries=await readZipEntries(sampleZip({'legacy.pdf':pdf,'PDFファイルSHA256一覧.csv':csv}));
  const docs=await archivePdfs(entries);
  expect(docs[0]).toMatchObject({name:'legacy.pdf',expectedHash:hash,expectedPages:1,expectedId:'document-1'});
 });
 it('rejects tampered catalog parts and preserves existing data',async()=>{
  const fake=strToU8('part');
  const catalog={format:'schoolmanager-public-library-1',count:1,documents:[{id:'doc',fileName:'bad.pdf',sha256:'a'.repeat(64),sizeBytes:4,pageCount:1,parts:[{path:'print-library/data/01/000.bin',size:4,sha256:'b'.repeat(64)}]}]};
  const entries=await readZipEntries(sampleZip({'catalog.json':JSON.stringify(catalog),'print-library/data/01/000.bin':fake}));
  await expect(archivePdfs(entries)).rejects.toThrow('破損');
 });
 it('prevents treating backup ZIPs as additive PDF archives',async()=>{
  const entries=await readZipEntries(sampleZip({'manifest.json':JSON.stringify({format:'printlib-backup-1'}),'files/doc/original.pdf':'%PDF'}));
  await expect(archivePdfs(entries)).rejects.toThrow('バックアップZIP');
 });
 it('rejects a ZIP without PDFs or a supported catalog',async()=>{
  const entries=await readZipEntries(sampleZip({'catalog.json':JSON.stringify({version:1,documents:[]})}));
  await expect(archivePdfs(entries)).rejects.toThrow('PDFが見つかりません');
 });
});
