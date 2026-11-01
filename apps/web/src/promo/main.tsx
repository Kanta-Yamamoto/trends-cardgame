// SNS に出す動画の撮影用のページ（手元だけ。本番のビルドには入らない）。撮るのは tools/promo-video.mjs（docs/promo-video.md）
//   ?card=c3      … カードを 1 枚、画面の真ん中に出す
//   ?scene=god    … 本物の盤面・開封の画面で、演出の場面を出す（scenes.tsx）
import { CARDS } from "@trends/cards";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import "@fontsource/m-plus-1/400.css";
import "@fontsource/m-plus-1/700.css";
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
import "../styles/battle.css";
import "./promo.css";
import { HoloCard } from "../cards/HoloCard";
import { watchFrame } from "../frame";
import { watchSoundEffects } from "../sound/se";
import { mountScene, promoActions } from "./scenes";

const q = new URLSearchParams(location.search);
const root = createRoot(document.getElementById("root") as HTMLElement);
const scene = q.get("scene");

const show = scene
  ? () => {
      watchSoundEffects();
      mountScene(root, scene);
      watchFrame();
    }
  : () => {
      const card = CARDS.find((c) => c.id === (q.get("card") ?? "c3"));
      if (!card) throw new Error("カードがありません");
      flushSync(() =>
        root.render(
          <div className="promo">
            <div className="promo-card">
              <HoloCard card={card} interactive idle={false} darkForm={q.has("dark")} />
            </div>
          </div>,
        ),
      );
    };
Object.assign(window, { promo: promoActions });
// 録画では、時計を止めてからカードを出す（出た瞬間からの動きを撮るため）。?wait のときは呼ばれるまで出さない
if (q.has("wait")) Object.assign(window, { showCard: show });
else show();
