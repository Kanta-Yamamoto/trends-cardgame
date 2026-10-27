import { useState } from "react";
import { canShare, shareLink, useInviteLink } from "./invite";

/**
 * 友だちを招待する（ホームのメニュー・マイページの小窓の中身）。
 * 招待済みの人なら誰でも、公開前の招待リンク（合言葉付き）を出して送れる。
 * リンクを LINE・X などに貼ると、絵と題名のプレビューが出る（サーバーの ogp.ts）
 */
export function InviteFriends() {
  const { link, failed } = useInviteLink("/");
  const [copied, setCopied] = useState(false);
  const share = canShare();

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="invite">
      <p className="invite-lead">このリンクを送ると、友だちも TRENDS で遊べます。</p>
      <p className="invite-link">
        {link ??
          (failed
            ? "リンクを作れませんでした。電波のよいところで開き直してください"
            : "リンクを作っています…")}
      </p>
      <div className={`invite-btns${share ? "" : " one"}`}>
        {share && (
          <button type="button" className="btn" disabled={!link} onClick={() => link && void shareLink(link)}>
            リンクを送る
          </button>
        )}
        <button type="button" className={share ? "btn ghost" : "btn"} disabled={!link} onClick={copy}>
          {copied ? "コピーしました" : "リンクをコピー"}
        </button>
      </div>
      <p className="invite-note">開いた友だちは、Google でログインしてプレイヤー名を決めると遊べます。</p>
    </div>
  );
}
