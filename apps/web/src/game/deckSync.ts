import { useEffect } from "react";
import { api, useSession } from "../online/session";
import { type CustomDeck, loadCustomDecks, saveCustomDecks } from "./decks";

/**
 * 自分で組んだデッキを、ログインしたアカウント（サーバー）とそろえる。
 * - ログインしていないときは、これまでどおり端末にだけ保存する
 * - ログインしたら、サーバーの一覧と端末の一覧を合わせて、両方に保存する（どの端末から入っても同じデッキが出る）
 * - 保存・削除は、端末に保存したうえでサーバーにも送る
 */

/** 端末の一覧が変わったことを画面に知らせるイベント名 */
export const DECKS_CHANGED = "trends:decks-changed";
const syncedKey = (userId: string) => `trends.customDecks.synced.${userId}`;

/** このアカウントで、サーバーと一度そろえたデッキの ID（ほかの端末で消したデッキを見分けるため） */
function loadSynced(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(syncedKey(userId));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
function saveSynced(userId: string, decks: readonly CustomDeck[]) {
  try {
    localStorage.setItem(syncedKey(userId), JSON.stringify(decks.map((d) => d.id)));
  } catch {
    // 保存できなくても、次にそろえるときに困るのは「ほかの端末で消したデッキが戻る」ことだけ
  }
}

/**
 * 端末の一覧とサーバーの一覧を合わせる。
 * - 両方にあるデッキは、保存した時刻（updated）が新しいほう（同じならサーバー）
 * - サーバーにだけあるデッキは、端末に足す
 * - 端末にだけあるデッキは、前にそろえたことがあれば「ほかの端末で消した」とみなして消し、無ければ新しく組んだデッキとして残す
 * upload は、合わせた結果をサーバーに送り直す必要があるか
 */
export function mergeDecks(
  local: readonly CustomDeck[],
  server: readonly CustomDeck[],
  synced: ReadonlySet<string>,
): { decks: CustomDeck[]; upload: boolean } {
  const localById = new Map(local.map((d) => [d.id, d]));
  const serverIds = new Set(server.map((d) => d.id));
  let upload = false;
  const decks = server.map((s) => {
    const l = localById.get(s.id);
    if (l && l.updated > s.updated) {
      upload = true;
      return l;
    }
    return s;
  });
  for (const l of local) {
    if (serverIds.has(l.id) || synced.has(l.id)) continue;
    decks.push(l);
    upload = true;
  }
  return { decks, upload };
}

function announce() {
  window.dispatchEvent(new Event(DECKS_CHANGED));
}

/** サーバーの一覧と端末の一覧を合わせて、両方に保存する */
export async function syncDecks(token: string, userId: string) {
  const server = await api<{ decks: CustomDeck[] }>("/me/decks", {}, token);
  const { decks, upload } = mergeDecks(loadCustomDecks(), server.decks, loadSynced(userId));
  saveCustomDecks(decks);
  if (upload) await api("/me/decks", { method: "PUT", body: JSON.stringify({ decks }) }, token);
  saveSynced(userId, decks);
  announce();
  return decks;
}

/** 端末の一覧をサーバーに送る（デッキを保存・削除したとき）。送れなかったら false */
export async function pushDecks(decks: readonly CustomDeck[]): Promise<boolean> {
  const { token, user } = useSession.getState();
  if (!token || !user) return false;
  try {
    await api("/me/decks", { method: "PUT", body: JSON.stringify({ decks }) }, token);
    saveSynced(user.id, decks);
    return true;
  } catch {
    return false;
  }
}

/** ログインしているあいだ、アプリを開いたときとログインしたときにデッキをそろえる */
export function useDeckSync() {
  const token = useSession((s) => s.token);
  const userId = useSession((s) => s.user?.id);
  useEffect(() => {
    if (!token || !userId) return;
    syncDecks(token, userId).catch(() => {
      // 電波が無いときなどは、端末の一覧のまま遊べる
    });
  }, [token, userId]);
}

/** 端末の一覧が変わったら呼ぶ（デッキ構築・デッキ選択の画面で使う） */
export function useDecksChanged(onChange: () => void) {
  useEffect(() => {
    window.addEventListener(DECKS_CHANGED, onChange);
    return () => window.removeEventListener(DECKS_CHANGED, onChange);
  }, [onChange]);
}
