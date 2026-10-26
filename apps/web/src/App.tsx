import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { UpdateBar } from "./AppRefresh";
import { Login } from "./auth/Login";
import { useDeckSync } from "./game/deckSync";
import { HelpSheet } from "./help/HelpSheet";
import { InstallAutoGuide } from "./InstallButton";
import { useSession } from "./online/session";
import { Decks } from "./pages/Decks";
import { Gacha } from "./pages/Gacha";
import { Gallery } from "./pages/Gallery";
import { Home } from "./pages/Home";
import { OnlineLobby, OnlineRoom } from "./pages/Online";
import { Play } from "./pages/Play";
import { Ranking } from "./pages/Ranking";
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <InstallAutoGuide />
      <HelpSheet />
      <UpdateBar />
    </div>
  );
}

function LoginScreen() {
  return (
    <div className="shell login-screen">
      <main>
        <section className="page">
          <header className="page-head">
            <h1 className="login-brand">TRENDS</h1>
          </header>
          <Login />
        </section>
      </main>
      <UpdateBar />
    </div>
  );
}
