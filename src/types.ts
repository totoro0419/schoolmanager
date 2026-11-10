export type Kind = 'subject'|'field'|'unit'|'materialType'|'series'|'tag';
export type Status = 'confirmed'|'tentative'|'unclassified';
export type Field = 'subject'|'topics'|'materialType'|'series'|'number'|'order'|'tags';
export interface Category {id:string;name:string;aliases:string[];parentId:string|null;kind:Kind;description:string;status:'approved'|'proposed';createdAt:string;updatedAt:string;basis:string}
export interface Evidence {id:string;field:Field;kind:'user'|'series'|'printed'|'identifier'|'similarity'|'content';value:string;page:number|null;quote:string;reason:string;verified?:boolean}
export interface Decision {status:Status;reason:string;evidenceIds:string[];locked:boolean}
export interface PageMap {pdfPage:number;sourcePage:number;printedNumber:string|null;rotation:number;blank:boolean|null;duplicateOf:number|null;materialId:string|null;text?:string;ocrText?:string;ocrVerified?:boolean;handwriting?:'annotation'|'unverified'}
export interface Metadata {
 schemaVersion:'1.0.0';documentId:string;title:string;primarySubjectId:string|null;topicIds:string[];materialTypeId:string|null;
 series:{id:string|null;number:string|null;displayOrder:number|null;orderLocked:boolean};tags:string[];
 relations:{documentId:string;type:'answer'|'explanation'|'supplement'|'previous'|'next'|'revision'|'alternative'}[];
 source:{fileName:string;sha256:string;originalDocumentId:string|null;analysis:'text'|'external-ai'|'ocr'|'none'};
 pageMapping:PageMap[];review:Record<Field,Decision>;evidence:Evidence[];attributes:Record<string,unknown>;createdAt:string;updatedAt:string;
}
export interface RecordDoc {id:string;meta:Metadata;pageCount:number;fileSize:number;fileHash:string;searchText:string;favorite:boolean;lastOpenedAt:string|null;sync:'pending'|'synced'|'error'|'conflict';syncError?:string;remoteRevision:string|null;revision:number;deletedAt:string|null;warnings:string[];hasText:boolean;hasThumbnail:boolean}
export interface History {id:string;documentId:string;at:string;reason:string;meta:Metadata}
export interface Settings {syncUrl:string;remoteHead:string|null;autoSync:boolean}
export const fieldLabels:Record<Field,string>={subject:'教科',topics:'分野・単元',materialType:'教材タイプ',series:'シリーズ',number:'教材番号',order:'表示順',tags:'タグ'};
export const statusLabels:Record<Status,string>={confirmed:'確定',tentative:'仮分類',unclassified:'未分類'};
