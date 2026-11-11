# 制作支援プラン用データ

このフォルダの大きい地図データは、公開リポジトリには入れていません。

## 同梱しているもの

- `cost-model.json` … 金額計算の係数（推定）
- `supporters.json` … 支援者表示の例（実在の申し込みではありません）
- `stripe-test.example.json` … Stripe テスト設定の書き方。本物のアカウント ID や Payment Link は書かないでください。使うときは `stripe-test.json` にコピーし、自分の値を入れます（`stripe-test.json` は gitignore 対象です）
- `areas.example.json` … 町丁一覧ファイルの形だけを示す小さな例

## 自分で用意するもの

試作画面を動かすには、次のファイルが必要です。

- `areas.json` … 町丁・字等の一覧と金額計算用の属性
- `map-minato.geojson` / `map-kyoto.geojson` / `map-sapporo-chuo.geojson` … 表示用に簡略化した境界

原典は「令和2年国勢調査 町丁・字等境界データ」（政府統計の総合窓口 e-Stat）です。利用規約（政府標準利用規約 第2.0版）に従い、出典と加工の旨を記載してください。統計用の境界であり、住居表示の町丁・字と一致しない場合があります。

形の参考に、`areas.example.json` を `areas.json` としてコピーできます。これだけでは全国の一覧や地図は出ません。
