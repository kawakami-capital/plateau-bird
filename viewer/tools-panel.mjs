// 制作機能を初期非表示の領域へ集約する。開閉状態は永続化しない。
export function mountToolsPanel(){
 if(window.birdTools)return window.birdTools;
 const trigger=document.createElement('button');trigger.id='tools-panel-toggle';trigger.type='button';trigger.className='tools-panel-toggle';trigger.textContent='🔧 制作ツール';trigger.setAttribute('aria-controls','location-panel');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','制作ツールを開く');
 const panel=document.createElement('aside');panel.id='location-panel';panel.className='tools-panel';panel.hidden=true;panel.setAttribute('aria-labelledby','tools-panel-title');panel.innerHTML='<div class="tools-panel-heading"><strong id="tools-panel-title">🔧 制作ツール</strong><button type="button" id="tools-panel-close" aria-label="制作ツールを閉じる">閉じる ×</button></div><div id="tools-content"><p role="status" class="tools-wait">高画質化の読み込みが終わると使えます。少しお待ちください。</p></div>';document.body.append(trigger,panel);
 const closeButton=panel.querySelector('#tools-panel-close');
 function close({focus=true}={}){panel.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label','制作ツールを開く');if(focus)trigger.focus();}
 function open(){window.birdFreeFlight?.stop();panel.hidden=false;trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-label','制作ツールを閉じる');closeButton.focus();}
 trigger.onclick=()=>panel.hidden?open():close();closeButton.onclick=()=>close();document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden&&!document.querySelector('dialog[open]')&&!window.birdStudio?.exporting){e.preventDefault();close();}});
 const api={open,close,panel,get isOpen(){return !panel.hidden;}};window.birdTools=api;return api;
}
