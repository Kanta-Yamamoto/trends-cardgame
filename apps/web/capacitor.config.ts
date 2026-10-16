import type { CapacitorConfig } from "@capacitor/cli";

// iOS / Android アプリは Mac で `npx cap add ios`（または android）してから `pnpm cap:sync`
const config: CapacitorConfig = {
  appId: "com.kantayamamoto.trends",
  appName: "TRENDS",
  webDir: "dist",
};

export default config;
