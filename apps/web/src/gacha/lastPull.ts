import type { PulledCard } from "./Opening";

/**
 * 最後に開けたパックの中身を、見終わる（「ガチャへ」で閉じる）まで端末に残しておく（11月2日）。
 * オーナー：「ガチャを引ききった後に引いたカードを見ようと思ったら、画面全体のローディングが入って、ガチャを引く時の紹介のトップ画面に戻ってしまい、
 * 何を引いたのか不明になってしまった」。iPhone のアプリは、画面の中身（WebView）がメモリ不足などで落ちると、黙って読み直す。
 * そのときも、ガチャの画面に戻ったら、開けたパックの結果をもう一度見せる
 */
const KEY = "trends.lastPull";
/** これより古い結果は出し直さない */
const KEEP_MS = 60 * 60 * 1000;

interface Saved {
  user: string;
  at: number;
  packs: PulledCard[][];
  /** 出し直した回数（出し直した画面でまた落ちたときに、繰り返さない） */
  shown: number;
}

const read = (): Saved | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
};
const write = (v: Saved | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    // 残せない環境でも、ガチャはそのまま
  }
};

/** 開けたパックを残す */
export const keepPull = (user: string, packs: PulledCard[][]) =>
  write({ user, at: Date.now(), packs, shown: 0 });

/** 見終わった */
export const forgetPull = () => write(null);

/** 見終わっていない結果があれば、出し直す分を返す（1 回まで） */
export function resumePull(user: string): PulledCard[][] | null {
  const v = read();
  if (!v || v.user !== user || Date.now() - v.at > KEEP_MS || v.shown >= 1 || !Array.isArray(v.packs)) {
    if (v) write(null);
    return null;
  }
  write({ ...v, shown: v.shown + 1 });
  return v.packs;
}
