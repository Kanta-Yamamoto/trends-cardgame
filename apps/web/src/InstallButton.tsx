import { useState } from "react";
import { useInstall } from "./pwa";

/** ナビの「アプリにする」。ホーム画面に追加すると、ブラウザの枠なしの全画面で遊べる */
export function InstallButton() {
  const install = useInstall();
  const [tip, setTip] = useState(false);
  if (install.kind === "installed" || install.kind === "none") return null;
  if (install.kind === "prompt") {
    return (
      <button type="button" className="btn small install-btn" onClick={install.install}>
        アプリにする
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn small install-btn"
        onClick={() => setTip((v) => !v)}
        aria-expanded={tip}
      >
        アプリにする
      </button>
      {tip && (
        <div className="install-tip" role="dialog" aria-label="ホーム画面に追加する手順">
          <p>
            Safari の <b>共有ボタン</b>（□に↑）→ <b>ホーム画面に追加</b>{" "}
            を押すと、ホーム画面のアイコンから全画面で遊べます。
          </p>
          <button type="button" className="btn ghost small" onClick={() => setTip(false)}>
            閉じる
          </button>
        </div>
      )}
    </>
  );
}
