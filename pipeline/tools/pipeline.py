"""都市単位の取得→メッシュ変換→一時原典削除。公開・認証・送信機能なし。
カタログ（pipeline/catalog/*.json）の都市を指定する。
"""
import argparse,json,sys,os,re,time,shutil,hashlib,struct,zlib,csv,subprocess,datetime
from pathlib import Path
from urllib.parse import urlparse
import requests
from remotezip import RemoteZip
K=Path(__file__).resolve().parents[1];TOOLS=K/'tools'
p=argparse.ArgumentParser();p.add_argument('--catalog',default='cities10.json');p.add_argument('--city',required=True);p.add_argument('--meshes',nargs='*');p.add_argument('--list-only',action='store_true');p.add_argument('--all-meshes',action='store_true');p.add_argument('--root',default=str(Path.home()/'plateau-map'));p.add_argument('--min-free-gb',type=float,default=30);p.add_argument('--min-free-percent',type=float,default=0);p.add_argument('--origin',nargs=2,type=float,default=None);p.add_argument('--full-zip',action='store_true');a=p.parse_args()
root=Path(a.root).expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
config=json.loads((K/'catalog'/a.catalog).read_text());city=next((c for c in config if c['code']==a.city),None)
if city is None:raise SystemExit('指定した都市カタログにない都市です')
if a.origin is None:
    a.origin = city.get('origin')
if not a.origin or len(a.origin)!=2:raise SystemExit('カタログに origin（緯度 経度）を入れるか、--origin 緯度 経度 を指定してください')
if a.min_free_gb<30:raise SystemExit('安全のため停止基準は30GB未満にできません')
citydir=root/'outputs'/f"{city['code']}_{city['name']}";citydir.mkdir(parents=True,exist_ok=True)
scratch=root/'_scratch'/city['code'];scratch.mkdir(parents=True,exist_ok=True)
log=citydir/'ledger.jsonl';t0=time.time()
def sha(path):
 h=hashlib.sha256()
 with Path(path).open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def record(event,**kw):
 with log.open('a') as f:f.write(json.dumps({'日時JST':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(),'段階':event,**kw},ensure_ascii=False)+'\n')
def guard(required=0):
 du=shutil.disk_usage(root);threshold=max(a.min_free_gb*1e9,du.total*a.min_free_percent/100)
 if du.free-required<threshold:
  record('安全停止',空きバイト=du.free,必要追加バイト=required,確保する空きバイト=threshold)
  raise RuntimeError('空き容量が安全基準を下回る見込みです。30GBまたは20%を必ず残して停止。')
def safe_path(base,name):
 out=(base/name).resolve()
 if not out.is_relative_to(base.resolve()):raise ValueError('不正なZIP内パス')
 return out
url=city['zip_url']
if urlparse(url).scheme!='https' or urlparse(url).hostname!='assets.cms.plateau.reearth.io':raise RuntimeError('設定された公式公開配布先以外へ接続しません')
guard(100_000_000)
record('開始',区=city['name'],原典URL=url,配布ページ=city['catalog_url'],選択ライセンス='CC BY 4.0を選択する方針。原典READMEで個別条件確認',原点緯度経度=a.origin)
# 目録のみ遠隔取得。都市全体のZIPは既定では保存しない。
with RemoteZip(url) as z:infos=z.infolist()
info={x.filename:x for x in infos if not x.is_dir()};gmls={}
for n,i in info.items():
 m=re.fullmatch(r'udx/bldg/(\d{8})_bldg_\d+_op\.gml',n)
 if m:gmls[m.group(1)]=n
(citydir/'mesh-index.json').write_text(json.dumps({m:{'name':n,'raw_bytes':info[n].file_size,'compressed_bytes':info[n].compress_size} for m,n in gmls.items()},indent=2))
if a.list_only:
 print(json.dumps({'区':city['name'],'メッシュ数':len(gmls),'メッシュ':list(gmls),'GML展開後GB':sum(info[n].file_size for n in gmls.values())/1e9},ensure_ascii=False));sys.exit(0)
if not a.all_meshes and not a.meshes:raise SystemExit('まず --list-only、次に --meshes で小さく確認。全区処理は --all-meshes を明示。')
meshes=sorted(gmls) if a.all_meshes else a.meshes
if any(m not in gmls for m in meshes):raise SystemExit('存在しないメッシュです')
fullzip=None
if a.full_zip:
 size=city['zip_size'];guard(size*1.1);fullzip=scratch/'original.zip'
 if fullzip.exists():raise RuntimeError('以前のZIPがあります。上書きしません。確認してから再実行してください')
 with requests.get(url,stream=True,timeout=90) as r:
  r.raise_for_status()
  with fullzip.open('wb') as f:
   for b in r.iter_content(4*1024*1024):guard(len(b));f.write(b)
 record('原ZIP取得',保存先=str(fullzip),sha256=sha(fullzip))
# 近接ZIPエントリをまとめ、画像を数千回HTTPで取りに行くことを避ける。
def obtain(names,base):
 names=[n for n in names if not (base/n).exists()]
 if not names:return
 guard(sum(info[n].file_size for n in names)*1.3+50_000_000)
 if fullzip:
  import zipfile
  with zipfile.ZipFile(fullzip) as z:
   for n in names:
    dest=safe_path(base,n);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(n))
  return
 seq=sorted([info[n] for n in names],key=lambda i:i.header_offset);groups=[];cur=[];lo=hi=0
 for i in seq:
  end=i.header_offset+30+len(i.filename.encode())+len(i.extra)+i.compress_size+256
  if cur and (i.header_offset-hi>1_000_000 or end-lo>128*1024*1024):groups.append((lo,hi,cur));cur=[]
  if not cur:lo=i.header_offset
  hi=max(end,hi) if cur else end;cur.append(i)
 if cur:groups.append((lo,hi,cur))
 for start,end,group in groups:
  guard((end-start)*2)
  r=requests.get(url,headers={'Range':f'bytes={start}-{end-1}','Accept-Encoding':'identity'},stream=True,timeout=90)
  if r.status_code!=206: r.close();raise RuntimeError('HTTP部分取得に非対応。巨大ZIPの全取得へ自動では切り替えず停止')
  buf=bytearray()
  for b in r.iter_content(2*1024*1024):
   if len(buf)+len(b)>end-start+1024:raise RuntimeError('予想より大きな応答。停止')
   guard(len(b));buf.extend(b)
  for i in group:
   off=i.header_offset-start;head=struct.unpack_from('<IHHHHHIIIHH',buf,off)
   if head[0]!=0x04034b50:raise RuntimeError('ZIPのローカルヘッダーが不正')
   pos=off+30+head[-2]+head[-1];raw=bytes(buf[pos:pos+i.compress_size]);data=zlib.decompress(raw,-15) if i.compress_type==8 else raw if i.compress_type==0 else None
   if data is None or len(data)!=i.file_size or zlib.crc32(data)&0xffffffff!=i.CRC:raise RuntimeError('ZIP内CRCまたは長さが不一致')
   dest=safe_path(base,i.filename);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
metadata=[n for n in info if n.startswith('metadata/') or n.startswith('codelists/') or n=='README.md']
obtain(metadata,scratch/'src')
# 配布情報だけは一時原典を消す前に区フォルダへ残す。
for n in ['README.md']+[n for n in metadata if n.startswith('metadata/')]:
 f=scratch/'src'/n
 if f.exists():dest=citydir/'source-notes'/n;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
manifestpath=citydir/'manifest.json';manifest=json.loads(manifestpath.read_text()) if manifestpath.exists() else {'city':city,'origin':a.origin,'meshes':[]}
for mesh in meshes:
 mt=time.time();out=citydir/'meshes'/mesh
 if (out/'model.glb').exists():
  previous=next((x for x in manifest['meshes'] if x['id']==mesh),None)
  if previous and previous['glb_sha256']==sha(out/'model.glb'):
   print(mesh,'台帳・ハッシュ一致の出力を保持・スキップ',flush=True);continue
  raise RuntimeError('GLBは存在しますが完了台帳と一致しません。上書きせず停止。未完了出力を別フォルダへ退避して確認してください。')
 work=scratch/mesh;work.mkdir(exist_ok=True);(work/'src').mkdir(exist_ok=True)
 # 抽出スクリプト用のコードリストをコピー。その他はメッシュごとに隔離。
 shutil.copytree(scratch/'src/codelists',work/'src/codelists',dirs_exist_ok=True)
 n=gmls[mesh];obtain([n],work/'src')
 subprocess.run([sys.executable,str(TOOLS/'extract_mesh.py'),'--gml',str(work/'src'/n),'--workdir',str(work),'--origin',*map(str,a.origin)],check=True)
 geom=json.loads((work/'work/geom.json').read_text());needed=['udx/bldg/'+u for u in geom['images'] if 'udx/bldg/'+u in info]
 if len(needed)!=len(geom['images']):raise RuntimeError('GMLから参照された画像がZIPにありません。停止')
 obtain(needed,work/'src')
 rawsize=sum(f.stat().st_size for f in work.rglob('*') if f.is_file());guard(rawsize*1.2+100_000_000)
 out.mkdir(parents=True,exist_ok=True)
 subprocess.run([sys.executable,str(TOOLS/'atlas_glb.py'),'--geom',str(work/'work/geom.json'),'--images',str(work/'src/udx/bldg'),'--out',str(out/'model.glb'),'--atlas-dir',str(work/'atlas'),'--source-name',f"{city['name']}（{city['year']}年度）"],check=True)
 attrs=[]
 def num(v):
  try:v=float(v);return None if v in [-9999,9999] else v
  except:return None
 from pyproj import Transformer
 tr=Transformer.from_crs('EPSG:6668',f'+proj=aeqd +lat_0={a.origin[0]} +lon_0={a.origin[1]} +ellps=GRS80 +units=m',always_xy=True)
 for r in csv.DictReader(open(work/'buildings.csv',encoding='utf-8-sig')):
  # 表示原点と同じ座標から建物の代表位置を計算する。
  x,y=tr.transform(float(r['経度']),float(r['緯度']))
  attrs.append(dict(id=r['建物ID'],name=r['名称'],address=r['所在地'],height=num(r['計測高さm']),storeys=num(r['地上階数']),underground=num(r['地下階数']),usage=r['用途'] or '不明',lod='2' if r['LOD2形状']=='1' else '1',textured=r['テクスチャ有無']=='1',lat=float(r['緯度']),lon=float(r['経度']),x=x,z=-y))
 (out/'buildings.json').write_text(json.dumps(attrs,ensure_ascii=False))
 shutil.copy2(work/'buildings.csv',out/'buildings.csv')
 gmlhash=sha(work/'src'/n);glbhash=sha(out/'model.glb')
 row={'id':mesh,'model':str(out/'model.glb'),'attributes':str(out/'buildings.json'),'buildings':len(attrs),'raw_bytes':rawsize,'output_bytes':sum(f.stat().st_size for f in out.iterdir() if f.is_file()),'elapsed_seconds':round(time.time()-mt,2),'gml_sha256':gmlhash,'glb_sha256':glbhash,'geometry':'原典GML→共通の正距方位ローカル座標→LOD2、なければLOD1→GLB','texture':'アトラス化・JPEG再圧縮。外観が無い棟は単色','unknown':'原典年度・権利の例外は区のREADMEと原典資料を別確認'}
 record('メッシュ変換完了',**row);manifest['meshes'].append(row);manifestpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
 # 同じ実行で生成した一時原典だけを消す。出力・台帳・区の原典資料は保持。
 shutil.rmtree(work);record('メッシュ一時原典削除',対象=str(work));print(mesh,row['buildings'],'棟',row['output_bytes'],'バイト',row['elapsed_seconds'],'秒',flush=True)
# 原ZIPを使った場合も成功後に削除。区を直列に1つずつ処理する。
if fullzip:fullzip.unlink();record('原ZIP削除',対象=str(fullzip))
shutil.rmtree(scratch);record('区の処理完了',秒=round(time.time()-t0,2),一時データ='削除済み・原典メタデータとハッシュは保持')
print('完了',citydir,flush=True)
