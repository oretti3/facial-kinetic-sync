# Plan 04: MediaPipe Migration Complete & System Status

**Date:** 2026-01-28
**Status:** **Completed / Active Baseline**
**Previous Plans:**
- `plan_01_init.md` (Project Setup) - Done
- `plan_02_core_features.md` (TFJS Proto) - Superseded by Plan 04
- `tech_01_pose_pivot.md` (Pivot Decision) - Implemented

---

## 1. 完了したマイルストーン (Completed Milestones)

### 1-1. MediaPipe Tasks Vision への完全移行
旧来の `TensorFlow.js` ベースの実装を廃止し、より軽量で環境適応性の高い `MediaPipe Tasks Vision` (WASM) へ移行しました。

- **採用技術**: `@mediapipe/tasks-vision`
- **ロード戦略**: `FilesetResolver` によるCDN経由のWASM/モデルロード（Webpackバンドル問題を回避）
- **ハイブリッド実行**:
    - **GPU優先**: 対応環境では `delegate: "GPU"` で高速実行。
    - **CPUフォールバック**: 起動失敗時（Docker/Linux等）に自動で `delegate: "CPU"` へ切り替え。

### 1-2. ロジック実装
| 機能 | 旧実装 (TFJS) | 新実装 (MediaPipe) | 判定基準 |
| :--- | :--- | :--- | :--- |
| **笑顔判定** | 座標距離計算 | **Face Blendshapes** | `mouthSmileLeft` + `mouthSmileRight` > 0.45 |
| **スクワット** | 簡易角度計算 | **Pose Landmarks** | 膝角度 (Hip-Knee-Ankle) < 100° (DOWN) / > 160° (UP) |

### 1-3. 安全性・品質向上
- **エラーハンドリング**: 検出ループ内での `try-catch` 実装により、トラッキングロスト時のアプリクラッシュを防止。
- **コンソールノイズ除去**: MediaPipe (WASM) 特有の誤解を招くエラーログ (`XNNPACK delegate...`) を抑制。

---

## 2. 現在の課題 (Known Issues)

### Chromeにおける動作不安定
- **現象**: 一部のChrome環境において、WASM/GPUの初期化または実行時にエラーが発生し、動作しない場合がある。
- **現状の回避策**: Firefoxの利用を推奨。
- **対応予定**: 次期フェーズでの優先調査タスク。

---

## 3. 次のステップ (Next Steps)

1. **Chrome互換性の修正**: ユーザーの利用頻度が高いブラウザのため、優先度高。
2. **UI/UX Polishing**:
    - 現在のデバッグライクな描画（骨格線、テキスト）を、よりユーザーフレンドリーなデザインへ変更。
    - カウントのアニメーション、笑顔時のパーティクルエフェクトなど。
3. **新規インタラクション**:
    - "Wink" detection (ウィンクでシャッターなど)
    - "Head Nod" (頷きで決定)

---

> [!NOTE]
> 本ドキュメントは `plan_03` までの内容を統合し、現在の最新状態を定義するものです。これ以降の開発はこのファイルをベースラインとします。
