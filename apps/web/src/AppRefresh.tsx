import { useState } from "react";
import { refreshApp, useUpdateReady } from "./pwa";

/** 上のメニューの「最新にする」：保存しているアプリのファイルを消して読み直す（不具合らしいときの逃げ道） */
export function RefreshButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn ghost small refresh-btn"
      title="保存しているアプリのファイルを消して、最新の版を読み直します（デッキやログインは消えません）"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void refreshApp();
      }}
    >
      {busy ? "読み直し中…" : "最新にする"}
    </button>
  );
}

/** 新しい版が出ているときの帯（押すと切り替わる。対戦中に勝手に読み直さない） */
export function UpdateBar() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <span>新しい版があります</span>
      <button type="button" className="btn small" onClick={() => window.location.reload()}>
        更新する
      </button>
    </div>
  );
}
