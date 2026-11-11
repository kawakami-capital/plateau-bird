# geom.json → GLB（単色版・テクスチャ版）。棟ごとに1ノード、ノード名＝建物ID
import json, struct, sys, os, numpy as np, mapbox_earcut as earcut
g=json.load(open('work/geom.json'))
SKIP={'GroundSurface'}
def tri_poly(rings, uvrings):
    ext=np.array(rings[0],dtype=np.float64)
    # Newell法線
    n=np.zeros(3)
    for i in range(len(ext)):
        a=ext[i]; b=ext[(i+1)%len(ext)]
        n+=[(a[1]-b[1])*(a[2]+b[2]),(a[2]-b[2])*(a[0]+b[0]),(a[0]-b[0])*(a[1]+b[1])]
    ln=np.linalg.norm(n)
    if ln<1e-12: return None
    n/=ln
    ax=int(np.argmax(np.abs(n))); keep=[i for i in range(3) if i!=ax]
    pts=np.vstack(rings); uv=np.vstack(uvrings) if uvrings is not None else None
    ends=np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx=earcut.triangulate_float64(pts[:,keep],ends).reshape(-1,3)
    if len(idx)==0: return None
    # 巻き順を法線に合わせる
    a,b,c=pts[idx[:,0]],pts[idx[:,1]],pts[idx[:,2]]
    tn=np.cross(b-a,c-a); flip=(tn@n)<0
    idx[flip]=idx[flip][:,[0,2,1]]
    return pts,idx,np.tile(n,(len(pts),1)),uv
def clean(pts):
    return pts[:-1] if len(pts)>1 and np.allclose(pts[0],pts[-1]) else pts

def build(textured, out, jpeg_dir=None):
    bin_=bytearray(); bvs=[]; accs=[]; meshes=[]; nodes=[]; mats=[]; imgs=[]; texs=[]; matidx={}
    def add_bv(data, target=None):
        while len(bin_)%4: bin_.append(0)
        off=len(bin_); bin_.extend(data)
        bv={'buffer':0,'byteOffset':off,'byteLength':len(data)}
        if target: bv['target']=target
        bvs.append(bv); return len(bvs)-1
    def add_acc(arr, ctype, typ, target, minmax=False):
        bv=add_bv(arr.tobytes(),target)
        a={'bufferView':bv,'componentType':ctype,'count':len(arr),'type':typ}
        if minmax: a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
        accs.append(a); return len(accs)-1
    def mat(key):
        if key in matidx: return matidx[key]
        if key=='roof': m={'name':'屋根','pbrMetallicRoughness':{'baseColorFactor':[0.80,0.72,0.62,1],'metallicFactor':0,'roughnessFactor':0.9},'doubleSided':True}
        elif key=='wall': m={'name':'壁','pbrMetallicRoughness':{'baseColorFactor':[0.88,0.88,0.86,1],'metallicFactor':0,'roughnessFactor':0.9},'doubleSided':True}
        else:
            data=open(os.path.join(jpeg_dir,key),'rb').read()
            imgs.append({'bufferView':add_bv(data),'mimeType':'image/jpeg'})
            texs.append({'source':len(imgs)-1,'sampler':0})
            m={'name':os.path.basename(key),'pbrMetallicRoughness':{'baseColorTexture':{'index':len(texs)-1},'metallicFactor':0,'roughnessFactor':1},'doubleSided':True}
        mats.append(m); matidx[key]=len(mats)-1; return matidx[key]
    tri_total=0
    for bid,surfs in g['geoms'].items():
        groups={}
        for s in surfs:
            if s['type'] in SKIP: continue
            rings=[clean(np.array(r[1])) for r in s['rings']]
            uvr=None; key='roof' if s['type']=='RoofSurface' else 'wall'
            if textured and s['pid'] in g['tex']:
                uri,rc=g['tex'][s['pid']]
                try:
                    uvr=[]
                    for (rid,_),rr in zip(s['rings'],rings):
                        u=np.array(rc[rid]).reshape(-1,2)[:len(rr)]
                        if len(u)!=len(rr): raise KeyError
                        uvr.append(u)
                    key=uri
                except KeyError: uvr=None
            r=tri_poly(rings,uvr)
            if r is None: continue
            groups.setdefault(key,[]).append(r)
        prims=[]
        for key,lst in groups.items():
            P=[];I=[];N=[];U=[];off=0
            for pts,idx,nn,uv in lst:
                P.append(pts);N.append(nn);I.append(idx+off);off+=len(pts)
                if uv is not None: U.append(uv)
            P=np.vstack(P).astype(np.float32);N=np.vstack(N).astype(np.float32);I=np.vstack(I).astype(np.uint32).ravel()
            tri_total+=len(I)//3
            attr={'POSITION':add_acc(P,5126,'VEC3',34962,True),'NORMAL':add_acc(N,5126,'VEC3',34962)}
            if key not in ('roof','wall'):
                UU=np.vstack(U).astype(np.float32); UU[:,1]=1-UU[:,1]
                attr['TEXCOORD_0']=add_acc(UU,5126,'VEC2',34962)
            prims.append({'attributes':attr,'indices':add_acc(I,5125,'SCALAR',34963),'material':mat(key)})
        if not prims: continue
        meshes.append({'name':bid,'primitives':prims})
        nodes.append({'name':bid,'mesh':len(meshes)-1,'extras':{'gml_id':bid}})
    gl={'asset':{'version':'2.0','generator':'shinbashi build_glb.py（当方作成）','copyright':'出典：3D都市モデル（Project PLATEAU）港区（2025年度）CC BY 4.0。範囲抽出・座標変換・三角形分割等を当方で加工'},
        'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'materials':mats,
        'accessors':accs,'bufferViews':bvs,'buffers':[{'byteLength':len(bin_)}],
        'extras':{'origin':g['origin'],'axes':'x=東(m), y=標高(m, 原典標高そのまま), z=-北(m)'}}
    if textured: gl.update(images=imgs,textures=texs,samplers=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}])
    while len(bin_)%4: bin_.append(0)
    gl['buffers'][0]['byteLength']=len(bin_)
    js=json.dumps(gl,ensure_ascii=False).encode('utf-8')
    while len(js)%4: js+=b' '
    with open(out,'wb') as f:
        f.write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bin_)))
        f.write(struct.pack('<II',len(js),0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II',len(bin_),0x004E4942)); f.write(bin_)
    print(out,os.path.getsize(out),'bytes nodes',len(nodes),'tris',tri_total,'materials',len(mats))
os.makedirs('glb',exist_ok=True)
build(False,'glb/shinbashi_plain.glb')
if len(sys.argv)>1: build(True,'glb/shinbashi_textured.glb','src/udx/bldg')
