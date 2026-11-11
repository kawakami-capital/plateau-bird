"""地理院タイル（全国最新写真・シームレス）を結合し、鳥視点ビュー用の地面を作る。

利用条件（2026-11-11 確認）:
- 国土地理院コンテンツ利用規約（PDL1.0）: https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html
- 地理院タイル一覧: https://maps.gsi.go.jp/development/ichiran.html
  「写真」は基本測量成果以外で、出典の記載のみで利用可能。
- 出典は「国土地理院」または「地理院タイル」等と記載し、一覧ページへリンクする。
- 加工した場合はその旨を記載し、国土地理院が作成したように見せてはいけない。
- タイルによっては追加の出所明示が必要な場合がある（例: GRUS）。対象区域は一覧の備考を確認する。
大きな JPEG はリポジトリに含めない。生成先は --outdir（既定: ビューアの ground/）。
"""
from __future__ import annotations

import argparse
import io
import json
import math
import concurrent.futures
from pathlib import Path

import requests
from PIL import Image
from pyproj import CRS, Transformer

GSI_LIST = "https://maps.gsi.go.jp/development/ichiran.html"
GSI_LICENSE = "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html"
GSI_HOST = "cyberjapandata.gsi.go.jp"


def main():
    p = argparse.ArgumentParser(description="地理院タイルから鳥視点用の地面画像を作る")
    p.add_argument("--lat", type=float, required=True, help="原点の緯度")
    p.add_argument("--lon", type=float, required=True, help="原点の経度")
    p.add_argument("--code", required=True, help="都市コード（例: 26100）")
    p.add_argument("--outdir", default=None, help="ground/<code>/ を作る親ディレクトリ")
    p.add_argument("--zoom", type=int, default=16)
    p.add_argument("--half", type=int, default=3, help="中心タイルから東西南北へ伸ばす枚数")
    p.add_argument("--min-free-gb", type=float, default=30)
    args = p.parse_args()

    outdir = Path(args.outdir).expanduser().resolve() if args.outdir else Path(__file__).resolve().parents[2] / "viewer"
    dest = outdir / "ground" / args.code
    dest.mkdir(parents=True, exist_ok=True)
    cache = dest / "tiles"
    cache.mkdir(parents=True, exist_ok=True)

    import shutil
    du = shutil.disk_usage(dest)
    if du.free < args.min_free_gb * 1e9:
        raise SystemExit("空き容量が安全基準（30GB）を下回る見込みです。停止します。")

    z = args.zoom
    n = 2 ** z
    half = args.half
    lat, lon = args.lat, args.lon
    cx = int((lon + 180) / 360 * n)
    cy = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    tasks = [(x, y) for y in range(cy - half, cy + half + 1) for x in range(cx - half, cx + half + 1)]

    def fetch(t):
        x, y = t
        f = cache / f"{x}-{y}.jpg"
        u = f"https://{GSI_HOST}/xyz/seamlessphoto/{z}/{x}/{y}.jpg"
        try:
            if not f.exists():
                r = requests.get(u, timeout=25)
                r.raise_for_status()
                Image.open(io.BytesIO(r.content)).verify()
                f.write_bytes(r.content)
            return x, y, Image.open(f).convert("RGB"), u, None
        except Exception as e:
            return x, y, None, u, str(e)

    size = 256 * (half * 2 + 1)
    mosaic = Image.new("RGB", (size, size), (164, 175, 155))
    items = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for x, y, im, u, e in pool.map(fetch, tasks):
            if im:
                mosaic.paste(im, ((x - (cx - half)) * 256, (y - (cy - half)) * 256))
            items.append({"url": u, "ok": not bool(e), "error": e})
    mosaic.save(dest / "aerial.jpg", quality=90, optimize=True)

    def lonlat(x, y):
        return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))

    tr = Transformer.from_crs(
        "EPSG:4326",
        CRS.from_proj4(f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m"),
        always_xy=True,
    )
    corners = []
    for x, y in [
        (cx - half, cy - half),
        (cx - half, cy + half + 1),
        (cx + half + 1, cy - half),
        (cx + half + 1, cy + half + 1),
    ]:
        lo, la = lonlat(x, y)
        xx, yy = tr.transform(lo, la)
        corners.append([xx, -yy])

    meta = {
        "corners": corners,
        "image": "aerial.jpg",
        "zoom": z,
        "source": "地理院タイル（全国最新写真・シームレス）を結合・再圧縮・平面投影して作成",
        "source_url": GSI_LIST,
        "license_url": GSI_LICENSE,
        "license": "PDL1.0。基本測量成果以外・出典明示で利用可能な写真タイル。タイルの備考（第三者データや追加表記）は一覧で確認すること。",
        "tiles": items,
        "notice": "地形の起伏・撮影時点とPLATEAUの差は表現しない。樹木の自動生成は実測ではない。",
    }
    (dest / "ground.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8")
    ok = sum(1 for x in items if x["ok"])
    print(json.dumps({"code": args.code, "ok": ok, "total": len(items), "path": str(dest / "ground.json")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
