import {describe,it,expect} from 'vitest';
import {classify,discoverCategories,validateHierarchy} from '../src/classifier';
import {initialCategories,emptyMetadata,manualDecision,proposeCategory} from '../src/model';
import {validateMetadata} from '../src/schema';
import type {PageMap,RecordDoc,Category} from '../src/types';
const dict=initialCategories();const hash='a'.repeat(64);
function pages(texts:string[]):PageMap[]{return texts.map((text,i)=>({pdfPage:i+1,sourcePage:i+1,printedNumber:null,rotation:0,blank:null,duplicateOf:null,materialId:null,text}));}
function metadata(){return emptyMetadata('test.pdf',hash);}
function record(meta:ReturnType<typeof metadata>):RecordDoc{return {id:meta.documentId,meta,pageCount:1,fileSize:100,fileHash:hash,searchText:'',favorite:false,lastOpenedAt:null,sync:'pending',remoteRevision:null,revision:1,deletedAt:null,warnings:[],hasText:true,hasThumbnail:false};}
describe('course classification: explicit evidence and abstention',()=>{
 for(const cat of dict)it('recognizes exact printed '+cat.name,()=>{const m=classify(metadata(),pages([cat.name+'\n演習 No.3']),dict,[]);expect(m.primarySubjectId).toBe(cat.id);expect(m.review.subject.status).toBe('confirmed');});
 it('does not guess a math class from calculus content',()=>{const m=classify(metadata(),pages(['演習問題\n積分の計算をしなさい']),dict,[]);expect(m.primarySubjectId).toBeNull();expect(m.review.subject.status).toBe('unclassified');expect(m.review.subject.reason).toContain('数学演習');});
 it('does not guess English I II or III from English difficulty',()=>{const m=classify(metadata(),pages(['Read the following passage.\nA difficult text about economics.']),dict,[]);expect(m.primarySubjectId).toBeNull();expect(m.review.subject.reason).toContain('英語Ⅲ');});
 it('ignores a course name deep in a problem body',()=>{const m=classify(metadata(),pages(['考察問題\n以下を答えよ\n表を読め\n物理']),dict,[]);expect(m.review.subject.status).toBe('unclassified');});
 it('rejects contradictory printed courses in a combined PDF',()=>{const m=classify(metadata(),pages(['数学Ⅲ','数学演習']),dict,[]);expect(m.primarySubjectId).toBeNull();});
 it('retains ambiguity between metadata and actual print',()=>{const m=metadata();m.primarySubjectId='subject:math-practice';m.review.subject.status='confirmed';const result=classify(m,pages(['数学Ⅲ']),dict,[]);expect(result.review.subject.status).toBe('unclassified');expect(result.primarySubjectId).toBeNull();});
 it('does not trust AI confirmed/locked claims',()=>{const m=metadata();manualDecision(m,'subject','subject:english-3');const result=classify(m,pages(['An English passage']),dict,[]);expect(result.review.subject.status).toBe('tentative');expect(result.review.subject.locked).toBe(false);});
 it('does not treat AI OCR as independent evidence',()=>{const p=pages(['']);p[0].ocrText='数学Ⅲ';p[0].ocrVerified=false;const m=classify(metadata(),p,dict,[]);expect(m.review.subject.status).toBe('unclassified');});
 it('uses independently run OCR but checks the dictionary too',()=>{const p=pages(['']);p[0].ocrText='数学Ⅲ';p[0].ocrVerified=true;const m=classify(metadata(),p,dict,[]);expect(m.primarySubjectId).toBe('subject:math-3');});
 it('preserves a local user decision during rerun',()=>{const m=metadata();manualDecision(m,'subject','subject:math-practice');const result=classify(m,pages(['数学Ⅲ']),dict,[],true);expect(result.primarySubjectId).toBe('subject:math-practice');expect(result.review.subject.locked).toBe(true);});
 it('does not propagate a previous correction to a different document',()=>{const m=metadata();manualDecision(m,'subject','subject:math-practice');const result=classify(metadata(),pages(['積分 演習']),dict,[record(m)]);expect(result.primarySubjectId).toBeNull();});
});
describe('dynamic hierarchy, series, order, unknown types',()=>{
 const field={...proposeCategory(dict,'極限','field','subject:math-3','test'),status:'approved'} as Category;
 it('adds an unknown field as a bounded proposal',()=>{const result=discoverCategories(pages(['数学Ⅲ\n分野: 新しい分野']),dict);expect(result.cats).toHaveLength(1);expect(result.cats[0].status).toBe('proposed');expect(result.cats[0].parentId).toBe('subject:math-3');});
 it('does not create a synonym when an alias exists',()=>{const c={...field,aliases:['極限値']};const result=discoverCategories(pages(['数学Ⅲ\n分野: 極限値']),[...dict,c]);expect(result.cats).toHaveLength(0);expect(result.evidence[0].value).toBe(c.id);});
 it('does not confirm a topic under the wrong course',()=>{const m=metadata();m.primarySubjectId='subject:physics';m.topicIds=[field.id];const result=classify(m,pages(['物理']),[...dict,field],[]);expect(result.review.subject.status).toBe('confirmed');expect(result.review.topics.status).toBe('unclassified');});
 it('can retain a known course while the unit is unknown',()=>{const m=metadata();m.topicIds=['unknown'];const result=classify(m,pages(['数学Ⅲ']),dict,[]);expect(result.review.subject.status).toBe('confirmed');expect(result.review.topics.status).toBe('unclassified');});
 it('matches multiple explicit units without inventing a single unit',()=>{const a=proposeCategory(dict,'A','unit',null,'test'),b=proposeCategory(dict,'B','unit',null,'test');const m=metadata();m.topicIds=[a.id,b.id];const result=classify(m,pages(['数学Ⅲ']),[...dict,a,b],[]);expect(result.topicIds).toEqual([a.id,b.id]);expect(result.review.topics.status).toBe('tentative');});
 it('does not invent missing numbers in a series',()=>{const series=proposeCategory(dict,'演習','series',null,'test');const m=metadata();m.series.id=series.id;m.series.number='5';m.series.displayOrder=5;const old=metadata();old.series={id:series.id,number:'2',displayOrder:2,orderLocked:true};const result=classify(m,pages(['数学Ⅲ']),[...dict,series],[record(old)]);expect(result.series.number).toBe('5');expect(result.attributes.similarDocuments).toBeDefined();});
 it('flags a conflicting display order without replacing a locked one',()=>{const series=proposeCategory(dict,'演習','series',null,'test');const m=metadata();m.series.id=series.id;manualDecision(m,'order',4);const old=structuredClone(m);old.documentId='other';const result=classify(m,pages(['数学Ⅲ']),[...dict,series],[record(old)],true);expect(result.series.displayOrder).toBe(4);expect(result.series.orderLocked).toBe(true);expect(result.review.order.reason).toContain('同じ表示順');});
 it('keeps unknown material type available but unconfirmed',()=>{const m=metadata();m.materialTypeId='unknown-type';const result=classify(m,pages(['化学']),dict,[]);expect(result.materialTypeId).toBe('unknown-type');expect(result.review.materialType.status).toBe('unclassified');});
 it('limits unapproved proposals',()=>{const many=Array.from({length:20},(_,i)=>proposeCategory([],'topic '+i,'unit',null,'test'));expect(()=>proposeCategory(many,'new','unit',null,'test')).toThrow('20件');});
 it('rejects hierarchy cycles',()=>{const a=proposeCategory([],'a','field',null,'test'),b=proposeCategory([],'b','unit',a.id,'test');a.parentId=b.id;expect(()=>validateHierarchy([a,b],a)).toThrow('循環');});
 it('does not auto-confirm a series from external embeddings',()=>{const a=metadata(),b=metadata();a.attributes.embedding={model:'test',values:[1,0,0]};b.attributes.embedding={model:'test',values:[1,0,0]};const m=classify(a,pages(['unknown']),dict,[record(b)]);expect((m.attributes.similarDocuments as any[])[0].method).toBe('external-embedding');expect(m.review.series.status).toBe('unclassified');});
});
describe('metadata schema',()=>{
 it('accepts a valid partial classification with relations and extensible fields',()=>{const m=metadata();m.relations=[{documentId:'answer-id',type:'answer'}];m.attributes.specialNumber={prefix:'A',number:3};expect(validateMetadata(m)).toEqual(m);});
 it('rejects corrupt metadata',()=>expect(()=>validateMetadata({title:3})).toThrow());
 it('does not silently migrate an unknown schema version',()=>expect(()=>validateMetadata({...metadata(),schemaVersion:'99'})).toThrow());
});
