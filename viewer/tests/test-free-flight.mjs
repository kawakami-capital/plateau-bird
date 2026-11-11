import assert from 'node:assert/strict';import fs from 'node:fs';import {parseHTML} from 'linkedom';import * as T from '../vendor/three.module.js';import {sweepMove,stepFlight,mapExtent,clearanceHeight,mulberry32,createBirdState,stepBirdFlight,MIN_ALTITUDE,MAX_ALTITUDE} from '../free-flight-logic.mjs';import {installFreeFlight} from '../free-flight.mjs';

const boxes=[{x0:10,x1:12,z0:-10,z1:10,h:30}];let p=sweepMove({x:-40,y:20,z:0},{x:80,y:20,z:0},boxes);assert.equal(p.blocked,true);assert.ok(p.x<2);p=sweepMove({x:11,y:100,z:0},{x:11,y:0,z:0},boxes);assert.ok(p.y>38);assert.equal(sweepMove({x:-40,y:50,z:0},{x:80,y:50,z:0},boxes).blocked,false);assert.equal(stepFlight({x:0,y:15,z:0},{x:0,y:-100,z:0},[]).y,12);assert.equal(stepFlight({x:0,y:1000,z:0},{x:9999,y:9999,z:9999},[]).y,1200);assert.equal(stepFlight({x:0,y:100,z:0},{x:9999,y:0,z:0},[]).x,1800);

const extent=mapExtent([{x0:-400,x1:400,z0:-200,z1:200,h:80},{x0:-100,x1:50,z0:-50,z1:80,h:40}],{x:0,z:0});
assert.ok(extent.x0>-400&&extent.x1<400&&extent.z0>-200&&extent.z1<200);assert.equal(extent.hMax,80);
assert.equal(clearanceHeight(0,0,[{x0:-10,x1:10,z0:-10,z1:10,h:50}]),50+24);assert.equal(clearanceHeight(200,200,[{x0:-10,x1:10,z0:-10,z1:10,h:50}]),MIN_ALTITUDE);

const rng=mulberry32(7),state=createBirdState({position:{x:0,y:80,z:0},yaw:0,pitch:0,now:0});
stepBirdFlight(state,0.016,[],{x:0,z:0},rng,16);
const yaw0=state.yaw,speed0=state.speed,x0=state.x,z0=state.z;
stepBirdFlight(state,0.016,[],{x:0,z:0},rng,32);
assert.ok(Math.abs(state.yaw-yaw0)<0.05);assert.ok(Math.abs(state.speed-speed0)<2);
for(let t=48;t<=20000;t+=16){
  const prev={x:state.x,y:state.y,z:state.z,yaw:state.yaw,speed:state.speed};
  stepBirdFlight(state,0.016,boxes,{x:0,z:0},rng,t);
  assert.ok(state.x>=extent.x0-400&&state.x<=extent.x1+400); // loose until we use same boxes
  assert.ok(state.y>=MIN_ALTITUDE-1e-6&&state.y<=MAX_ALTITUDE+1e-6);
  assert.ok(Math.abs(state.yaw-prev.yaw)<0.08);assert.ok(Math.abs(state.speed-prev.speed)<3);
  assert.ok(!(state.x>10&&state.x<12&&state.z>-10&&state.z<10&&state.y<30));
}
assert.ok(Math.hypot(state.x-x0,state.z-z0)>5||state.y!==80,'自動飛行で位置が変わること');

const wall=[{x0:20,x1:80,z0:-80,z1:80,h:120}];
const toward=createBirdState({position:{x:0,y:50,z:0},yaw:Math.PI/2,pitch:0,now:0}); // yaw π/2 looks toward -X? wait: yaw 0 -> -Z, yaw π/2 -> -X. Need yaw to look +X: atan2(-1, -0) = -π/2? headingTo(0,0,40,0)=atan2(-40,0)=-π/2. Yes looking +X is yaw=-π/2.
const into=createBirdState({position:{x:-40,y:50,z:0},yaw:-Math.PI/2,pitch:0,now:0});
const r2=mulberry32(3);
for(let t=16;t<=8000;t+=16){
  stepBirdFlight(into,0.016,wall,{x:0,z:0},r2,t);
  assert.ok(!(into.x>20&&into.x<80&&into.z>-80&&into.z<80&&into.y<120),'建物の外接箱にめり込まない');
}

const {window,document}=parseHTML('<html><body><header><div class="header-actions"></div></header><canvas></canvas></body></html>');globalThis.window=window;globalThis.document=document;const camera=new T.PerspectiveCamera();camera.position.set(0,50,100);camera.lookAt(0,50,0);const controls={enabled:true,target:new T.Vector3(0,50,0),update(){}};let ready=true,toasts=0;const api=installFreeFlight({T,camera,controls,renderer:{domElement:document.querySelector('canvas')},getBounds:()=>[],getFocus:()=>({x:0,z:0}),isReady:()=>ready,stopFlight:()=>controls.target.set(0,22,0),toast:()=>toasts++});
const toggle=document.getElementById('free-flight-toggle');
assert.equal(toggle.getAttribute('aria-pressed'),'false');
assert.match(toggle.textContent,/自動で飛ぶ/);
assert.equal(toggle.getAttribute('aria-label'),'自動で飛ぶ');
assert.equal(document.querySelectorAll('[data-move]').length,0);
assert.equal(api.start(),true);assert.equal(controls.enabled,false);assert.equal(api.active,true);
const zBefore=camera.position.z,yBefore=camera.position.y;
for(let t=1000;t<=4000;t+=16)api.update(t);
assert.ok(Math.hypot(camera.position.x,camera.position.z-zBefore,camera.position.y-yBefore)>8,'入力なしで移動する');
function event(type,props,target=window){const e=new window.Event(type,{bubbles:true,cancelable:true});Object.assign(e,props);target.dispatchEvent(e);}
const canvas=document.querySelector('canvas');
event('pointerdown',{pointerId:1,clientX:10,clientY:10},canvas);
assert.equal(api.active,false);assert.equal(controls.enabled,true);assert.equal(document.getElementById('free-flight-panel').hidden,true);
assert.equal(api.start(),true);
event('keydown',{code:'Escape'});
assert.equal(api.active,false);
ready=false;assert.equal(api.start(),false);assert.ok(toasts>0);

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),page=parseHTML(html).document;
assert.equal(page.querySelectorAll('#footer-info').length,1);
assert.equal(page.querySelector('footer').textContent.includes('note'),false);
assert.equal((page.querySelector('#about').textContent.match(/noteで販売予定/g)||[]).length,1);
assert.equal((page.querySelector('#about').textContent.match(/MITライセンス/g)||[]).length,1);
assert.match(page.querySelector('footer').textContent,/PLATEAU.*国土地理院/);
const label=page.querySelector('#open-source-label');
assert.equal(label.getAttribute('href'),'https://github.com/kawakami-capital/plateau-bird');
assert.equal(label.getAttribute('target'),'_blank');
assert.equal(page.querySelector('.open-source-full').textContent,'オープンソース｜コピー可');
assert.equal(page.querySelector('.open-source-short').textContent,'オープンソース｜コピー可');
const repoLinks=[...page.querySelector('#about').querySelectorAll('a')].filter(a=>a.getAttribute('href')==='https://github.com/kawakami-capital/plateau-bird');
assert.equal(repoLinks.length,1);assert.equal(repoLinks[0].getAttribute('target'),'_blank');
assert.equal(page.querySelector('#about').textContent.includes('公開準備中'),false);
console.log('合格：自動飛行の切替・入力なし移動・画面タップ/Escで停止・滑らかな速度・範囲と衝突抑制・オープンソース表示とGitHubリンク・情報欄重複なし');
