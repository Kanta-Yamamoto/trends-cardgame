// SNS に出す動画の撮影用のページ（手元だけ。本番のビルドには入らない）。?card=c3 のカードを1枚、画面の真ん中に出す。
// 撮るのは tools/promo-video.mjs（docs/promo-video.md）
import { CARDS } from "@trends/cards";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "@fontsource/m-plus-1/800.css";
import "@fontsource/m-plus-1/900.css";
import "@fontsource/lilita-one/400.css";
import "@fontsource/m-plus-rounded-1c/800.css";
import "@fontsource/dela-gothic-one/400.css";
import "@fontsource/zen-antique/400.css";
import "@fontsource/zen-old-mincho/900.css";
import "../cards/cards.css";
import "../cards/generic.css";
import "../cards/rare.css";
import "../cards/rare5.css";
import "../cards/stats.css";
import "../styles/app.css";
import "./promo.css";
import { HoloCard } from "../cards/HoloCard";

const q = new URLSearchParams(location.search);
const card = CARDS.find((c) => c.id === (q.get("card") ?? "c3"));
if (!card) throw new Error("カードがありません");

const root = createRoot(document.getElementById("root") as HTMLElement);
const show = () =>
  flushSync(() =>
    root.render(
      <div className="promo">
        <div className="promo-card">
          <HoloCard card={card} interactive idle={false} darkForm={q.has("dark")} />
        </div>
      </div>,
    ),
  );
// 録画では、時計を止めてからカードを出す（出た瞬間からの動きを撮るため）。?wait のときは呼ばれるまで出さない
if (q.has("wait")) Object.assign(window, { showCard: show });
else show();
