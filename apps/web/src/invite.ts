import { useEffect, useState } from "react";
import { API_URL } from "./api/client";

/**
 * 友だちを誘うリンク。公開前の招待リンクの守りが効いているときは、合言葉（?invite=）を付ける
 * （まだ招待されていない友だちでも、このリンク1つで入れるように。docs/deploy.md「招待リンク」）。
 * 合言葉は、招待済みの人だけがサーバーから受け取れる（/auth/invite。守りが効いていなければ null）
 */

/** 合言葉付きのリンクで開いたとき、アドレスバーから合言葉を消す（ホーム画面に追加したアプリや、URL をそのまま送ったときに残らないように） */
export function stripInviteFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

let asked: Promise<string | null> | null = null;
/** 合言葉を1回だけ聞きに行く（守りが効いていなければ null）。失敗したら投げ、次はまた聞きに行く */
function fetchInvite(): Promise<string | null> {
  asked ??= fetch(`${API_URL}/auth/invite`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ invite?: string | null }>;
    })
    .then((b) => b.invite ?? null)
    .catch((err: unknown) => {
      asked = null;
      throw err;
    });
  return asked;
}

/** path（"/" や "/online/AB12"）へのリンク。合言葉を聞けるまでは null、聞けなかったら failed */
export function useInviteLink(path: string): { link: string | null; failed: boolean } {
  const [state, setState] = useState<{ link: string | null; failed: boolean }>({ link: null, failed: false });
  useEffect(() => {
    let alive = true;
    fetchInvite()
      .then((code) => {
        const url = new URL(path, window.location.origin);
        if (code) url.searchParams.set("invite", code);
        if (alive) setState({ link: url.toString(), failed: false });
      })
      .catch(() => {
        if (alive) setState({ link: null, failed: true });
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return state;
}

/** 端末の「共有」（LINE などに送る画面）が使えるか。PC のブラウザなどは使えないので、コピーだけにする */
export const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** 共有の画面を出す。やめたときは false */
export async function shareLink(link: string): Promise<boolean> {
  try {
    await navigator.share({ title: "TRENDS", text: "TRENDS で一緒に遊ぼう", url: link });
    return true;
  } catch {
    return false;
  }
}
