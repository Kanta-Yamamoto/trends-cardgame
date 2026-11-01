import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/** iOS アプリの中で動いているか（Capacitor）。アプリにログインは無く、売るのもアプリだけ */
export const isApp = Capacitor.isNativePlatform();

const KEY = "trends.device";

/** この端末の秘密の文字列（アカウントの鍵）。初めてなら作る。消えたときは「購入を復元」で元のアカウントに戻る */
export async function deviceSecret() {
  const { value } = await Preferences.get({ key: KEY });
  if (value) return value;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await Preferences.set({ key: KEY, value: secret });
  return secret;
}

/** データを消したあと、次は新しいアカウントで始める */
export const forgetDevice = () => Preferences.remove({ key: KEY });
