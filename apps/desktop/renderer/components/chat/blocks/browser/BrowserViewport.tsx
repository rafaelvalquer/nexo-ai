import { useEffect,useRef,useState } from "react";
import type { BrowserRun } from "@nexo/shared/browser-agent";
import { LatestFrameBuffer } from "./latest-frame-buffer";

type Props={run:BrowserRun;expanded?:boolean};

export function BrowserViewport({run,expanded=false}:Props){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const latestRef=useRef(new LatestFrameBuffer());
  const drawingRef=useRef(false);
  const lastSequenceRef=useRef(0);
  const[hasLiveFrame,setHasLiveFrame]=useState(false);

  useEffect(()=>{
    if(!["starting","running","paused","waiting_approval"].includes(run.status))return;
    let disposed=false;
    const drawLatest=async()=>{
      if(disposed||drawingRef.current)return;
      drawingRef.current=true;
      try{
        while(!disposed&&latestRef.current.hasFrame){
          const frame=latestRef.current.take();if(!frame)break;
          if(frame.sequence<=lastSequenceRef.current)continue;
          const copy=new Uint8Array(frame.bytes.byteLength);copy.set(frame.bytes);
          const blob=new Blob([copy.buffer],{type:"image/jpeg"});
          const bitmap=await createImageBitmap(blob);
          try{
            const canvas=canvasRef.current;if(!canvas)continue;
            const rect=canvas.getBoundingClientRect(),ratio=Math.max(1,window.devicePixelRatio||1);
            const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
            if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
            const ctx=canvas.getContext("2d",{alpha:false});if(!ctx)continue;
            ctx.clearRect(0,0,width,height);
            const scale=Math.min(width/bitmap.width,height/bitmap.height),drawWidth=bitmap.width*scale,drawHeight=bitmap.height*scale;
            ctx.drawImage(bitmap,(width-drawWidth)/2,(height-drawHeight)/2,drawWidth,drawHeight);
            lastSequenceRef.current=frame.sequence;setHasLiveFrame(true);
          }finally{bitmap.close();}
        }
      }finally{drawingRef.current=false;if(latestRef.current.hasFrame&&!disposed)queueMicrotask(()=>void drawLatest());}
    };
    const unsubscribe=window.nexo.subscribeBrowserFrames(run.id,frame=>{latestRef.current.push(frame);if(!drawingRef.current)void drawLatest();});
    return()=>{disposed=true;latestRef.current.clear();unsubscribe();};
  },[run.id,run.status]);

  return <div className={`browserViewport ${expanded?"expanded":""}`}>
    <canvas ref={canvasRef} aria-label="Visualização ao vivo do navegador"/>
    {!hasLiveFrame&&run.finalThumbnail&&<img className="browserThumbnail" src={run.finalThumbnail} alt="Última captura da execução"/>}
    {!hasLiveFrame&&!run.finalThumbnail&&<div className="browserViewportPlaceholder"><span className="browserPulse"/>Preparando visualização ao vivo…</div>}
  </div>;
}
