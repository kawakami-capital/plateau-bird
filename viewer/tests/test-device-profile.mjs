import assert from 'node:assert/strict';import fs from 'node:fs';import {deviceProfile,isMobileDevice} from '../device-profile.mjs';
const iphone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1',platform:'iPhone',maxTouchPoints:5},pc={userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0',platform:'Win32',maxTouchPoints:0};
assert.equal(isMobileDevice(iphone),true);assert.equal(isMobileDevice(pc),false);
const m=deviceProfile({search:'',navigator:iphone}),p=deviceProfile({search:'',navigator:pc});
assert.equal(m.lowMemory,true);assert.equal(m.atlasMax,1024);assert.ok(m.pixelRatioMax<=1.5);assert.equal(m.composerSamples,0);assert.equal(m.antialias,false);
assert.equal(p.lowMemory,false);assert.equal(p.atlasMax,Infinity);assert.equal(p.composerSamples,4);assert.equal(p.antialias,true);assert.equal(p.shadowMapSize,2048);
assert.equal(deviceProfile({search:'?lowmem=1',navigator:pc}).lowMemory,true);assert.equal(deviceProfile({search:'?lowmem=0',navigator:iphone}).lowMemory,false);
const app=fs.readFileSync(new URL('../app.mjs',import.meta.url),'utf8');assert.match(app,/await shrinkAtlases\(\);attachBuckets/);assert.match(app,/webglcontextlost/);assert.match(app,/device.pixelRatioMax/);
console.log('合格：スマホは外観画像1024角・描画倍率1.5以下・MSAAなし、PCは従来どおり、?lowmem で切替、コンテキスト喪失の案内');
