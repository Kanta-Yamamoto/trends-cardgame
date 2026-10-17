import { NavLink, Route, Routes } from "react-router";
import { Gallery } from "./pages/Gallery";
import { Play } from "./pages/Play";

const PROTOTYPES = [
  { href: "/prototypes/gacha/index.html", label: "ガチャ演出" },
  { href: "/prototypes/field/index.html", label: "対戦フィールド" },
];

export function App() {
  return (
    <div className="shell">
      <nav className="nav">
        <span className="brand">TRENDS</span>
        <NavLink to="/" end>
          カード
        </NavLink>
        <NavLink to="/play">CPU と対戦</NavLink>
        <span className="spacer" />
        {PROTOTYPES.map((p) => (
          <a key={p.href} href={p.href} className="proto">
            試作：{p.label}
          </a>
        ))}
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/play" element={<Play />} />
        </Routes>
      </main>
    </div>
  );
}
