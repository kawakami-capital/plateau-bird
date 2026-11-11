import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {known,heightClass,neighborhood,solarPosition} from './logic.mjs';
const startMs=performance.now();
const $=id=>document.getElementById(id);
const map=$('map'), scene=new THREE.Scene(); scene.background=new THREE.Color('#e7edef');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
map.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(42,1,1,3500);
const controls=new OrbitControls(camera,renderer.domElement);controls.minDistance=25;controls.maxDistance=1100;controls.maxPolarAngle=Math.PI*0.49;
const ambient=new THREE.HemisphereLight(0xffffff,0x596572,2);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xfff4e5,2.2);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-420,right:420,top:420,bottom:-420,near:10,far:2200});sun.shadow.bias=-0.00015;sun.shadow.normalBias=0.18;scene.add(sun);scene.add(sun.target);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(1400,1400),new THREE.MeshStandardMaterial({color:'#d6ddd6',roughness:1}));
ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;ground.name='仮の水平地面（標高0m、地形ではない）';scene.add(ground);
const rings=new THREE.Group();scene.add(rings);
const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
const objects=new Map();let rows=[],byId=new Map(),selected=null,stats=null,solar=null,loading=true;
let frame=null;
function render(){frame=null;renderer.render(scene,camera);updateLabel();}
function requestRender(){if(frame===null)frame=requestAnimationFrame(render);}
function resize(){renderer.setSize(map.clientWidth,map.clientHeight);camera.aspect=map.clientWidth/map.clientHeight;camera.updateProjectionMatrix();requestRender();}
new ResizeObserver(resize).observe(map);controls.addEventListener('change',requestRender);
function number(v,suffix=''){return known(v)?`${v}${suffix}`:'不明';}
function field(k,v,cls=''){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;if(cls)dd.className=cls;return [dt,dd];}
const colors={selected:'#f1bc35',higher:'#d96a51',lower:'#81b2cb',equal:'#c7c9c6',unknown:'#696d7b',uncompared:'#bdc8cf'};
function recolor(){
  for(const r of rows){
    const group=objects.get(r.id);if(!group)continue;
    const cl=r.id===selected?.id?'selected':heightClass(r.height,selected?.height);
    const heightMode=$('height-mode').checked;
    group.traverse(o=>{if(o.isMesh){
      const map=heightMode?null:o.userData.originalMap;
      if(o.material.map!==map){o.material.map=map;o.material.needsUpdate=true;}
      o.material.color.set(heightMode?colors[cl]:(cl==='selected'?'#fff0bb':o.userData.originalColor));
      o.material.emissive.set(cl==='selected'?'#392800':'#000000');
    }});
  }
}
function drawRings(){
  for(const c of [...rings.children]){c.geometry.dispose();c.material.dispose();rings.remove(c);}
  if(!selected)return;
  const radius=Number($('radius').value);
  for(const r of [50,100,150]){
    const pts=[];for(let n=0;n<=192;n++){const a=n/192*Math.PI*2;pts.push(new THREE.Vector3(selected.x+r*Math.cos(a),0.35,selected.z+r*Math.sin(a)));}
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:r===radius?'#234a78':'#8c9da8',transparent:true,opacity:r===radius?1:.35,depthTest:false}));
    line.renderOrder=10;rings.add(line);
  }
}
function updateStats(){
  if(!selected)return;const radius=Number($('radius').value);stats=neighborhood(rows,selected,radius);
  $('counts').textContent=`${radius}m以内 ${stats.count}棟 ／ 高い建物 ${stats.higher===null?'比較不可':stats.higher+'棟'} ／ 高さ不明 ${stats.unknown}棟`;
  const uses=$('uses');uses.replaceChildren();for(const [k,n] of Object.entries(stats.uses).sort((a,b)=>b[1]-a[1])){const d=document.createElement('div');d.textContent=`${k} ${n}棟`;uses.appendChild(d);}
  drawRings();requestRender();
}
function select(id){
  if(!byId.has(id)||!objects.has(id)){$('selection-error').textContent='該当する建物IDがありません（読み込み済みの建物から選んでください）。';return false;}
  $('selection-error').textContent='';selected=byId.get(id);$('building-id').value=id;
  const dl=document.createElement('dl');
  for(const [k,v,c] of [['建物ID',id,'mono'],['名称',selected.name||'記載なし'],['所在地',selected.address||'不明'],['計測高さ',number(selected.height,'m')],['地上階数',number(selected.storeys,'階')],['地下階数',number(selected.underground,'階')],['用途',selected.usage],['形状',`LOD${selected.lod}`]]){dl.append(...field(k,v,c));}
  $('attributes').replaceChildren(dl);
  $('view-label').textContent=`対象：${id.slice(0,18)}… ／ 高さ ${number(selected.height,'m')}・${selected.usage}`;
  recolor();updateStats();updateSun();return true;
}
function updateLabel(){
  const el=$('building-label');if(!selected||!objects.has(selected.id))return;
  const box=new THREE.Box3().setFromObject(objects.get(selected.id)),pos=new THREE.Vector3((box.min.x+box.max.x)/2,box.max.y+3,(box.min.z+box.max.z)/2).project(camera);
  el.hidden=pos.z>1||pos.z< -1||Math.abs(pos.x)>1||Math.abs(pos.y)>1;
  el.style.left=`${(pos.x+1)/2*map.clientWidth}px`;el.style.top=`${(1-pos.y)/2*map.clientHeight}px`;
  el.textContent=`${selected.usage} ／ 地上${number(selected.storeys,'階')} ／ 高さ${number(selected.height,'m')}`;
}
function setView(type){
  const c=selected?new THREE.Vector3(selected.x,12,selected.z):new THREE.Vector3(0,12,0);
  controls.target.copy(c);
  if(type==='top'){camera.position.copy(c).add(new THREE.Vector3(0,570,0.01));}
  else camera.position.copy(c).add(new THREE.Vector3(-300,285,350));
  controls.update();requestRender();
}
function updateSun(){
  try{solar=solarPosition($('date').value,Number($('hour').value),selected?.lat??35.6652,selected?.lon??139.7572);}
  catch(e){$('sun-status').textContent=e.message;return;}
  const rad=Math.PI/180, alt=solar.altitude*rad, az=solar.azimuth*rad;
  const sx=selected?.x??0,sz=selected?.z??0;sun.position.set(sx+1100*Math.sin(az)*Math.cos(alt),1100*Math.sin(alt),sz-1100*Math.cos(az)*Math.cos(alt));sun.target.position.set(sx,0,sz);
  sun.visible=solar.altitude>0;
  $('sun-status').textContent=`${$('date').value} ${$('hour').selectedOptions[0].text} 日本標準時 ／ 太陽高度 ${solar.altitude.toFixed(1)}°・方位 ${solar.azimuth.toFixed(1)}°（北=0°）${sun.visible?'':' ／ 太陽が地平線下のため日影なし'}`;
  requestRender();
}
for(let h=0;h<24;h++){const op=document.createElement('option');op.value=h;op.textContent=`${String(h).padStart(2,'0')}:00`;if(h===12)op.selected=true;$('hour').appendChild(op);}
$('date').addEventListener('change',updateSun);$('hour').addEventListener('change',updateSun);
$('height-mode').addEventListener('change',()=>{recolor();requestRender();});
function searchBuildings(){
 const q=$('building-search').value.trim().toLocaleLowerCase();
 const matches=rows.filter(r=>[r.id,r.name,r.address,r.usage].join(' ').toLocaleLowerCase().includes(q));
 $('search-results').replaceChildren();
 for(const r of matches.slice(0,100)){const o=document.createElement('option');o.value=r.id;o.textContent=`${r.name||r.address||r.id.slice(-12)}｜${r.usage}｜${number(r.height,'m')}`;o.selected=r.id===selected?.id;$('search-results').append(o);}
 $('search-status').textContent=`${matches.length}棟が該当（先頭100棟まで表示）。名称・住所の未収録もあります。`;
}
$('building-search').addEventListener('input',searchBuildings);
$('search-results').addEventListener('change',()=>{if(select($('search-results').value))setView('oblique');});
$('radius').addEventListener('change',updateStats);$('select-id').onclick=()=>select($('building-id').value.trim());$('building-id').onkeydown=e=>{if(e.key==='Enter')select($('building-id').value.trim());};
$('oblique').onclick=()=>setView('oblique');$('top').onclick=()=>setView('top');
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{
  if(e.button!==0||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects([...objects.values()],true);
  if(hits.length){let obj=hits[0].object;while(obj&&!byId.has(obj.userData.buildingId))obj=obj.parent;if(obj)select(obj.userData.buildingId);}
});
// 現在の3D視点をPNGに保存。DOMではなく、凡例・出典・属性・集計を別キャンバスへ合成する。
function wrap(ctx,text,width){let lines=[],line='';for(const ch of text){if(ch==='\n'){lines.push(line);line='';continue;}if(ctx.measureText(line+ch).width>width){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);return lines;}
async function exportPng(){
  if(!selected)return;
  await document.fonts.ready;render();
  const width=1600,mapW=1160,mapH=770,sideW=440;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=1090;
  const c=canvas.getContext('2d');c.fillStyle='#ffffff';c.fillRect(0,0,width,canvas.height);
  c.fillStyle='#16344a';c.fillRect(0,0,width,58);c.fillStyle='white';c.font='bold 23px sans-serif';c.fillText(document.title+'（ローカル試作・非公開）',24,38);
  // 比率を変えず余白付きで貼る。現在の視点を変えない。
  const src=renderer.domElement,scale=Math.min(mapW/src.width,mapH/src.height),w=src.width*scale,h=src.height*scale;
  c.fillStyle='#e7edef';c.fillRect(0,58,mapW,mapH);c.drawImage(src,(mapW-w)/2,58+(mapH-h)/2,w,h);
  c.fillStyle='#f5f8fa';c.fillRect(mapW,58,sideW,mapH);
  let y=86;c.fillStyle='#213749';
  function line(t,bold=false,size=16){c.font=`${bold?'bold ':''}${size}px sans-serif`;for(const l of wrap(c,t,sideW-38)){c.fillText(l,mapW+18,y);y+=size+8;}y+=4;}
  line('選択した建物',true,19);line(selected.id,false,13);line(`名称：${selected.name||'記載なし'}`);line(`所在地：${selected.address||'不明'}`);
  line(`高さ：${number(selected.height,'m')} ／ 地上：${number(selected.storeys,'階')}`);line(`用途：${selected.usage}`);
  line($('counts').textContent,true,15);
  line(Object.entries(stats.uses).sort((a,b)=>b[1]-a[1]).map(([u,n])=>`${u} ${n}棟`).join(' ／ '),false,14);
  line('凡例',true);for(const [cl,label] of [['selected','対象'],['higher','対象より高い'],['lower','対象より低い'],['equal','同程度（±0.1m）'],['unknown','高さ不明'],['uncompared','比較なし（対象が不明）']]){c.fillStyle=colors[cl];c.fillRect(mapW+18,y-12,16,16);c.fillStyle='#213749';c.font='14px sans-serif';c.fillText(label,mapW+43,y);y+=23;}
  y+=8;line($('sun-status').textContent,false,13);
  c.fillStyle='#fff1ce';c.fillRect(0,828,width,262);c.fillStyle='#58401c';let fy=850;
  const notes=[
    $('data-time').textContent,
    `集計：取得済み${rows.length}棟のみ・対象を除く。棟の頂点平均点までの水平距離。街区外は未収録。地面は仮の水平面（標高0m）。`,
    '簡易日影は参考表示。厳密な日影規制・日照・採光・眺望の判定には使えません。地形・街区外の建物は未収録。',
    $('attribution').textContent.replace(/\s+/g,' ').trim()
  ];
  c.font='14px sans-serif';for(const t of notes){for(const l of wrap(c,t,width-40)){c.fillText(l,20,fy);fy+=21;}fy+=5;}
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNGを作成できませんでした');
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`物件周辺3D説明_${selected.id}_${$('date').value}_${$('hour').value}時.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  $('save-status').textContent='PNGを保存しました（ブラウザのダウンロード先）。';return canvas;
}
$('save').onclick=()=>exportPng().catch(e=>{$('save-status').textContent=`保存できませんでした：${e.message}`;});
try{
  const query=new URLSearchParams(location.search);let sources=[];
  function localUrl(v,base=location.href){const u=new URL(v,base);if(u.origin!==location.origin)throw new Error('ローカル以外のデータは読み込みません');return u.href;}
  if(query.has('manifest')){
    const mu=localUrl(query.get('manifest'));const mf=await fetch(mu).then(r=>{if(!r.ok)throw new Error('メッシュ一覧を読めません');return r.json();});
    $('mesh-controls').hidden=false;
    const requested=query.get('meshes')?.split(',')||mf.meshes.slice(0,2).map(x=>x.id);
    for(const m of mf.meshes){const op=document.createElement('option');op.value=m.id;op.textContent=`${m.id}（${m.buildings}棟）`;op.selected=requested.includes(m.id);$('mesh-set').appendChild(op);}
    $('reload-meshes').onclick=()=>{const ids=[...$('mesh-set').selectedOptions].map(o=>o.value);if(!ids.length){$('selection-error').textContent='メッシュを1つ以上選択してください';return;}query.set('meshes',ids.join(','));location.search=query.toString();};
    sources=mf.meshes.filter(m=>requested.includes(m.id)).map(m=>({model:localUrl(m.model,mu),attributes:localUrl(m.attributes,mu)}));
    $('attribution').textContent=mf.attribution;
    $('data-time').textContent=mf.data_time+' ／ 簡易日影は参考のみ。日影規制・日照・採光・眺望の判定には使えません。仮の平面・収録外建物の影は含みません。';
    document.title=`${mf.city}｜周辺環境の3D説明`;
    document.querySelector('header b').textContent=`${mf.city}｜周辺環境の3D説明`;
  }else sources=[{model:query.get('baseline')==='1'?'./data/shinbashi_original.glb':'./data/shinbashi_atlas.glb',attributes:'./data/buildings.json'}];
  const allRows=new Map();
  for(const source of sources){
    const attrs=await fetch(source.attributes).then(r=>{if(!r.ok)throw new Error('属性ファイルを読めません');return r.json();});
    for(const r of attrs)allRows.set(r.id,r);
    const gltf=await new GLTFLoader().loadAsync(source.model);
    for(const obj of [...gltf.scene.children]){const id=obj.userData.gml_id||obj.name;
      if(!allRows.has(id)||objects.has(id)){gltf.scene.remove(obj);continue;}
      obj.userData.buildingId=id;objects.set(id,obj);
      obj.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.userData.originalMap=o.material.map;o.userData.originalColor=o.material.color.getHex();o.material.roughness=1;o.material.metalness=0;o.castShadow=true;o.receiveShadow=true;o.userData.buildingId=id;}});
    }
    scene.add(gltf.scene);
  }
  rows=[...allRows.values()].filter(r=>objects.has(r.id));byId=new Map(rows.map(r=>[r.id,r]));
  if(!rows.length)throw new Error('表示できる建物がありません');
  const bounds=new THREE.Box3();for(const o of objects.values())bounds.expandByObject(o);const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());ground.geometry.dispose();ground.geometry=new THREE.PlaneGeometry(Math.max(1400,size.x+500),Math.max(1400,size.z+500));ground.position.set(center.x,0,center.z);searchBuildings();
  for(const r of rows){const op=document.createElement('option');op.value=r.id;op.textContent=`${r.address||'所在地不明'} ${number(r.height,'m')} ${r.usage}`;$('building-list').appendChild(op);}
  // 中央付近の商業施設を既定の代表例にする（実案件・所有者の情報は使わない）。
  const candidates=rows.filter(r=>r.usage==='商業施設'&&known(r.height)&&r.height>=10&&r.height<30).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
  select((candidates[0]||rows[0]).id);setView('oblique');updateSun();loading=false;const loadMs=performance.now()-startMs;
  window.mvp={loadMs,async benchmark(){const before=camera.position.clone(),start=performance.now();let n=0;while(performance.now()-start<3000){camera.position.applyAxisAngle(new THREE.Vector3(0,1,0),0.002);camera.lookAt(controls.target);render();n++;await new Promise(r=>requestAnimationFrame(r));}camera.position.copy(before);controls.update();render();return {fps:n/((performance.now()-start)/1000),calls:renderer.info.render.calls,textures:renderer.info.memory.textures,loadMs};},select,setView,exportPng,render,rows,objects,getState:()=>({selected,stats,solar,loaded:!loading,buildingCount:objects.size}),project(id){const box=new THREE.Box3().setFromObject(objects.get(id));const p=box.getCenter(new THREE.Vector3()).project(camera);const r=renderer.domElement.getBoundingClientRect();return {x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};},snapshot:()=>renderer.domElement.toDataURL(),rendererInfo:()=>JSON.parse(JSON.stringify(renderer.info)),cameraState:()=>({position:camera.position.toArray(),target:controls.target.toArray()})};
}catch(e){$('view-label').textContent=`読み込み失敗：${e.message}`;console.error(e);}
