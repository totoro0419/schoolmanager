import type {Category,RecordDoc} from './types';
import {normalize} from './model';
export function buildSearchIndex(docs:RecordDoc[],categories:Category[]){const names=new Map(categories.map(c=>[c.id,[c.name,...c.aliases].join(' ')]));return new Map(docs.map(d=>{const ids=[d.meta.primarySubjectId,...d.meta.topicIds,d.meta.materialTypeId,d.meta.series.id,...d.meta.tags];return [d.id,normalize([d.meta.title,d.meta.series.number,...ids.map(id=>id?names.get(id)||id:''),d.searchText].join(' '))];}));}
export function matchesQuery(index:Map<string,string>,id:string,q:string){return q.split(/\s+/).map(normalize).filter(Boolean).every(term=>(index.get(id)||'').includes(term));}
