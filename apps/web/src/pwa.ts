import { useEffect, useState } from "react";
import { isApp } from "./native";

/**
 * PWA（ホーム画面に追加して、アプリのように全画面で遊ぶ）
 * - 本番のビルドだけサービスワーカーを登録する（開発中・試遊ページ・スマホアプリ版では登録しない）
 * - インストールの案内：Android/PC の Chrome は「アプリにする」ボタン、iPhone は共有メニューからの手順を出す
 * - 新しい版を出したら、開いたままの画面も、ホーム画面にいるときに黙って読み直す（押す操作は要らない）
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

  if (autoUpdate()) {
    for (const ev of ["pointerdown", "keydown"]) {
      document.addEventListener(
        ev,
        () => {
          lastInput = Date.now();
        },
        true,
      );
    }
    // アプリに戻ってきたとき（ホーム画面のアプリは閉じずに裏に置かれやすい）
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void checkUpdate(Date.now());
    });
  }

  if (!import.meta.env.PROD || import.meta.env.BASE_URL !== "/" || isApp || !("serviceWorker" in navigator))
    return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // アプリに戻ってきたときにも、新しい版が出ていないか確かめる（ホーム画面のアプリは開きっぱなしになりやすい）
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void reg.update().catch(() => {});
        });
      })
      .catch(() => {
        // 登録できなくても、普通の Web として遊べる
      });
  });
}

/* ---------- 新しい版に自動で切り替える（10月27日） ----------
 * 本番を入れ替えても、開いたままの画面は前の版の JS で動き続ける（画面を開き直せば、サービスワーカーがネットから新しい版を取る）。
 * アプリに戻ってきたとき・ホーム画面に来たときに、サーバーの版の印（version.json。vite.config.ts）と比べ、違っていれば読み直す。
 * 読み直すのはホーム画面にいるときだけ（対戦・デッキ作り・ガチャの途中を消さない）。確かめている間に画面を触ったら、次の機会に回す
 */

/** サーバーに出ている新しい版の印（まだ知らなければ null） */
let newer: string | null = null;
/** ホーム画面を開いているか（読み直してよい場所） */
let atHome = false;
/** 最後に画面を触った時刻 */
let lastInput = 0;
/** 最後に version.json を確かめた時刻（戻ってくるたびに何度も取りに行かない） */
let lastCheck = 0;
const CHECK_INTERVAL = 30_000;
/** 読み直した版の印（同じ版のための読み直しは 1 回だけ。読み直しても前の版のままなら繰り返さない） */
const RELOADED_KEY = "trends.reloadedFor";

/** 自動の更新を使うか（本番の Web だけ。試遊ページ・スマホアプリ版は使わない） */
function autoUpdate() {
  return import.meta.env.PROD && import.meta.env.BASE_URL === "/" && !isApp;
}

/** サーバーに出ている版の印（取れなければ null） */
async function serverBuild(): Promise<string | null> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) return null;
    const { build } = (await res.json()) as { build?: unknown };
    return typeof build === "string" ? build : null;
  } catch {
    return null;
  }
}

/** 新しい版が出ていないか確かめ、出ていてホーム画面にいれば読み直す（since より後に画面を触っていたら読み直さない） */
async function checkUpdate(since: number) {
  if (!newer && Date.now() - lastCheck > CHECK_INTERVAL) {
    lastCheck = Date.now();
    const build = await serverBuild();
    if (build && build !== __BUILD_ID__) newer = build;
  }
  if (!newer || !atHome || lastInput > since || document.visibilityState !== "visible") return;
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === newer) return;
    sessionStorage.setItem(RELOADED_KEY, newer);
  } catch {
    // 覚えられない環境では、繰り返しを防げないので読み直さない（開き直せば新しい版になる）
    return;
  }
  window.location.reload();
}

/** ホーム画面で呼ぶ：開いている間は、新しい版が出ていれば読み直してよい（来たときにも確かめる） */
export function useReloadWhenNewer() {
  useEffect(() => {
    atHome = true;
    if (autoUpdate()) void checkUpdate(Date.now());
    return () => {
      atHome = false;
    };
  }, []);
}

/**
 * アプリを最新にする：保存しているアプリのファイル（サービスワーカーとそのキャッシュ）を消して、読み直す。
 * 不具合らしいときの逃げ道。ホーム画面のアプリには再読み込みボタンもキャッシュを消す画面も無いので、画面から呼べるようにする。
 * デッキ・ログイン・設定（localStorage・ログインの Cookie）は消さない
 */
export async function refreshApp() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // 消せなくても読み直す
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("trends-")).map((k) => caches.delete(k)));
  } catch {
    // 消せなくても読み直す
  }
  window.location.reload();
}

/** 初めての人に案内を自動で出すか（閉じてから7日は出さない・「もう表示しない」なら出さない） */
const GUIDE_KEY = "trends.installGuide";
export function shouldAutoGuide() {
  if (isStandalone() || !isTouchDevice() || import.meta.env.BASE_URL !== "/" || isApp) return false;
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
