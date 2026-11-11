import {Output,Mp4OutputFormat,BufferTarget,CanvasSource,Quality} from 'mediabunny';
export async function encodeMP4({canvas,frames,fps,render,cancelled,onProgress}){
 if(!globalThis.VideoEncoder||!globalThis.VideoFrame)throw Error('このブラウザは端末内MP4出力に対応していません。最新のChrome等で開いてください。');
 const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});const source=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:8_000_000}),keyFrameInterval:2});output.addVideoTrack(source,{frameRate:fps});
 try{await output.start();for(let i=0;i<frames;i++){if(cancelled())throw Error('動画の出力を中止しました。');await render(i/(frames-1));await source.add(i/fps,1/fps);onProgress?.((i+1)/frames);if(i%3===0)await new Promise(r=>setTimeout(r,0));}await output.finalize();return new Blob([output.target.buffer],{type:'video/mp4'});}catch(e){await output.cancel().catch(()=>{});throw e;}
}
