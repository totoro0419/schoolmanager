import {describe,it,expect} from 'vitest';
import {buildSearchIndex,matchesQuery} from '../src/search';
import {initialCategories,emptyMetadata} from '../src/model';
import type {RecordDoc} from '../src/types';
describe('metadata-only local search index',()=>{
 it('matches multiple conditions, full-width forms and course aliases without opening PDFs',()=>{const meta=emptyMetadata('極限 No.１２.pdf','a'.repeat(64));meta.primarySubjectId='subject:math-3';const doc={id:meta.documentId,meta,searchText:'関数の極限'} as RecordDoc;const index=buildSearchIndex([doc],initialCategories());expect(matchesQuery(index,doc.id,'数学Ⅲ 極限 12')).toBe(true);expect(matchesQuery(index,doc.id,'英語Ⅰ')).toBe(false);});
 it('does not claim unrecognized image text is searchable',()=>{const meta=emptyMetadata('画像.pdf','a'.repeat(64));const doc={id:meta.documentId,meta,searchText:''} as RecordDoc;expect(matchesQuery(buildSearchIndex([doc],initialCategories()),doc.id,'極限')).toBe(false);});
 it('builds and queries 10000 metadata records within a 2-second regression budget',()=>{const base=emptyMetadata('test.pdf','a'.repeat(64));const docs=Array.from({length:10000},(_,i)=>({id:'id-'+i,meta:{...base,title:'演習 '+i,primarySubjectId:'subject:math-practice'},searchText:'x + 3 = 5'} as RecordDoc));const start=performance.now();const index=buildSearchIndex(docs,initialCategories());const found=docs.filter(d=>matchesQuery(index,d.id,'演習 9999'));const elapsed=performance.now()-start;expect(found.map(x=>x.id)).toEqual(['id-9999']);expect(elapsed).toBeLessThan(2000);console.log('10000 metadata index + query:',Math.round(elapsed),'ms');});
});
