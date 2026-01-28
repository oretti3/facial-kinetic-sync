# 技術レポート: ポーズ推定ライブラリの選定変更について (MediaPipe → MoveNet)

本ドキュメントでは、ポーズ推定機能の実装において当初計画していた `MediaPipe` から `TensorFlow.js (MoveNet)` へ移行した経緯、理由、および結果についてまとめます。

## 1. 変更の概要

- **当初計画**: Google MediaPipe Solutions (`@mediapipe/pose`) を NPM パッケージとして導入し、React コンポーネント内で import して利用する。
- **最終実装**: TensorFlow.js の `MoveNet` モデルを、CDN (`next/script`) 経由でロードして利用する方式に変更。

## 2. MediaPipe (BlazePose) で発生した問題

実装初期において、以下の2つの致命的な問題に直面しました。

### A. ビルド・依存解決のエラー (Webpack/Next.js)
`@mediapipe/pose` およびそれをラップする `@tensorflow-models/pose-detection` の一部バージョンにおいて、CommonJS と ES Modules の互換性問題が発生しました。
- **症状**: `Export 'Pose' doesn't exist in target module` というエラーがビルド時または実行時に発生。
- **原因**: Next.js (Webpack) が、MediaPipe パッケージ内の複雑なエクスポート構造を正しく解釈できなかったため。

### B. WebGL コンテキストエラー (仮想環境依存)
現在の開発環境（DevContainer / 仮想化環境）において、ブラウザ（またはWebView相当のランタイム）が GPU アクセラレーションを十分にサポートしていない、あるいは初期化に失敗する現象が確認されました。
- **症状**: `Failed to create WebGL canvas context` エラーにより、MediaPipe のグラフ実行エンジンがクラッシュする。
- **試行した対策**:
  - `cpu` バックエンドへの強制スイッチ（効果薄）
  - 中間 Canvas を挟んだ画像データのバッファリング（解決せず）

## 3. MoveNet (TensorFlow.js) への移行理由と勝因

これらの問題を一挙に解決するため、アプローチを根本から変更しました。

### 勝因1: CDN によるビルド回避
NPM パッケージとしての `import` を諦め、昔ながらの `<script>` タグ（Next.js では `next/script`）によるグローバル読み込みを採用しました。
- これにより、Webpack のバンドル処理を完全にバイパスし、「ライブラリが見つからない」「Exportがない」といったビルドエラーを物理的に無効化しました。

### 勝因2: Node 依存の排除
MoveNet は TensorFlow.js ネイティブのモデルであり、MediaPipe 独自の WASM ランタイム（`ggraph` 等）への依存がありません。これにより、純粋な JavaScript/WebAssembly 環境で動作しやすくなっています。

### 勝因3: 柔軟なバックエンド選択
TensorFlow.js は `webgl`, `wasm`, `cpu` のバックエンドを明示的に切り替えられます。今回は `wasm` (WebAssembly) を優先し、ダメなら `cpu` にフォールバックするロジックを組むことで、GPU が不安定な環境でも確実に動作するよう構成しました。

## 4. モデルの精度と特性の比較

今回採用した `MoveNet (SinglePose Lightning)` と、当初予定していた `BlazePose (MediaPipe)` の比較です。

| 特徴 | BlazePose (Original Plan) | MoveNet (Current Implementation) |
| :--- | :--- | :--- |
| **ターゲット** | 高精度なフィットネス解析、AR | 高速なモバイル動作、ジェスチャー認識 |
| **キーポイント数** | 33点 (手足の指先まで含む) | 17点 (COCO準拠、主要関節のみ) |
| **精度** | **非常に高い** (回転や隠れに強い) | **標準的** (Lightningは速度重視) |
| **速度** | 重い (GPU必須級) | **非常に軽い** (CPUでもFPSが出る) |
| **ジッター(震え)** | 少ない | 若干あり (Smoothingで対策済み) |

### 判定への影響
今回開発する「笑顔・スクワット判定アプリ」において：
- **スクワット判定**: 腰、膝、足首の座標が必要ですが、MoveNet の 17点に含まれているため**技術的に問題ありません**。
- **精度**: Lightning 版でもスクワットの「しゃがみ込み」を判定するには十分な精度があります。もし精度不足を感じた場合は、コード内のモデルタイプを `SINGLEPOSE_THUNDER` (高精度版) に書き換えるだけでアップグレード可能です。

## 5. 今後の展望 (顔認識について)

次は「笑顔判定（Face Mesh）」の実装が必要ですが、ここでも同様の戦略（CDN + TensorFlow.js）をとるのが安全です。
- **推奨**: TensorFlow.js の `FaceLandmarksDetection` モデルを使用する。
- これも MediaPipe の Face Mesh と同等の精度を持ちつつ、今回構築した CDN パイプラインを流用できます。

以上
