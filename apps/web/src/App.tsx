import { useEffect } from "react";
import { NavLink, Route, Routes } from "react-router";
import { RefreshButton, UpdateBar } from "./AppRefresh";
import { Login } from "./auth/Login";
import { useDeckSync } from "./game/deckSync";
import { HelpSheet } from "./help/HelpSheet";
import { InstallButton } from "./InstallButton";
import { useSession } from "./online/session";
import { Decks } from "./pages/Decks";
import { Gallery } from "./pages/Gallery";
import { OnlineLobby, OnlineRoom } from "./pages/Online";
import { Play } from "./pages/Play";
import { Ranking } from "./pages/Ranking";

export function App() {
  // ログインしているあいだは、自分で組んだデッキをアカウントとそろえる
  useDeckSync();
  const user = useSession((st) => st.user);
  const check = useSession((st) => st.check);
  // 開いたときに一度、保存してあるログインがまだ使えるか確かめる（期限は 30 日）
  useEffect(() => {
    void check();
  }, [check]);
  // サービス全体でログインが要る（10月26日）。ログインしていなければ、どのページを開いてもログインの画面だけ
  if (!user) return <LoginScreen />;
  return (
    <div className="shell">
      <nav className="nav">
        <span className="brand">TRENDS</span>
        <NavLink to="/" end>
          カード
        </NavLink>
        <NavLink to="/decks">デッキ構築</NavLink>
        <NavLink to="/play">CPU と対戦</NavLink>
        <NavLink to="/online">オンライン対戦</NavLink>
        <NavLink to="/ranking">ランキング</NavLink>
        <span className="spacer" />
        <RefreshButton />
        <InstallButton />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/decks" element={<Decks />} />
          <Route path="/play" element={<Play />} />
          <Route path="/online" element={<OnlineLobby />} />
          <Route path="/online/:code" element={<OnlineRoom />} />
          <Route path="/ranking" element={<Ranking />} />
        </Routes>
      </main>
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
