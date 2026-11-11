// Three.jsに依存しない共通ヘルプ。別ビューで使う場合は実際の割当を確認しcontentを差し替える。
export const BIRD_HELP_CONTENT={
 eyebrow:'はじめての空へ',title:'街の動かし方',intro:'まずはドラッグして、街を違う角度から眺めてみましょう。',
 modes:[
  {id:'mouse',label:'マウス',rows:[['左ドラッグ','街の周りを回転します。'],['右ドラッグ／Shift＋左ドラッグ','見る位置を平行に移動します。'],['ホイール','拡大・縮小します。ホイールを押しながら上下にドラッグしても操作できます。']],note:'Ctrl／⌘＋左ドラッグも移動です。3D画面のダブルクリックに専用操作はありません。'},
  {id:'trackpad',label:'トラックパッド',rows:[['クリックしたままドラッグ','街の周りを回転します。'],['Shift＋クリックしたままドラッグ','見る位置を平行に移動します。副ボタンのクリック＋ドラッグでも移動できます。'],['2本指でスクロール','拡大・縮小します。']],note:'ピンチも、ブラウザーがホイール操作として通知する場合は拡大・縮小になります。方向や副ボタン操作は端末設定によって異なります。'},
  {id:'touch',label:'スマホ・タブレット',rows:[['1本指でドラッグ','街の周りを回転します。'],['2本指でドラッグ','見る位置を平行に移動します。'],['2本指を開く・閉じる','ピンチで拡大・縮小します。']],note:'移動とピンチは同時に操作できます。カメラの高さ・移動範囲・拡大率には制限があります。'}
 ],
 controls:[['都市名','上の都市名から、10都市を切り替えます。'],['🕊 自動で飛ぶ','操作しなくても鳥のように飛びます。もう一度押すか、画面を触ると止まります。'],['▶ 街をめぐる','決まった経路で街を一周します。「飛行をとめる」で手動に戻ります。3D画面を押す／ホイール操作でも止まります。'],['☀ 光の時間','スライダーで光の向きと影を変えます。夏至を基準にした参考演出です。'],['画質','軽量・標準・高画質から選択。重いときは軽量へ。小さい画面では非表示です。'],['カメラのボタン','今の3D視点を、出典付きのPNG画像で保存します。'],['出典・ご案内 ↗','データの出典と、表現上の注意を確認できます。']],
 keyboard:'Tabで項目を移動し、Enter／Spaceでボタンを操作。スライダー選択中は矢印キーで調整できます。Escでこの説明を閉じます。',keyboardNote:'矢印キーなどによるカメラ移動のショートカットは設定されていません。',footer:'あとから右上の「? 操作方法」で、いつでも確認できます。',dismiss:'街を見てみる'
};
let sequence=0;
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
export function mountViewerHelp({container,content=BIRD_HELP_CONTENT,storageKey='plateau-bird-help-v1',isReady=()=>true,onOpen=()=>{}}={}){
 if(!container)throw new Error('操作方法ボタンの配置先がありません');const prefix=`viewer-help-${++sequence}`,dialog=make('dialog','viewer-help-dialog');dialog.id=prefix;dialog.setAttribute('aria-labelledby',prefix+'-title');
 const trigger=make('button','viewer-help-trigger');trigger.type='button';trigger.setAttribute('aria-label','操作方法を開く');trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',prefix);trigger.setAttribute('aria-expanded','false');trigger.append(make('span','viewer-help-question','?'),make('span','viewer-help-trigger-label','操作方法'));container.prepend(trigger);
 const head=make('header','viewer-help-head'),close=make('button','viewer-help-close','×');close.type='button';close.setAttribute('aria-label','操作説明を閉じる');const title=make('h2','',content.title);title.id=prefix+'-title';head.append(make('p','viewer-help-eyebrow',content.eyebrow),title,make('p','viewer-help-intro',content.intro),close);
 const body=make('div','viewer-help-body'),grid=make('div','viewer-help-grid'),gestures=make('section','viewer-help-gestures'),tabs=make('div','viewer-help-tabs');tabs.setAttribute('aria-label','操作する機器を選択');const panel=make('div','viewer-help-panel');panel.id=prefix+'-panel';const modeButtons=[];let active=matchMedia('(pointer:coarse)').matches?'touch':'mouse';
 function showMode(id){active=id;const mode=content.modes.find(m=>m.id===id)||content.modes[0];panel.replaceChildren();const dl=make('dl','viewer-help-rows');for(const [key,text]of mode.rows){const row=make('div','');row.append(make('dt','',key),make('dd','',text));dl.append(row);}panel.append(dl,make('p','viewer-help-note',mode.note));for(const b of modeButtons)b.setAttribute('aria-pressed',String(b.dataset.mode===mode.id));}
 for(const mode of content.modes){const b=make('button','',mode.label);b.type='button';b.dataset.mode=mode.id;b.setAttribute('aria-controls',panel.id);b.onclick=()=>showMode(mode.id);modeButtons.push(b);tabs.append(b);}gestures.append(make('h3','','視点を動かす'),tabs,panel);
 const ui=make('section','viewer-help-ui');ui.append(make('h3','','画面のボタン'));const controls=make('dl','viewer-help-controls');for(const [label,text]of content.controls){const row=make('div','');row.append(make('dt','',label),make('dd','',text));controls.append(row);}ui.append(controls);grid.append(gestures,ui);const keyboard=make('section','viewer-help-keyboard');keyboard.append(make('h3','','キーボード'),make('p','',content.keyboard),make('small','',content.keyboardNote));body.append(grid,keyboard);
 const foot=make('footer','viewer-help-foot'),start=make('button','viewer-help-start',content.dismiss);start.type='button';start.autofocus=true;foot.append(make('p','',content.footer),start);dialog.append(head,body,foot);document.body.append(dialog);showMode(active);
 let disposed=false,timer=null,attempts=0;function markSeen(){try{localStorage.setItem(storageKey,'seen');}catch{}}
 function open(){if(disposed||dialog.open)return;onOpen();dialog.showModal();trigger.setAttribute('aria-expanded','true');start.focus({preventScroll:true});dialog.scrollTop=0;}
 function dismiss(){markSeen();if(dialog.open)dialog.close();}
 dialog.addEventListener('cancel',markSeen);dialog.addEventListener('close',()=>{markSeen();trigger.setAttribute('aria-expanded','false');trigger.focus({preventScroll:true});});trigger.onclick=open;close.onclick=dismiss;start.onclick=dismiss;
 let seen=false;try{seen=localStorage.getItem(storageKey)==='seen';}catch{}
 if(!seen){timer=setInterval(()=>{if(disposed||++attempts>1200){clearInterval(timer);return;}if(isReady()){clearInterval(timer);open();}},100);}
 return {open,close:dismiss,get isOpen(){return dialog.open;},content,storageKey,destroy(){disposed=true;clearInterval(timer);dialog.remove();trigger.remove();}};
}
