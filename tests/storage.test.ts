import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {initDB,saveDoc,getDocs,getFile,historyFor,snapshot,restoreSnapshot} from '../src/db';
import {emptyMetadata,manualDecision} from '../src/model';
import {sha256} from '../src/hash';
import type {RecordDoc} from '../src/types';
function record():RecordDoc{const meta=emptyMetadata('synthetic.pdf','a'.repeat(64));return {id:meta.documentId,meta,pageCount:1,fileSize:10,fileHash:'a'.repeat(64),searchText:'',favorite:false,lastOpenedAt:null,sync:'pending',remoteRevision:null,revision:1,deletedAt:null,warnings:[],hasText:false,hasThumbnail:false};}
describe('atomic local persistence, recovery and offline state',()=>{
 it('saves original and derived files together with metadata',async()=>{await initDB();const doc=record();const original=new Blob(['original']);await saveDoc(doc,{[doc.id+'/original']:original,[doc.id+'/derived']:new Blob(['derived'])});expect((await getDocs()).find(d=>d.id===doc.id)).toEqual(doc);expect(await (await getFile(doc.id+'/original'))!.text()).toBe('original');expect(doc.sync).toBe('pending');});
 it('detects stale revisions and keeps the earlier PDF intact',async()=>{const doc=record();await saveDoc(doc,{[doc.id+'/original']:new Blob(['keep'])});await saveDoc({...doc,revision:2},{},'update',1);await expect(saveDoc({...doc,revision:3},{[doc.id+'/original']:new Blob(['destroy'])},'stale',1)).rejects.toThrow('別の画面');expect(await (await getFile(doc.id+'/original'))!.text()).toBe('keep');});
 it('retains old classification in history',async()=>{const doc=record();await saveDoc(doc);const m=structuredClone(doc.meta);manualDecision(m,'subject','subject:physics');m.updatedAt='2030-01-01T00:00:00.000Z';await saveDoc({...doc,meta:m,revision:2},{},'manual edit',1);expect((await historyFor(doc.id))[0].meta.primarySubjectId).toBeNull();});
 it('supports reversible deletion and snapshot recovery without altering original bytes',async()=>{const doc=record();const blob=new Blob(['immutable original']);doc.fileHash=await sha256(await blob.arrayBuffer());await saveDoc(doc,{[doc.id+'/original']:blob});await saveDoc({...doc,deletedAt:new Date().toISOString(),revision:2},{},'trash',1);const saved=await snapshot();const before=await sha256(await (await getFile(doc.id+'/original'))!.arrayBuffer());await restoreSnapshot(saved,true);expect(await sha256(await (await getFile(doc.id+'/original'))!.arrayBuffer())).toBe(before);expect((await getDocs()).find(d=>d.id===doc.id)?.deletedAt).toBeTruthy();});
});
