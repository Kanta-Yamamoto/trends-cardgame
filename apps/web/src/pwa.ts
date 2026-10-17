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

export function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

/** スマホ・タブレット（指で触る端末） */
export function isTouchDevice() {
  return window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
}

export function isIos() {
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

/** 初めての人に案内を自動で出すか（閉じてから7日は出さない・「もう表示しない」なら出さない） */
const GUIDE_KEY = "trends.installGuide";
export function shouldAutoGuide() {
  if (isStandalone() || !isTouchDevice() || import.meta.env.BASE_URL !== "/" || "Capacitor" in window)
    return false;
  try {
    const v = localStorage.getItem(GUIDE_KEY);
    if (v === "never") return false;
    if (v && Date.now() - Number(v) < 7 * 24 * 3600 * 1000) return false;
  } catch {
    // 保存できない環境では毎回出す
  }
  return true;
}
export function dismissGuide(forever: boolean) {
  try {
    localStorage.setItem(GUIDE_KEY, forever ? "never" : String(Date.now()));
  } catch {
    // 保存できなくてもよい
  }
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
