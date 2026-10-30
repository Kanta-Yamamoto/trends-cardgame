import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AppScroll } from "./AppScroll";
// 書体はアプリに同梱する（Google Fonts に繋がらない環境・スマホアプリ・オフラインでも同じ見た目に）
import "@fontsource/m-plus-1/400.css";
import "@fontsource/m-plus-1/700.css";
import "@fontsource/m-plus-1/800.css";
import "@fontsource/m-plus-1/900.css";
import "@fontsource/lilita-one/400.css";
// ★5 ミナモの名前（カード面と、場に出たときの演出）
import "@fontsource/m-plus-rounded-1c/800.css";
import "@fontsource/dela-gothic-one/400.css";
// 闇堕ちの演出の大きな文字（重いアンティーク明朝。文字の範囲ごとに分かれていて、使う字の分だけ読み込まれる）
import "@fontsource/zen-antique/400.css";
// 運営サイドの★5（『演出家』など、二色のカード面）の名前の明朝
import "@fontsource/zen-old-mincho/900.css";
import "./cards/cards.css";
import "./cards/generic.css";
import "./cards/rare.css";
import "./cards/rare5.css";
import "./cards/stats.css";
import "./styles/app.css";
import { hideBootWhenReady } from "./boot";
import { FRAME_ID, watchFrame } from "./frame";
import { stripInviteFromUrl } from "./invite";
import { isStandalone, registerPwa } from "./pwa";
import { watchTaps } from "./tapMark";
import { lockZoom } from "./viewport";

// 招待リンク（?invite=合言葉）で開いたら、アドレスバーから合言葉を消す（サーバーはクッキーを置いて画面を返すだけ）
stripInviteFromUrl();
registerPwa();
// 本番を入れ替えたあと、開いたままの古い画面が、消えたファイル（あとから読む部品）を読みに行くと失敗する。
// そのときは画面を読み直して、新しい版に切り替える（読み直しを繰り返さないよう、30 秒に 1 回まで）
window.addEventListener("vite:preloadError", (e) => {
  try {
    const last = Number(sessionStorage.getItem("trends-reloaded-at") ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem("trends-reloaded-at", String(Date.now()));
  } catch {
    // 保存できない環境でも読み直す
  }
  e.preventDefault();
  window.location.reload();
});
// ホーム画面のアプリとして開いているときは、どの画面でも拡大縮小しない（アプリらしく）
if (isStandalone()) lockZoom();

const root = document.getElementById("root");
if (!root) throw new Error("#root がありません");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <BrowserRouter>
        {/* 画面の枠：すべての画面と演出を、スマホの縦の画面1つの中だけで出す（frame.ts） */}
        <div id={FRAME_ID} className="app-frame">
          <AppScroll>
            <App />
          </AppScroll>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);

watchFrame();
// 起きるまでのローディング（index.html）を、サーバーが返事をしたら消す
hideBootWhenReady();
// 押した所に、やわらかい光を一瞬出す（どの画面でも）
watchTaps();
requestAnimationFrame(() => watchFrame());
