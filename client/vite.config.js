// client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite の設定ファイル内でサーバ(app)変数などは使わないこと
// API ベースURLが必要なら VITE_API_BASE を使う（.env で定義）
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // 開発用。Render には影響しない
  server: {
    port: 5173
  },
  // 本番ビルド出力先（デフォ: dist）— index.js で dist を配信する場合はこのまま
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  // 必要に応じて環境変数を渡す
  define: {
    __APP_ENV__: JSON.stringify(mode)
  }
}));
