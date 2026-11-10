import {embedMetadata} from './pdf-core';
self.onmessage=async (event:MessageEvent)=>{try{const bytes=await embedMetadata(new Uint8Array(event.data.bytes),event.data.meta,event.data.selection);(self as any).postMessage({bytes:bytes.buffer},[bytes.buffer]);}catch(e){self.postMessage({error:String(e)});}};
