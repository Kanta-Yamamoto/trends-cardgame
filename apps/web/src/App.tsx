import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { API_URL } from "./api/client";
import { Login } from "./auth/Login";
import { RegisterScreen } from "./auth/Register";
import { useAccess } from "./gacha/access";
import { useDeckSync } from "./game/deckSync";
import { HelpSheet } from "./help/HelpSheet";
import { InstallAutoGuide } from "./InstallButton";
import { APP_VERSION, isApp } from "./native";
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
import { UnlockSheet } from "./purchase/Unlock";
import { TopBar } from "./TopBar";
import { Tutorial } from "./tutorial/Tutorial";

export function App() {
  // ログインしているあいだは、自分で組んだデッキをアカウントとそろえる
  useDeckSync();
  const user = useSession((st) => st.user);
  const check = useSession((st) => st.check);
  const token = useSession((st) => st.token);
  const loadAccess = useAccess((st) => st.load);
  const { pathname } = useLocation();
  const update = useUpdateRequired();
  // 開いたときに一度、保存してあるログインがまだ使えるか確かめる（期限は 30 日）
  useEffect(() => {
    void check();
  }, [check]);
  // 買い切りを買ったか・パックの残りは、ホームのメニューやデッキの画面でも見る
  useEffect(() => {
    void loadAccess(token);
  }, [token, loadAccess]);
  if (update) return <UpdateRequired url={update.url} />;
  // Web はサービス全体でログインが要る（10月26日）。ログインしていなければ、どのページを開いてもログインの画面だけ。
  // アプリにログインは無く、端末で自動で入る（11月1日）
  if (!user) return isApp ? <AppStart /> : <LoginScreen />;
  // プレイヤー名を決めるまでは、初期登録の画面だけ（10月27日。前の版で保存したログインは、確かめ終わるまでそのまま使う）
  if (user.nameSet === false) return <RegisterScreen />;
  // 最初に開く場所はホーム画面（10月26日）。ほかの画面は上の帯の「ホーム」で戻る
  const home = pathname === "/";
  // チュートリアルは画面いっぱいに出すので、上の帯を出さない
  const bare = pathname === "/tutorial";
  return (
    <div className={home ? "home-shell" : "shell"}>
      {!home && !bare && <TopBar />}
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
          <Route path="/me" element={<MyPage />} />
          <Route path="/tutorial" element={<Tutorial />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <InstallAutoGuide />
      <HelpSheet />
      <UnlockSheet />
    </div>
  );
}

/** アプリが古くて更新が要るか（サーバーの minAppVersion と比べる。確かめられなければ、そのまま使う） */
function useUpdateRequired() {
  const [update, setUpdate] = useState<{ url: string | null } | null>(null);
  useEffect(() => {
    if (!isApp) return;
    fetch(`${API_URL}/health`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ minAppVersion?: number; appStoreId?: string | null }>)
      .then((b) => {
        if ((b.minAppVersion ?? 0) > APP_VERSION)
          setUpdate({ url: b.appStoreId ? `https://apps.apple.com/jp/app/id${b.appStoreId}` : null });
      })
      .catch(() => {});
  }, []);
  return update;
}

/** 更新のお願い：古いアプリのまま遊ぶと、オンライン対戦などが動かないときだけ出す */
function UpdateRequired({ url }: { url: string | null }) {
  return (
    <div className="login-screen">
      <h1 className="login-brand">TRENDS</h1>
      <main className="login-box g3">
        <div className="online-card">
          <h2>新しい版があります</h2>
          <p className="muted">App Store でアプリを更新してください。</p>
          {url && (
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              App Store を開く
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

/** アプリを開いたとき：端末で入るまでの画面。サーバーに繋がらなければ、やり直せる */
function AppStart() {
  const login = useSession((st) => st.loginWithDevice);
  const [failed, setFailed] = useState(false);
  const start = useCallback(() => {
    setFailed(false);
    login().catch(() => setFailed(true));
  }, [login]);
  useEffect(start, [start]);
  return (
    <div className="login-screen">
      <div className="login-bg" aria-hidden="true">
        <span style={{ backgroundImage: "url(/assets/cards/c13-art.jpg)" }} />
      </div>
      <span className="login-rays" aria-hidden="true" />
      <img className="login-chara" src="/assets/cards/c13-subject.webp" alt="" draggable={false} />
      <h1 className="login-brand">TRENDS</h1>
      {failed && (
        <main className="login-box g3">
          <div className="online-card">
            <p className="notice">サーバーに繋がりません。電波のよいところで、もう一度試してください。</p>
            <button type="button" className="btn" onClick={start}>
              もう一度
            </button>
          </div>
        </main>
      )}
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
