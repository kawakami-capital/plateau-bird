"""ローカルHTTP・モデル構造の検査。ブラウザの実操作検証とは別。"""
import json,re,struct,shutil,datetime,hashlib
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import quote,urljoin
root=Path.home()/'plateau-map';base='http://127.0.0.1:8771/'
report={'検証日時':datetime.datetime.now().isoformat()+' 日本標準時','HTTP':[],'モデル':[],'未検証':['ブラウザでの3D描画・操作・PNGダウンロード','実機フレームレート','公開前の権利・測量法等']}
def get(path):
 url=base+quote(path,safe='/?.=&%')
 with urlopen(url,timeout=30) as r:
  data=r.read();report['HTTP'].append({'パス':path,'状態':r.status,'バイト':len(data)});return data
for path in ['','service-page/','service-page/style.css','viewer/index.html','viewer/style.css','viewer/app.js','viewer/logic.mjs']:
 get(path)
for f in (root/'viewer/vendor').rglob('*.js'):get(f.relative_to(root).as_posix())
mp='outputs/13103_港区/viewer-manifest.json';mf=json.loads(get(mp));total=0
for mesh in mf['meshes']:
 ap='outputs/13103_港区/'+mesh['attributes'];attrs=json.loads(get(ap));total+=len(attrs)
 gp='outputs/13103_港区/'+mesh['model'];raw=get(gp)
 magic,version,length=struct.unpack_from('<III',raw);assert magic==0x46546c67 and version==2 and length==len(raw)
 size,typ=struct.unpack_from('<II',raw,12);assert typ==0x4e4f534a
 doc=json.loads(raw[20:20+size]);nodes=doc['nodes'];assert len(nodes)==len(attrs)
 assert doc.get('textures') and doc.get('images')
 assert all('uri' not in x for x in doc['images'])
 report['モデル'].append({'メッシュ':mesh['id'],'棟数':len(attrs),'ノード':len(nodes),'画像':len(doc['images']),'GLBバイト':len(raw),'SHA256':hashlib.sha256(raw).hexdigest()})
html=(root/'viewer/index.html').read_text();js=(root/'viewer/app.js').read_text();ids=set(re.findall(r'id="([^"]+)"',html));refs=set(re.findall(r"\$\('([^']+)'\)",js));assert not refs-ids,refs-ids
landing=(root/'service-page/index.html').read_text();assert '<form' not in landing and 'disabled' in landing and '料金：未定' in landing
report['棟数']=total;report['空きバイト']=shutil.disk_usage(root).free;assert report['空きバイト']>30_000_000_000
report['判定']='HTTP・構造・参照の検査に合格。ブラウザ実操作は未検証'
(root/'service-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False,indent=2))
