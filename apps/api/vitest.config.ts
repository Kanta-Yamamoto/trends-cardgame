import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Nest の依存注入はデコレータのメタデータが必要なので、esbuild ではなく SWC で変換する
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
  },
});
