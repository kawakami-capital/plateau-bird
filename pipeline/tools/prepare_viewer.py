"""変換済みの outputs/ から、鳥視点ビューとメッシュ確認ビュー用のマニフェストを書く。送信なし。"""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path


def attribution_for(city: dict, catalog_url: str) -> str:
    name = city.get("name", "")
    year = city.get("year", "")
    return (
        f"出典：3D都市モデル（Project PLATEAU）{name}（{year}年度）"
        f"（国土交通省・G空間情報センター {catalog_url}）。"
        f"著作権者：{name}。"
        "PLATEAUサイトポリシー（PDL1.0、CC BY 4.0互換）に基づくCC BY 4.0での利用。"
        "部分取得、座標変換、三角形分割、画像縮小・JPEG再圧縮・アトラス化、GLB変換を実施。"
        "現況・個別条件は原典およびsource-notesを確認。国土交通省の作成・公認物ではありません。"
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--root", default=str(Path.home() / "plateau-map"))
    p.add_argument("--viewer-dir", default=None, help="cities.json を書く鳥視点ビューのディレクトリ")
    args = p.parse_args()
    root = Path(args.root).expanduser().resolve()
    kit = Path(__file__).resolve().parents[2]
    mesh_viewer_src = kit / "viewer-mesh"
    mesh_viewer = root / "viewer-mesh"
    if mesh_viewer_src.exists():
        import shutil
        shutil.copytree(mesh_viewer_src, mesh_viewer, dirs_exist_ok=True)

    bird_entries = []
    links = []
    for f in sorted((root / "outputs").glob("*/manifest.json")):
        m = json.loads(f.read_text(encoding="utf-8"))
        c = m["city"]
        entries = []
        for x in m["meshes"]:
            mesh = x["id"]
            model = f.parent / "meshes" / mesh / "model.glb"
            attrs = f.parent / "meshes" / mesh / "buildings.json"
            if not model.exists() or not attrs.exists():
                continue
            entries.append({
                "id": mesh,
                "model": f"meshes/{mesh}/model.glb",
                "attributes": f"meshes/{mesh}/buildings.json",
                "buildings": x["buildings"],
            })
        catalog_url = c.get("catalog_url", "")
        attr = attribution_for(c, catalog_url)
        mf = {
            "city": c["name"],
            "origin": m["origin"],
            "meshes": entries,
            "attribution": attr,
            "data_time": (
                f"データの時点：{c.get('year', '')}年度整備。"
                "各棟の測量・撮影・属性の原典年は区の原典資料リストを参照（自動照合なし）。"
                "現在の現況を保証しません。"
            ),
        }
        (f.parent / "viewer-manifest.json").write_text(
            json.dumps(mf, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8"
        )
        rel = f"../outputs/{f.parent.name}/viewer-manifest.json"
        url = f"viewer-mesh/index.html?manifest={rel}"
        links.append(f'<li><a href="{html.escape(url)}">{html.escape(c["name"])}：{len(entries)}メッシュ</a></li>')
        code = c.get("code") or f.parent.name.split("_")[0]
        ground = f"ground/{code}/ground.json"
        bird_entries.append({
            "code": code,
            "name": c["name"],
            "area": c.get("area") or c["name"],
            "meshes": [e["id"] for e in entries],
            "year": c.get("year"),
            "catalog_url": catalog_url,
            "license": "PLATEAUサイトポリシー（PDL1.0、CC BY 4.0互換。原典の個別条件を優先）",
            "license_url": "https://www.mlit.go.jp/plateau/site-policy/",
            "manifest": rel.replace("../outputs/", "../data/outputs/") if False else str(
                Path("..") / ".." / "data" / "outputs" / f.parent.name / "viewer-manifest.json"
            ),
            "attribution": attr,
            "origin": m["origin"],
            "ground": ground,
        })
        # 作業ルート直下で見る場合の相対パス（data を使わない）
        bird_entries[-1]["manifest"] = f"../outputs/{f.parent.name}/viewer-manifest.json"

    index = root / "index.html"
    index.write_text(
        '<!doctype html><html lang="ja"><meta charset="utf-8">'
        '<title>変換済みの都市</title><h1>変換済みの都市</h1>'
        '<p>ローカルのみ。鳥視点は <a href="viewer/">viewer/</a> を開きます。'
        'メッシュ単位の確認は次のリンクです。</p><ul>'
        + "".join(links)
        + '</ul>',
        encoding='utf-8',
    )

    viewer_dir = Path(args.viewer_dir).expanduser().resolve() if args.viewer_dir else (kit / "viewer")
    if bird_entries and viewer_dir.exists():
        (viewer_dir / "cities.json").write_text(
            json.dumps(bird_entries, ensure_ascii=False, indent=2) + chr(10), encoding="utf-8"
        )
        print("鳥視点用 cities.json:", viewer_dir / "cities.json")
    print("ローカル閲覧用に準備しました：", index)


if __name__ == "__main__":
    main()
