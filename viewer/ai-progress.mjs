// AI高画質化の読み込み状態を、目立つバッジと進捗バーで表示する。失敗しても元の地図表示は続ける。
export function createAiProgress(){
 const $=id=>document.getElementById(id),box=$('ai-progress'),text=$('ai-progress-text'),fill=$('ai-progress-fill'),close=$('ai-progress-close');
 let timer=null,shown=0;const api={state:'idle',percent:0};
 if(!box)return {...api,start(){},set(){},done(){},fail(){}};
 close.onclick=()=>{box.hidden=true;};
 function show(state,label,percent){clearTimeout(timer);api.state=state;box.dataset.state=state;box.hidden=false;text.textContent=label;if(percent!=null){api.percent=percent;fill.style.width=percent+'%';}close.hidden=state!=='failed';}
 api.start=()=>{shown=0;show('loading','高画質化を読み込み中… 0%',0);};
 api.set=f=>{if(api.state!=='loading')return;const p=Math.max(shown,Math.min(99,Math.round(f*100)));shown=p;text.textContent=`高画質化を読み込み中… ${p}%`;fill.style.width=p+'%';api.percent=p;};
 api.done=()=>{show('done','✓ 高画質化済み',100);timer=setTimeout(()=>{box.hidden=true;},4500);};
 api.fail=()=>{show('failed','高画質化を読み込めませんでした。元の地図で表示しています（再読み込みで再挑戦できます）',100);timer=setTimeout(()=>{box.hidden=true;},15000);};
 window.birdAiProgress=api;return api;
}
