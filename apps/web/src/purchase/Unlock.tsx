import { DAILY_PACKS } from "@trends/game-core";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { useAccess } from "../gacha/access";
import { useCollection } from "../gacha/collection";
import { isApp } from "../native";
import { api, type User, useSession } from "../online/session";
import { Store } from "./store";

/** 買い切りの小窓を開く（ガチャ・デッキ・マイページなどから） */
export const useUnlock = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

/**
 * App Store の購入をサーバーに送って解放する。jws が無ければ false。
 * 復元で元のアカウントに入れ替わったときは、全部読み直す
 */
export async function applyPurchase(get: () => Promise<{ jws: string | null }>) {
  const { jws } = await get();
  if (!jws) return false;
  const { token, user, setSession } = useSession.getState();
  const r = await api<{ token: string; user: User }>(
    "/me/purchase",
    { method: "POST", body: JSON.stringify({ jws }) },
    token,
  );
  setSession(r);
  if (r.user.id !== user?.id) window.location.replace("/");
  else {
    await useAccess.getState().load(r.token);
    await useCollection.getState().load(r.token);
  }
  return true;
}

/** 買い切りの小窓（11月1日）。値段は App Store から受け取り、購入の復元も置く（審査の決まり） */
export function UnlockSheet() {
  const open = useUnlock((s) => s.open);
  const hide = useUnlock((s) => s.hide);
  const [price, setPrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isApp) return;
    setError(null);
    Store.product()
      .then((p) => setPrice(p.price))
      .catch(() => setError("商品を読み込めませんでした。時間をおいて開き直してください"));
  }, [open]);

  if (!open) return null;

  const run = async (kind: "buy" | "restore") => {
    setBusy(true);
    setError(null);
    try {
      const ok = await applyPurchase(() => (kind === "buy" ? Store.buy() : Store.restore()));
      if (ok) hide();
      else if (kind === "restore") setError("復元できる購入が見つかりませんでした");
    } catch (e) {
      setError(e instanceof Error ? e.message : "購入できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="すべての機能を解放">
      <button type="button" className="sheet-bg" aria-label="閉じる" onClick={hide} />
      <section className="unlock-sheet">
        <div className="unlock-grip" aria-hidden="true" />
        <h2>すべての機能を解放</h2>
        <p className="unlock-lead">TRENDS のすべての機能が使えるようになります</p>
        <ul className="unlock-list g2">
          <li>デッキを組む</li>
          <li>パックを開ける（毎日 {DAILY_PACKS} パック）</li>
          <li>カードを集める</li>
        </ul>
        {error && <p className="unlock-error">{error}</p>}
        <button
          type="button"
          className="btn lg"
          data-decide-se
          disabled={busy || !price}
          onClick={() => void run("buy")}
        >
          {busy ? "手続き中…" : price ? `${price}で解放する` : "読み込み中…"}
        </button>
        <div className="unlock-sub">
          <button type="button" className="btn text" disabled={busy} onClick={() => void run("restore")}>
            購入を復元
          </button>
          <button type="button" className="btn text" onClick={hide}>
            あとで
          </button>
        </div>
      </section>
    </div>
  );
}
