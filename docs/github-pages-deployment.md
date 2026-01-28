# GitHub Pages Auto-Deployment Documentation

本プロジェクトでは、GitHub Actionsを使用してNext.jsアプリケーションをGitHub Pagesへ自動デプロイする構成をとっています。

## 構成概要

- **Framework**: Next.js (Static Export)
- **CI/CD**: GitHub Actions
- **Hosting**: GitHub Pages

## 設定手順（再現用）

この環境を構築するために実施した手順は以下の通りです。

### 1. Next.js 設定 (`next.config.ts`)

静的サイトとして出力し、GitHub Pagesのサブディレクトリ構成に対応させるための設定です。

```typescript
const nextConfig: NextConfig = {
  output: "export",              // 静的エクスポートの有効化
  basePath: "/facial-kinetic-sync", // リポジトリ名に合わせる
  assetPrefix: "/facial-kinetic-sync/", // アセット読み込みパスの調整
  images: {
    unoptimized: true,           // 画像最適化の無効化（Pagesでは使用できないため）
  },
};
```

### 2. GitHub Actions ワークフロー (`.github/workflows/deploy.yml`)

`main` ブランチへのプッシュをトリガーとして、自動的にビルド・デプロイを行うワークフローを作成しました。

- **Trigger**: `push: branches: ["main"]`
- **Build Step**: `npm run build`
- **Deploy Step**: `actions/deploy-pages`

### 3. GitHub リポジトリ設定

デプロイを機能させるため、以下の設定が必要です。

1. **Settings > Pages** にアクセス。
2. **Build and deployment > Source** を **GitHub Actions** に設定。
   - ※ワークフローをプッシュすると自動的に切り替わることが多いですが、エラーが出る場合はここを確認してください。

## 運用

- `main` ブランチへコードをプッシュすると、自動的に「Deploy Next.js site to Pages」ワークフローが開始されます。
- デプロイ完了後、`https://oretti3.github.io/facial-kinetic-sync/` にて最新版が確認できます。
