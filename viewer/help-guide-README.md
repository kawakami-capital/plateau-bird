# 共通の日本語操作ガイド

- `help-guide.mjs`：`BIRD_HELP_CONTENT`（文言データ）、`mountViewerHelp`（Three.js非依存のダイアログ）をexport。
- `help-guide.css`：外部スタイルシート。必ず同時に読み込む。
- 初回だけ自動表示し、閉じるとlocalStorageへ記録。右上の操作方法ボタンから再表示。保存を拒否するブラウザーでは再訪時に再び表示される場合がある。
- native dialogのEsc・Tab・ボタンのEnter／Spaceを利用。矢印キーのカメラ操作やダブルクリック操作は追加していない。

```js
import {mountViewerHelp,BIRD_HELP_CONTENT} from './help-guide.mjs';
const guide=mountViewerHelp({
  container:document.querySelector('.header-actions'),
  content:BIRD_HELP_CONTENT,
  storageKey:'plateau-bird-ai-help-v1', // ビューごとに分離
  isReady:()=>viewerReady,
  onOpen:()=>stopFlight()
});
```

`/bird-ai/` へ再利用する際は、そのビューの実際のマウス・タッチ・キー・UI割当を確認し、異なる項目は `content` の配列を差し替えること。鳥瞰版の操作をAI版にも実装済みとみなさない。ここにある文言はThree.js r170 OrbitControlsの既定割当と、`/bird/app.mjs` の実装を根拠にしている。

トラックパッド：2本指スクロールはホイールイベントとしてズーム。ピンチはブラウザーがCtrl付きwheelに変換する場合のみ。スマホ：1本指回転、2本指の重心移動でパン・距離変化でズーム。OrbitControls.listenToKeyEventsは呼んでいないためカメラの矢印キー操作なし。
