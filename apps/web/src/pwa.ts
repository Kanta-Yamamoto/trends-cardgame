import { useEffect, useState } from "react";

/**
 * PWA（ホーム画面に追加して、アプリのように全画面で遊ぶ）
 * - 本番のビルドだけサービスワーカーを登録する（開発中・試遊ページ・スマホアプリ版では登録しない）
 * - インストールの案内：Android/PC の Chrome は「アプリにする」ボタン、iPhone は共有メニューからの手順を出す
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function registerPwa() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });

  const native = "Capacitor" in window;
  if (!import.meta.env.PROD || import.meta.env.BASE_URL !== "/" || native || !("serviceWorker" in navigator))
    return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録できなくても、普通の Web として遊べる
    });
  });
}

/** インストールの案内の状態 */
export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (isStandalone()) return { kind: "installed" as const };
  if (deferred) {
    const ev = deferred;
    return {
      kind: "prompt" as const,
      install: async () => {
        await ev.prompt();
        await ev.userChoice;
        deferred = null;
        notify();
      },
    };
  }
  if (isIos()) return { kind: "ios" as const };
  return { kind: "none" as const };
}
