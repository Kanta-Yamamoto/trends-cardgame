import { API_URL } from "./api/client";

/** 長くてもこの時間で消す（つながらないときは、画面の中のいつもの案内に任せる） */
const LIMIT_MS = 20_000;

/**
 * 起きるまでのローディング（index.html の #boot。ソーダの泡）を、サーバーが返事をしたら消す。
 * 眠っていたサーバーは、起きて DB の準備を終えるまで /health に返事をしない（apps/api/src/main.ts）。
 * サーバーが起きていれば、すぐ返事が来て一瞬で消える。つながらないとき（電波なし）も、すぐ消す
 */
export function hideBootWhenReady() {
  const el = document.getElementById("boot");
  if (!el) return;
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    el.classList.add("out");
    window.setTimeout(() => el.remove(), 400);
  };
  const limit = window.setTimeout(hide, LIMIT_MS);
  fetch(`${API_URL}/health`, { cache: "no-store" })
    .catch(() => undefined)
    .finally(() => {
      window.clearTimeout(limit);
      hide();
    });
}
