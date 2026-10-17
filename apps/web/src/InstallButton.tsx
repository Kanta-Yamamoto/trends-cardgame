import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { dismissGuide, isAndroid, isIos, shouldAutoGuide, useInstall } from "./pwa";

type Platform = "android" | "ios";
interface Step {
  text: string;
  img?: string;
}

const ANDROID_STEPS: Step[] = [
  { text: "Chrome の右上の「︙」を押す", img: "/install/android-1.webp" },
  { text: "メニューの「ホーム画面に追加」を押す", img: "/install/android-2.webp" },
  { text: "「インストール」を押す", img: "/install/android-3.webp" },
];
const IOS_STEPS: Step[] = [
  { text: "Safari の共有ボタン（□に↑）を押す。画面の下か、アドレスバーの横にあります" },
  { text: "「ホーム画面に追加」を押す（見つからなければ、メニューを下へスクロール）" },
  { text: "右上の「追加」を押す" },
];

/** ホーム画面に追加する手順の案内（スクショ付き） */
export function InstallGuide({ onClose }: { onClose: (forever: boolean) => void }) {
  const install = useInstall();
  const [platform, setPlatform] = useState<Platform>(isIos() ? "ios" : "android");
  const steps = platform === "android" ? ANDROID_STEPS : IOS_STEPS;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="zoom-sheet install-guide" role="dialog" aria-modal="true" aria-label="アプリとして入れる">
      <button type="button" className="zoom-sheet-bg" aria-label="あとで" onClick={() => onClose(false)} />
      <div className="ig-body">
        <img className="ig-icon" src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h2>TRENDS をアプリとして入れる</h2>
        <p className="muted">
          ホーム画面に追加すると、ブラウザの枠がない全画面で遊べます。無料で、すぐ終わります。
        </p>
        {install.kind === "prompt" && (
          <button
            type="button"
            className="btn ig-now"
            onClick={() => install.install().then(() => onClose(true))}
          >
            今すぐインストール
          </button>
        )}
        <div className="ig-tabs" role="tablist" aria-label="端末">
          {(["android", "ios"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              className={platform === p ? "on" : ""}
              onClick={() => setPlatform(p)}
            >
              {p === "android" ? "Android（Chrome）" : "iPhone（Safari）"}
            </button>
          ))}
        </div>
        <ol className="ig-steps">
          {steps.map((s, i) => (
            <li key={s.text}>
              <p>
                <b>{i + 1}</b>
                {s.text}
              </p>
              {s.img && <img src={s.img} alt={s.text} loading="lazy" />}
            </li>
          ))}
        </ol>
        <div className="ig-actions">
          <button type="button" className="btn ghost small" onClick={() => onClose(true)}>
            もう表示しない
          </button>
          <button type="button" className="btn" onClick={() => onClose(false)}>
            あとで
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ナビの「アプリにする」と、初めての人への案内。
 * 対戦中の画面では自動では出さない。アプリとして開いているときは何も出さない
 */
export function InstallButton() {
  const install = useInstall();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const inGame = pathname.startsWith("/play") || /^\/online\/.+/.test(pathname);

  useEffect(() => {
    if (inGame || !shouldAutoGuide()) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [inGame]);

  if (install.kind === "installed") return null;
  const show = install.kind === "prompt" || isIos() || isAndroid();
  return (
    <>
      {show && (
        <button type="button" className="btn small install-btn" onClick={() => setOpen(true)}>
          アプリにする
        </button>
      )}
      {open && (
        <InstallGuide
          onClose={(forever) => {
            dismissGuide(forever);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
