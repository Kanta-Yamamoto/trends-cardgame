import { NavLink, Route, Routes } from "react-router";
import { InstallButton } from "./InstallButton";
import { Gallery } from "./pages/Gallery";
import { OnlineLobby, OnlineRoom } from "./pages/Online";
import { Play } from "./pages/Play";

export function App() {
  return (
    <div className="shell">
      <nav className="nav">
        <span className="brand">TRENDS</span>
        <NavLink to="/" end>
          カード
        </NavLink>
        <NavLink to="/play">CPU と対戦</NavLink>
        <NavLink to="/online">オンライン対戦</NavLink>
        <span className="spacer" />
        <InstallButton />
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/play" element={<Play />} />
          <Route path="/online" element={<OnlineLobby />} />
          <Route path="/online/:code" element={<OnlineRoom />} />
        </Routes>
      </main>
    </div>
  );
}
