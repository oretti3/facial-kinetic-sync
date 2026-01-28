# Smile Squat 開発計画 - Phase 2: コア機能実装

## 1. 概要
本フェーズでは、アプリの核となる映像処理機能（Step 3）を実装します。
MediaPipeを使用し、ブラウザ上でリアルタイムに姿勢と表情を解析する基盤を構築します。

## 2. 実装機能
### F-01: カメラ入力基盤
Webカメラの映像を取得し、画面に表示するだけの最小構成。
- ライブラリ: `react-webcam`
- コンポーネント: `src/components/feature/CameraView.tsx`
- 要件:
  - フロントカメラの使用
  - レスポンシブ対応（スマホ・PC）
  - ミラーリング（鏡像）表示

### F-02: 姿勢推定 (Pose)
全身の骨格点を検出し、特にスクワット判定に必要な「腰」「膝」「足首」の座標を取得・可視化する。
- ライブラリ: `@mediapipe/pose`
- 実装ポイント:
  - `CameraView` 上に Canvasレイヤー を重ねて描画
  - リアルタイム推論ループの構築

### F-03: 表情推定 (Face Mesh)
顔のランドマークを検出し、笑顔判定に必要な「口角」「目」の座標を取得・可視化する。
- ライブラリ: `@mediapipe/face_mesh`
- 実装ポイント:
  - Poseと同様にCanvasへ描画（またはPoseと統合）
  - 処理負荷を考慮し、PoseとFaceMeshの同時実行パフォーマンスを確認

## 3. ファイル構成案
```
src/
  ├── components/
  │   ├── feature/
  │   │   └── CameraView.tsx  # Webcam + Canvas + Logic
  │   └── ui/                 # ボタンやゲージなどの汎用UI
  ├── lib/
  │   ├── poseUtils.ts        # 姿勢推定関連のヘルパー関数
  │   └── faceUtils.ts        # 表情推定関連のヘルパー関数
  └── app/
      └── page.tsx            # CameraViewをマウント
```

## 4. 実行手順
## 4. 実行手順
1. [x] `src/components/feature/CameraView.tsx` を作成し、Webカメラ映像を表示。
2. [x] `src/app/page.tsx` に配置して動作確認。
3. [x] MediaPipe Pose を組み込み、骨格描画を確認 (CDN + MoveNetへ変更済)。
4. [x] MediaPipe Face Mesh (Face Landmarks Detection) を組み込み、メッシュ描画を確認。
5. [x] 笑顔判定ロジックの実装 (Mouth Aspect Ratio > 0.45)。
6. [x] スクワット判定ロジックの実装 (Done)。
7. [ ] テストと調整 (Next Step)。
