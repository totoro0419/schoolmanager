import {PDFDocument,StandardFonts,degrees} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('fixtures',{recursive:true});
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
for(let i=1;i<=4;i++){const page=pdf.addPage([595,842]);if(i<4){page.drawText(i===3?'ANSWER / EXPLANATION':'SYNTHETIC WORKSHEET',{x:45,y:780,font,size:20});page.drawText('Generated test PDF - contains no school or personal data.',{x:45,y:745,font,size:12});page.drawText(i===3?'1. The answer is 2.':'1. Solve: x + 3 = 5.',{x:45,y:680,font,size:14});page.drawText('Printed page '+(i===1?'2':i===2?'1':'3'),{x:45,y:40,font,size:10});}if(i===4)page.setRotation(degrees(90));}
await writeFile('fixtures/plain.pdf',await pdf.save());
const corrupt=await PDFDocument.create();corrupt.addPage().drawText('CORRUPT METADATA FIXTURE',{x:40,y:700});await corrupt.attach(new TextEncoder().encode('{invalid'),'printlib.json',{mimeType:'application/json'});await writeFile('fixtures/corrupt-metadata.pdf',await corrupt.save());
await writeFile('fixtures/not-a-pdf.pdf','This is not a PDF.');
console.log('Created 3 synthetic test fixtures in fixtures/');
