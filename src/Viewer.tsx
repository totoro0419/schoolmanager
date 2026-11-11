import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,ZoomIn,ZoomOut,Download,PanelRight,RotateCw,Loader2} from 'lucide-react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {RecordDoc} from './types';
import {getFile,getRestoredPdf} from './db';
import {loadPdf,canvasPage} from './pdf';
import {download} from './download';
import {isCatalogPrint} from './public-library';

interface ViewerProps {
  doc: RecordDoc;
  previous?: RecordDoc;
  next?: RecordDoc;
  onMove: (doc:RecordDoc)=>void;
  onClose: ()=>void;
  onEdit: ()=>void;
}

export function PdfViewer({doc,previous,next,onMove,onClose,onEdit}: ViewerProps) {
  const [page,setPage]=useState(1);
  const [zoom,setZoom]=useState(1);
  const [rotate,setRotate]=useState(0);
  const [attempt,setAttempt]=useState(0);
  const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const dialog=useRef<HTMLDialogElement>(null);
  const panel=useRef<HTMLElement>(null);
  const host=useRef<HTMLDivElement>(null);
  const publicUrl=doc.publicPdfUrl;
  const restored=doc.restoredPdf;
  const fileHash=doc.fileHash;
  const catalogPrint=isCatalogPrint(doc);
  const pdfRevision=catalogPrint?0:doc.revision;

  useEffect(()=>{
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    dialog.current?.showModal();
    panel.current?.focus();
    return ()=>opener?.focus({preventScroll:true});
  },[publicUrl]);

  useEffect(()=>{
    let canceled=false;
    let task:ReturnType<typeof loadPdf>|undefined;
    setPdf(null);
    setError('');
    setLoading(true);
    host.current?.replaceChildren();
    async function open(){
      if(publicUrl){
        task=loadPdf(publicUrl);
      }else{
        const blob=restored?await getRestoredPdf(fileHash):await getFile(doc.id+'/derived')||await getFile(doc.id+'/original');
        if(!blob)throw Error('PDF本体が見つかりません');
        const bytes=new Uint8Array(await blob.arrayBuffer());
        if(canceled)return;
        task=loadPdf(bytes);
      }
      const opened=await task.promise;
      if(!canceled)setPdf(opened);
    }
    open().catch(error=>{
      if(canceled)return;
      setError(publicUrl?'公開PDFを読み込めませんでした。接続を確認して再試行してください。':String(error));
      setLoading(false);
    });
    return ()=>{
      canceled=true;
      void task?.destroy().catch(()=>{});
    };
  },[doc.id,fileHash,pdfRevision,publicUrl,restored,attempt]);

  useEffect(()=>{
    if(!pdf)return;
    let canceled=false;
    setLoading(true);
    setError('');
    async function render(document:PDFDocumentProxy){
      const sheet=await document.getPage(page);
      if(canceled)return;
      const width=Math.max(200,(host.current?.parentElement?.clientWidth||800)-52);
      const canvas=await canvasPage(sheet,Math.min(2400,width*zoom),(sheet.rotate+rotate)%360);
      if(!canceled)host.current?.replaceChildren(canvas);
    }
    render(pdf).catch(error=>{
      if(!canceled)setError(publicUrl?'ページを表示できませんでした。':String(error));
    }).finally(()=>{
      if(!canceled)setLoading(false);
    });
    return ()=>{canceled=true;};
  },[pdf,page,zoom,rotate]);

  async function exportPdf(original=false){
    const blob=restored?await getRestoredPdf(fileHash):await getFile(doc.id+(original?'/original':'/derived'));
    if(blob)download(blob,doc.meta.title+(original?'_原本':'')+'.pdf');
  }

  const content=<>
    <header className="viewer-head">
      <button className="icon-button" onClick={onClose} aria-label="ライブラリに戻る"><ChevronLeft/></button>
      <div className="viewer-name"><h1>{doc.meta.title}</h1><small>{doc.pageCount} ページ · {publicUrl?'公開教材':restored?'この端末の復元PDF':'端末内で表示'}</small></div>
      <button className="secondary" onClick={onEdit} aria-label={catalogPrint?'分類を編集':'分類・ページ編集'}><PanelRight size={17}/><span>{catalogPrint?'分類を編集':'分類・ページ編集'}</span></button>
      {publicUrl
        ?<a className="primary" href={publicUrl} download={doc.meta.title+'.pdf'} aria-label="PDFをダウンロード"><Download size={17}/><span>ダウンロード</span></a>
        :<button className="primary" onClick={()=>exportPdf()} aria-label="書き出す"><Download size={17}/><span>書き出す</span></button>}
    </header>
    <div className="viewer-controls">
      <button className="icon-button" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={!pdf||page<=1} aria-label="前のページ"><ChevronLeft size={19}/></button>
      <label><span className="sr-only">ページ番号</span><input type="number" min={1} max={doc.pageCount} value={page} disabled={!pdf} onChange={e=>{const n=+e.target.value;if(Number.isInteger(n)&&n>=1&&n<=doc.pageCount)setPage(n);}}/></label>
      <span>/ {doc.pageCount}</span>
      <button className="icon-button" onClick={()=>setPage(p=>Math.min(doc.pageCount,p+1))} disabled={!pdf||page>=doc.pageCount} aria-label="次のページ"><ChevronRight size={19}/></button><i/>
      <button className="icon-button" onClick={()=>setZoom(z=>Math.max(.4,z-.2))} aria-label="縮小"><ZoomOut size={19}/></button>
      <span>{Math.round(zoom*100)}%</span>
      <button className="icon-button" onClick={()=>setZoom(z=>Math.min(3,z+.2))} aria-label="拡大"><ZoomIn size={19}/></button>
      <button className="icon-button" onClick={()=>setRotate(r=>r+90)} aria-label="表示を回転"><RotateCw size={18}/></button>
    </div>
    <div className="pdf-scroll">
      {loading&&<div className="pdf-loading" role="status"><Loader2 className="spin"/> {pdf?'ページを表示中':'PDFを読み込み中'}</div>}
      {error&&<div className="error" role="alert">{error} <button className="secondary" onClick={()=>setAttempt(n=>n+1)}>再試行</button></div>}
      <div className="pdf-canvas" ref={host}/>
    </div>
    <footer className="viewer-footer">
      <button className="secondary" disabled={!previous} onClick={()=>previous&&onMove(previous)}><ChevronLeft size={17}/>前のプリント</button>
      {!catalogPrint&&<button className="text-button" onClick={()=>exportPdf(true)}>原本をダウンロード</button>}
      <button className="secondary" disabled={!next} onClick={()=>next&&onMove(next)}>次のプリント<ChevronRight size={17}/></button>
    </footer>
  </>;

  return catalogPrint
    ?<section className="viewer inline-viewer" ref={panel} aria-label={doc.meta.title} tabIndex={-1}>{content}</section>
    :<dialog ref={dialog} className="viewer" aria-label={doc.meta.title} onCancel={e=>{e.preventDefault();onClose();}}>{content}</dialog>;
}
