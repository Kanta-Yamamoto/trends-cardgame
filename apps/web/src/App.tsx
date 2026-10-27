import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Login } from "./auth/Login";
import { RegisterScreen } from "./auth/Register";
import { useDeckSync } from "./game/deckSync";
import { HelpSheet } from "./help/HelpSheet";
import { InstallAutoGuide } from "./InstallButton";
import { useSession } from "./online/session";
import { Decks } from "./pages/Decks";
import { Gacha } from "./pages/Gacha";
import { GachaRates } from "./pages/GachaRates";
import { Gallery } from "./pages/Gallery";
import { Home } from "./pages/Home";
import { MyPage } from "./pages/MyPage";
import { OnlineLobby, OnlineRoom } from "./pages/Online";
import { Play } from "./pages/Play";
import { Ranking } from "./pages/Ranking";
import { Shop } from "./pages/Shop";
import { TopBar } from "./TopBar";

export function App() {
  // ログインしているあいだは、自分で組んだデッキをアカウントとそろえる
  useDeckSync();
  const user = useSession((st) => st.user);
  const check = useSession((st) => st.check);
  const { pathname } = useLocation();
  // 開いたときに一度、保存してあるログインがまだ使えるか確かめる（期限は 30 日）
  useEffect(() => {
    void check();
  }, [check]);
  // サービス全体でログインが要る（10月26日）。ログインしていなければ、どのページを開いてもログインの画面だけ
  if (!user) return <LoginScreen />;
  // プレイヤー名を決めるまでは、初期登録の画面だけ（10月27日。前の版で保存したログインは、確かめ終わるまでそのまま使う）
  if (user.nameSet === false) return <RegisterScreen />;
  // 最初に開く場所はホーム画面（10月26日）。ほかの画面は上の帯の「ホーム」で戻る
  const home = pathname === "/";
  return (
    <div className={home ? "home-shell" : "shell"}>
      {!home && <TopBar />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cards" element={<Gallery />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/play" element={<Play />} />
          <Route path="/online" element={<OnlineLobby />} />
          <Route path="/online/:code" element={<OnlineRoom />} />
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/gacha" element={<Gacha />} />
          <Route path="/gacha/rates" element={<GachaRates />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/me" element={<MyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <InstallAutoGuide />
      <HelpSheet />
    </div>
  );
}

/** ログインの画面：★5 のキャラクターを真ん中に、下にすりガラスの台（Google でログイン） */
function LoginScreen() {
  return (
    <div className="login-screen">
      <div className="login-bg" aria-hidden="true">
        <span style={{ backgroundImage: "url(/assets/cards/c13-art.jpg)" }} />
      </div>
      <span className="login-rays" aria-hidden="true" />
      <img className="login-chara" src="/assets/cards/c13-subject.webp" alt="" draggable={false} />
      <h1 className="login-brand">TRENDS</h1>
      <main className="login-box g3">
        <Login />
      </main>
    </div>
  );
}
