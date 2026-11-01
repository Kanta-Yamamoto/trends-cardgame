import { Link, useLocation } from "react-router";
import { isApp } from "./native";
import { useSession } from "./online/session";
import { useMusicPage } from "./sound/music";
import { SoundMenu } from "./sound/SoundMenu";

/** 画面ごとの題名（上の帯に出す）。小さい字は題名の下の説明 */
const TITLES: Record<string, { title: string; sub?: string }> = {
  "/cards": { title: "カード一覧" },
  "/decks": { title: "デッキを組む" },
  "/play": { title: "CPUと対戦" },
  "/online": { title: "オンライン対戦" },
  "/ranking": { title: "ランキング", sub: "ランダムマッチのレート" },
  "/gacha": { title: "ガチャ" },
  "/gacha/rates": { title: "提供割合", sub: "第1弾 DIRECTOR'S CUT" },
  "/me": { title: "マイページ" },
};
/** 戻るボタンの行き先（無ければホーム） */
const BACK: Record<string, string> = { "/gacha/rates": "/gacha" };

function titleOf(pathname: string) {
  if (pathname.startsWith("/online/")) return { title: "オンライン対戦", sub: "友だちとの部屋" };
  return TITLES[pathname] ?? { title: "" };
}

/** ホーム以外の画面の上の帯：左にホームへ戻るボタン、続けて画面の題名。曲の流れる画面（ガチャ・デッキ選び）では、右に音楽のボタン */
export function TopBar() {
  const { pathname } = useLocation();
  const name = useSession((st) => st.user?.name);
  const music = useMusicPage();
  const back = BACK[pathname] ?? "/";
  const { title, sub = pathname === "/online" && name && !isApp ? `${name} でログイン中` : undefined } =
    titleOf(pathname);
  return (
    <div className="topbar">
      <Link
        to={back}
        className="topbar-back g1"
        aria-label={back === "/" ? "ホームへ戻る" : "戻る"}
        data-tap-se
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </Link>
      <h1 className="topbar-title">
        {title}
        {sub && <small>{sub}</small>}
      </h1>
      {music && <SoundMenu className="topbar-music g1" />}
    </div>
  );
}
