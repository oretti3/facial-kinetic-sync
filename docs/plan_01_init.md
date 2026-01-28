# Smile Squat 開発計画 - Phase 1: 初期セットアップとMVP構築

## 1. プロジェクト概要
**Smile Squat** - 「筋肉は泣いている。けれど顔は笑え。」
Webブラウザ上で完結する、スクワットと笑顔を同時に強要するトレーニングアプリ。

## 2. 技術スタック
- **Frontend**: React (Next.js), TypeScript
- **Styling**: Vanilla CSS (or Tailwind if requested, but user prompt implies detailed CSS work. The prompt said "Vanilla CSS (recommended)" in general rules, but user didn't specify. I will stick to Vanilla CSS or Modules unless specified otherwise, but Next.js usually comes with Tailwind. I'll probably use whatever is standard/easiest for the user or stick to the "Web Application Development" guideline which says Vanilla CSS is preferred unless Tailwind is requested. I will default to Vanilla CSS for maximum control per the system prompt.)
- **AI/CV**: MediaPipe Pose, MediaPipe Face Mesh
- **Hosting**: Vercel / Netlify

## 3. 実装ステップ

### Step 1: 環境構築 (完了)
- [x] プロジェクトディレクトリ作成
- [x] .devcontainer (devcontainer.json) の作成 (DNS設定含む)
- [x] Dev Containerでの再起動と接続

### Step 2: プロジェクト初期化 (完了)
- [x] Next.js プロジェクトのセットアップ (`npx create-next-app`)
- [x] 必要なライブラリのインストール
  - `@mediapipe/pose`
  - `@mediapipe/face_mesh`
  - `@mediapipe/camera_utils`
  - `react-webcam` (or native video element)

### Step 3: コア機能実装
- [ ] **F-01 カメラ入力**: Webカメラ映像の取得とCanvas描画
- [ ] **F-02 姿勢推定**: Poseモデルの組み込みと座標取得 (腰・膝・足首)
- [ ] **F-03 表情推定**: Face Meshモデルの組み込みと座標取得 (口角・目)

### Step 4: ロジック実装
- [ ] **L-01 スクワット判定**: 膝角度の計算とステート管理 (Stand <-> Squat)
- [ ] **L-02 笑顔判定**: 笑顔スコアの算出ロジック
- [ ] **L-03 AND条件判定**: スクワット && 笑顔 の同時判定ロジック

### Step 5: UI/UX 実装
- [ ] **U-01 笑顔ゲージ**: 視覚的なフィードバック
- [ ] **U-02 カウント演出**: 達成時のエフェクト
- [ ] **U-03 結果画面**: リザルト表示
- [ ] **U-04 SNSシェア**: シェア機能

## 4. 次のアクション
- Dev Container環境への切り替え後、`npx create-next-app@latest ./ --typescript --eslint` 等を実行してベースを作成する。
