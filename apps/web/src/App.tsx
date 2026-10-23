import { NavLink, Route, Routes } from "react-router";
import { RefreshButton, UpdateBar } from "./AppRefresh";
import { useDeckSync } from "./game/deckSync";
import { HelpSheet } from "./help/HelpSheet";
import { InstallButton } from "./InstallButton";
import { Decks } from "./pages/Decks";
import { Gallery } from "./pages/Gallery";
import { OnlineLobby, OnlineRoom } from "./pages/Online";
import { Play } from "./pages/Play";

export function App() {
  // ログインしているあいだは、自分で組んだデッキをアカウントとそろえる
  useDeckSync();
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
        </Routes>
      </main>
      <HelpSheet />
      <UpdateBar />
    </div>
  );
}
