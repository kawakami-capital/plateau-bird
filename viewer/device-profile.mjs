// 端末の判定と、スマホ（特にiPhone）向けの省メモリ設定。
// iPhoneではGPUとCPUが同じメモリを使うため、建物の外観画像（2560角）をそのまま全部読み込むと
// 自動飛行で視界が広がったときに上限を超え、ページごと落ちる（「このページを開けません」）。
// PCでは何も変えない。確認用に ?lowmem=1 / ?lowmem=0 で強制できる。
export function isMobileDevice(n=globalThis.navigator||{}){return !!(n.userAgentData?.mobile||/Android|iPhone|iPad|iPod/i.test(n.userAgent||'')||(n.platform==='MacIntel'&&n.maxTouchPoints>1)||globalThis.matchMedia?.('(pointer:coarse)').matches);}
export function deviceProfile({search=globalThis.location?.search||'',navigator:n=globalThis.navigator||{}}={}){
const forced=new URLSearchParams(search).get('lowmem'),mobile=isMobileDevice(n),lowMemory=forced==='1'?true:forced==='0'?false:mobile;
return lowMemory?{lowMemory,mobile,atlasMax:1024,pixelRatioMax:1.5,antialias:false,composerSamples:0,shadowMapSize:1024,preupload:true}:{lowMemory,mobile,atlasMax:Infinity,pixelRatioMax:Infinity,antialias:true,composerSamples:4,shadowMapSize:2048,preupload:false};}
// 画像を長辺 max 以下に縮める（GPUに送る前）。同じ画像を共有するテクスチャは1回だけ処理する。
export async function shrinkImage(img,max,cache){if(!img||!(max<Infinity))return null;if(cache?.has(img))return cache.get(img);const job=(async()=>{const w=img.width||img.naturalWidth||0,h=img.height||img.naturalHeight||0;if(!w||!h||Math.max(w,h)<=max)return null;const s=max/Math.max(w,h),W=Math.max(1,Math.round(w*s)),H=Math.max(1,Math.round(h*s)),c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,W,H);let out=c;try{out=await createImageBitmap(c);c.width=c.height=0;}catch{}try{img.close?.();}catch{}return {image:out,from:[w,h],to:[W,H]};})();cache?.set(img,job);return job;}
