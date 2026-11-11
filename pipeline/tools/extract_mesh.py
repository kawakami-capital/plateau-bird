# 新橋範囲の建物抽出：属性CSV・高さ不明一覧・幾何（ローカル座標）・テクスチャ参照をJSONに保存
import json, csv, sys
from lxml import etree
from pyproj import Transformer
import argparse,os
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--gml',required=True);ap.add_argument('--workdir',required=True);ap.add_argument('--origin',nargs=2,type=float,default=[35.6652,139.7572]);args=ap.parse_args()
GML=str(Path(args.gml).resolve());os.chdir(args.workdir)
Path('work').mkdir(exist_ok=True)
header=Path(GML).open().read(5000)
if 'EPSG/0/6697' not in header and 'EPSG::6697' not in header:
 raise RuntimeError('未対応の座標系。自動変換せず停止します（今回の確認はEPSG:6697のみ）')
LAT0,LAT1,LON0,LON1=-90,90,-180,180
CLAT,CLON=args.origin
NS={'gml':'http://www.opengis.net/gml'}
G='{http://www.opengis.net/gml}'
_tr=Transformer.from_crs('EPSG:6668',f'+proj=aeqd +lat_0={CLAT} +lon_0={CLON} +ellps=GRS80 +units=m',always_xy=True)
class LocalTransform:
 def transform(self,lat,lon):
  east,north=_tr.transform(lon,lat);return north,east
tr=LocalTransform();OX=OY=0.0

def codelist(name):
    path=Path(f'src/codelists/{name}.xml'); d={}
    if not path.exists(): return d
    t=etree.parse(str(path))
    for df in t.iter(G+'Definition'):
        n=df.find(G+'name'); ds=df.find(G+'description')
        if n is not None: d[n.text.strip()]=(ds.text or '').strip() if ds is not None else ''
    return d
CL={k:codelist(k) for k in ['Building_usage','Building_class','Building_lodType','DataQualityAttribute_geometrySrcDesc','PublicSurveyDataQualityAttribute_geometrySrcDesc','DataQualityAttribute_appearanceSrcDesc']}
def dec(cl,v): return CL[cl].get(v,'') if v else ''
def txt(el,path):
    e=el.find(path); return e.text.strip() if e is not None and e.text else ''

rows=[]; geoms={}; polyids=set(); base_h=[]
for ev,el in etree.iterparse(GML,events=('end',),tag='{*}Building',huge_tree=True):
    p=el.getparent()
    if p is None or etree.QName(p).localname!='cityObjectMember': continue
    bid=el.get(G+'id')
    pl=el.find('.//'+G+'posList')
    if pl is None: el.clear(); continue
    v=list(map(float,pl.text.split())); lat=sum(v[0::3])/len(v[0::3]); lon=sum(v[1::3])/len(v[1::3])
    if not (LAT0<=lat<=LAT1 and LON0<=lon<=LON1):
        el.clear()
        while el.getprevious() is not None: del el.getparent()[0]
        continue
    h=txt(el,'{*}measuredHeight')
    usage=txt(el,'{*}usage'); cls=txt(el,'{*}class')
    lodt=txt(el,'.//{*}lodType')
    g2=txt(el,'.//{*}geometrySrcDescLod2'); ps2=txt(el,'.//{*}publicSurveySrcDescLod2'); ap2=txt(el,'.//{*}appearanceSrcDescLod2')
    addr=txt(el,'.//{*}LocalityName')
    name=txt(el,'{http://www.opengis.net/gml}name')
    # LOD2面
    surfs=[]
    for bnd in el.findall('{*}boundedBy'):
        for s in bnd:
            st=etree.QName(s).localname
            for ms in s.iter('{*}lod2MultiSurface'):
                for poly in ms.iter(G+'Polygon'):
                    rings=[]
                    for ring in poly.iter(G+'LinearRing'):
                        c=list(map(float,ring.find(G+'posList').text.split()))
                        pts=[]
                        for i in range(0,len(c),3):
                            x,y=tr.transform(c[i],c[i+1]); pts.append((y-OY, c[i+2], -(x-OX)))  # 東, 高さ, -北
                        rings.append((ring.get(G+'id'),pts))
                    pid=poly.get(G+'id'); polyids.add(pid)
                    surfs.append(dict(type=st,pid=pid,rings=rings))
    if not surfs:
        solid=el.find('.//{*}lod1Solid')
        if solid is not None:
            for poly in solid.iter(G+'Polygon'):
                rings=[]
                for ring in poly.iter(G+'LinearRing'):
                    vals=list(map(float,ring.find(G+'posList').text.split()));points=[]
                    for i in range(0,len(vals),3):
                        north,east=tr.transform(vals[i],vals[i+1]);points.append((east,vals[i+2],-north))
                    rings.append((ring.get(G+'id'),points))
                surfs.append(dict(type='WallSurface',pid=poly.get(G+'id'),rings=rings))
    lod1=el.find('.//{*}lod1Solid') is not None
    lod2=el.find('.//{*}lod2Solid') is not None or el.find('.//{*}lod2MultiSurface') is not None
    geoms[bid]=surfs
    zs=[p[1] for s in surfs for r in s['rings'] for p in r[1]]
    zmin=min(zs) if zs else None
    rows.append(dict(建物ID=bid,名称=name,所在地=addr,緯度=round(lat,7),経度=round(lon,7),
        計測高さm=h,地上階数=txt(el,'{*}storeysAboveGround'),地下階数=txt(el,'{*}storeysBelowGround'),
        用途コード=usage,用途=dec('Building_usage',usage),建物区分コード=cls,建物区分=dec('Building_class',cls),
        LOD1形状=int(lod1),LOD2形状=int(lod2),LOD種別=lodt,LOD2面数=len(surfs),
        LOD2形状の出典区分=dec('DataQualityAttribute_geometrySrcDesc',g2) or g2,
        LOD2公共測量の種類=dec('PublicSurveyDataQualityAttribute_geometrySrcDesc',ps2) or ps2,
        LOD2外観の出典区分=dec('DataQualityAttribute_appearanceSrcDesc',ap2) or ap2,
        作成日=txt(el,'{*}creationDate'),最低標高m=round(zmin,3) if zmin is not None else '',
        LOD2形状の原典年度候補='棟別未特定（区の原典資料リスト参照）',
        **{'高さ・LOD1原典年度候補':'棟別未特定（区の原典資料リスト参照）',
        '用途・階数原典':'区の原典資料リスト参照（自動照合なし）'}))
    el.clear()
    while el.getprevious() is not None: del el.getparent()[0]
print('buildings',len(rows),file=sys.stderr)
# テクスチャ（Appearanceは文書先頭）
tex={}; imgs={}
for ev,el in etree.iterparse(GML,events=('end',),tag='{*}ParameterizedTexture',huge_tree=True):
    uri=txt(el,'{*}imageURI')
    for t in el.findall('{*}target'):
        pid=(t.get('uri') or '').lstrip('#')
        if pid in polyids:
            rc={}
            for tc in t.iter('{*}textureCoordinates'):
                rc[tc.get('ring').lstrip('#')]=list(map(float,tc.text.split()))
            tex[pid]=(uri,rc); imgs[uri]=1
    el.clear()
    while el.getprevious() is not None: del el.getparent()[0]
texpolys=set(tex)
for r in rows:
    ps=[s['pid'] for s in geoms[r['建物ID']]]
    n=sum(p in texpolys for p in ps)
    r['テクスチャ有無']=int(n>0); r['テクスチャ付き面の割合']=f'{n}/{len(ps)}'
print('textured polys',len(tex),'images',len(imgs),file=sys.stderr)
keys=list(rows[0].keys())
with open('buildings.csv','w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=keys); w.writeheader(); w.writerows(rows)
json.dump(dict(origin=dict(lat=CLAT,lon=CLON,X=OX,Y=OY,crs='ローカル正距方位図法・GRS80'),geoms=geoms,tex=tex,images=sorted(imgs)),open('work/geom.json','w'))
