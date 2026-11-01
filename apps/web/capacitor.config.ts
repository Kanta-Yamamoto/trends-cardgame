import type { CapacitorConfig } from "@capacitor/cli";

// iOS アプリは `pnpm cap:sync` で画面を組み立てて ios/ に入れる（手順は docs/ios-release.md）
const config: CapacitorConfig = {
  appId: "com.kakuremiino.trends",
  appName: "TRENDS",
  webDir: "dist",
  ios: { contentInset: "never", scrollEnabled: false },
};

export default config;
