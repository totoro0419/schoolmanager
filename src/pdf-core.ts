import {PDFDocument,PDFName,degrees} from 'pdf-lib';
import {validateMetadata} from './schema';
import type {Metadata,PageMap} from './types';
export async function embedMetadata(bytes:Uint8Array,meta:Metadata,selection?:PageMap[]){validateMetadata(meta);const original=await PDFDocument.load(bytes,{updateMetadata:false});let pdf=original;if(selection){if(!selection.length)throw Error('少なくとも1ページを選択してください');pdf=await PDFDocument.create();const copied=await pdf.copyPages(original,selection.map(p=>p.sourcePage-1));for(let i=0;i<copied.length;i++){copied[i].setRotation(degrees(selection[i].rotation));pdf.addPage(copied[i]);}}
 // Rebuild only the derivative's attachment tree to avoid duplicate names in viewers.
 // The untouched original blob is always retained, including its existing attachments.
 const names=pdf.catalog.get(PDFName.of('Names'));if(names){const dict=pdf.context.lookup(names) as any;dict.delete?.(PDFName.of('EmbeddedFiles'));}pdf.catalog.delete(PDFName.of('AF'));
 await pdf.attach(new TextEncoder().encode(JSON.stringify(meta)),'printlib.json',{mimeType:'application/json',description:'Schoolmanager structured print metadata',creationDate:new Date(meta.createdAt),modificationDate:new Date(meta.updatedAt)});return pdf.save();}
