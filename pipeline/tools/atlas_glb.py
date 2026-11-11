"""局所の幾何JSONと原典JPEGからアトラス付きGLBを作る。原典を改変しない。"""
import argparse,json,io,copy,sys,time
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--geom',required=True);p.add_argument('--images',required=True);p.add_argument('--out',required=True);p.add_argument('--atlas-dir',required=True);p.add_argument('--max-image-size',type=int,default=512);p.add_argument('--source-name',default='区・年度は台帳参照');p.add_argument('--size',type=int,default=4096);a=p.parse_args();t=time.time()
g=json.loads(Path(a.geom).read_text());dest=Path(a.atlas_dir);dest.mkdir(parents=True,exist_ok=True)
S=a.size;pad=2;pages=[];positions={};x=y=pad;rowh=0;page=Image.new('RGB',(S,S),(210,210,210))
items=[];resized=0
for uri in g['images']:
 im=Image.open(Path(a.images)/uri)
 cap=min(S-4,a.max_image_size)
 if max(im.size)>cap:im.thumbnail((cap,cap));resized+=1
 im=im.convert('RGB')
 items.append((uri,im))
items.sort(key=lambda t:t[1].height,reverse=True)
for uri,im in items:
 if im.width+2*pad>S or im.height+2*pad>S:raise ValueError('画像がアトラスより大きい')
 if x+im.width+pad>S:x=pad;y+=rowh+2*pad;rowh=0
 if y+im.height+pad>S:pages.append(page);page=Image.new('RGB',(S,S),(210,210,210));x=y=pad;rowh=0
 positions[uri]=(len(pages),x,y,im.width,im.height)
 page.paste(im,(x,y))
 # 周囲2画素を延長して線形補間の継ぎ目を抑える。
 page.paste(im.crop((0,0,1,im.height)).resize((pad,im.height)),(x-pad,y));page.paste(im.crop((im.width-1,0,im.width,im.height)).resize((pad,im.height)),(x+im.width,y))
 page.paste(im.crop((0,0,im.width,1)).resize((im.width,pad)),(x,y-pad));page.paste(im.crop((0,im.height-1,im.width,im.height)).resize((im.width,pad)),(x,y+im.height))
 x+=im.width+2*pad;rowh=max(rowh,im.height)
pages.append(page)
names=[]
for i,im in enumerate(pages):
 n=f'atlas_{i:02}.jpg';im.save(dest/n,quality=75,optimize=True);names.append(n)
for pid,(uri,rings) in list(g['tex'].items()):
 page,x,y,w,h=positions[uri];rc={}
 for rid,uv in rings.items():
  out=[]
  for j in range(0,len(uv),2):out.extend([(x+uv[j]*w)/S,1-(y+(1-uv[j+1])*h)/S])
  rc[rid]=out
 g['tex'][pid]=[names[page],rc]
g['images']=names
# 既存のGLB書出し関数を実行定義だけ再利用。
src=(Path(__file__).parent/'build_glb.py').read_text().replace('港区（2025年度）',a.source_name);start=src.index('SKIP=');end=src.index("os.makedirs('glb'")
ns={'json':json,'struct':__import__('struct'),'sys':sys,'os':__import__('os'),'np':__import__('numpy'),'earcut':__import__('mapbox_earcut'),'g':g}
exec(src[start:end],ns);Path(a.out).parent.mkdir(parents=True,exist_ok=True);ns['build'](True,a.out,str(dest))
meta={'元画像数':len(items),'アトラス数':len(pages),'アトラス一辺':S,'長辺を制限して縮小した画像数':resized,'画像長辺上限':a.max_image_size,'JPEG品質':75,'出力バイト':Path(a.out).stat().st_size,'処理秒':round(time.time()-t,2)}
Path(a.out+'.report.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2));print(meta)
