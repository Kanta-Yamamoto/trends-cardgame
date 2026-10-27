import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * 版の印（ビルドごとに変わる）。画面の JS に埋め込み、同じ値を version.json として配る。
 * 開いたままの古い画面は、これをサーバーの version.json と比べて、新しい版が出たことを知る（src/pwa.ts）
 */
const BUILD_ID = Date.now().toString(36);

function versionFile(): Plugin {
  return {
    name: "trends-version",
    apply: "build",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: { port: 5173 },
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], css: false },
});
