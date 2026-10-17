import type { DeckId } from "@trends/cards";
import type { Action, GameState } from "@trends/game-core";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api/client";
import { DECK_INFO, type RemoteLink, type RemoteUpdate, useGame } from "../game/store";
import { type AuthConfig, api, loadGoogle, useSession } from "../online/session";
import { Board, DeckGrid } from "./Play";

interface Seat {
  id: string;
  name: string;
  deck: DeckId;
}
interface MatchInfo {
  code: string;
  status: string;
  players: { p1: Seat | null; p2: Seat | null };
}
interface MatchMsg {
  code: string;
  status: string;
  me: Seat | null;
  opponent: Seat | null;
  state: GameState | null;
}

/* ---------- ログイン ---------- */

function GoogleButton({ clientId }: { clientId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const loginWithGoogle = useSession((s) => s.loginWithGoogle);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadGoogle()
      .then((g) => {
        if (!alive || !ref.current) return;
        g.initialize({
          client_id: clientId,
          callback: (r) => loginWithGoogle(r.credential).catch((e: Error) => setError(e.message)),
        });
        g.renderButton(ref.current, { theme: "filled_black", size: "large", shape: "pill", locale: "ja" });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      alive = false;
    };
  }, [clientId, loginWithGoogle]);
  return (
    <>
      <div ref={ref} className="google-btn" />
      {error && <p className="notice">{error}</p>}
    </>
  );
}

function DevLogin() {
  const loginForDev = useSession((s) => s.loginForDev);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    loginForDev(name).catch((err: Error) => setError(err.message));
  };
  return (
    <form className="online-form" onSubmit={submit}>
      <label>
        開発用ログイン（名前だけ）
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="名前" />
      </label>
      <button type="submit" className="btn" disabled={!name.trim()}>
        この名前で入る
      </button>
      {error && <p className="notice">{error}</p>}
    </form>
  );
}

function Login() {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [down, setDown] = useState(false);
  useEffect(() => {
    api<AuthConfig>("/auth/config")
      .then(setCfg)
      .catch(() => setDown(true));
  }, []);
  return (
    <div className="online-card">
      <h2>ログイン</h2>
      <p className="muted">オンライン対戦は、Google アカウントでログインして遊びます。</p>
      {down && <p className="notice">サーバーに繋がりません。時間をおいて開き直してください。</p>}
      {cfg?.googleClientId && <GoogleButton clientId={cfg.googleClientId} />}
      {cfg?.devLogin && <DevLogin />}
      {cfg && !cfg.googleClientId && !cfg.devLogin && (
        <p className="notice">ログインの設定がまだです（GOOGLE_CLIENT_ID）。</p>
      )}
    </div>
  );
}

function Account() {
  const { user, logout } = useSession();
  if (!user) return null;
  return (
    <p className="online-account">
      {user.name} でログイン中
      <button type="button" className="btn ghost small" onClick={logout}>
        ログアウト
      </button>
    </p>
  );
}

/* ---------- ロビー（部屋を作る・合言葉で入る） ---------- */

export function OnlineLobby() {
  const { user, token } = useSession();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (deck: DeckId) => {
    setBusy(true);
    setError(null);
    try {
      const m = await api<MatchInfo>("/matches", { method: "POST", body: JSON.stringify({ deck }) }, token);
      navigate(`/online/${m.code}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) navigate(`/online/${c}`);
  };

  return (
    <section className="page online">
      <header className="page-head">
        <h1>オンライン対戦</h1>
        <p className="muted">
          友だちと対戦します。部屋を作って合言葉（招待リンク）を送るか、もらった合言葉で入ります。
        </p>
        <Account />
      </header>
      {!user ? (
        <Login />
      ) : (
        <>
          <form className="online-card online-form" onSubmit={join}>
            <h2>合言葉で入る</h2>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="例：K7QX2M"
              maxLength={6}
              aria-label="合言葉"
            />
            <button type="submit" className="btn" disabled={code.trim().length < 6}>
              入る
            </button>
          </form>
          <div className="online-card">
            <h2>部屋を作る</h2>
            <p className="muted">使うデッキを選ぶと部屋ができます。</p>
            {error && <p className="notice">{error}</p>}
            <fieldset disabled={busy} className="plain">
              <DeckGrid onPick={create} confirmLabel="このデッキで部屋を作る" />
            </fieldset>
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- 部屋（相手待ち → 対戦） ---------- */

export function OnlineRoom() {
  const { code = "" } = useParams();
  const { user, token, logout } = useSession();
  const navigate = useNavigate();
  const mode = useGame((s) => s.mode);
  const hasGame = useGame((s) => !!s.game);
  const [info, setInfo] = useState<MatchInfo | null>(null);
  const [match, setMatch] = useState<MatchMsg | null>(null);
  /** 参加するときに使うデッキ（すでに参加している人は null のまま入れる） */
  const [deck, setDeck] = useState<DeckId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const member = !!user && !!info && (info.players.p1?.id === user.id || info.players.p2?.id === user.id);
  const ready = member || !!deck;

  // 部屋の様子を取る（参加者か、空きがあるか）
  useEffect(() => {
    if (!token) return;
    api<MatchInfo>(`/matches/${code}`, {}, token)
      .then(setInfo)
      .catch((e: Error) => setError(e.message));
  }, [code, token]);

  // 接続して部屋に入る。切れても自動でつなぎ直し、入り直す
  useEffect(() => {
    if (!ready || !token) return;
    const opts = { auth: { token }, transports: ["websocket", "polling"] };
    // API_URL が空なら、画面と同じサーバーにつなぐ
    const socket: Socket = API_URL ? io(API_URL, opts) : io(opts);
    const link: RemoteLink = {
      send: (action: Action) =>
        new Promise((resolve) => {
          socket
            .timeout(10000)
            .emit("action", { code, action }, (err: Error | null, ack: { ok: boolean; error?: string }) =>
              resolve(
                err
                  ? "通信が切れています。少し待ってからもう一度"
                  : ack.ok
                    ? null
                    : (ack.error ?? "反則です"),
              ),
            );
        }),
      resign: () => socket.emit("resign", { code }, () => {}),
    };
    socket.on("connect", () => {
      socket.emit("join", { code, deck }, (ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) setError(ack.error ?? "部屋に入れませんでした");
      });
    });
    socket.on("auth_error", () => {
      logout();
    });
    socket.on("match", (m: MatchMsg) => {
      setMatch(m);
      setError(null);
      if (m.state && m.me && m.opponent) {
        useGame.getState().startOnline({ deck: m.me.deck, foeName: m.opponent.name, state: m.state, link });
      }
    });
    socket.on("update", (u: RemoteUpdate) => useGame.getState().receive(u));
    return () => {
      socket.disconnect();
      useGame.getState().quit();
    };
  }, [ready, token, code, deck, logout]);

  const invite = useMemo(() => window.location.href, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (mode === "online" && hasGame) {
    return (
      <section className="page play">
        <Board onQuit={() => navigate("/online")} />
      </section>
    );
  }

  const full = !!info && !member && !!info.players.p2;
  return (
    <section className="page online">
      <header className="page-head">
        <h1>オンライン対戦</h1>
        <Account />
      </header>
      {!user ? (
        <Login />
      ) : error ? (
        <div className="online-card">
          <p className="notice">{error}</p>
          <button type="button" className="btn ghost" onClick={() => navigate("/online")}>
            ロビーに戻る
          </button>
        </div>
      ) : full ? (
        <div className="online-card">
          <p className="notice">この部屋はもう2人そろっています。</p>
        </div>
      ) : info && !ready ? (
        <div className="online-card">
          <h2>{info.players.p1?.name} さんの部屋に入る</h2>
          <p className="muted">使うデッキを選ぶと対戦が始まります。</p>
          <DeckGrid onPick={setDeck} confirmLabel="このデッキで対戦する" />
        </div>
      ) : (
        <div className="online-card waiting">
          <h2>相手を待っています</h2>
          <p className="muted">この合言葉か招待リンクを、対戦したい友だちに送ってください。</p>
          <p className="room-code">{match?.code ?? code.toUpperCase()}</p>
          <div className="invite">
            <input readOnly value={invite} aria-label="招待リンク" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={copy}>
              {copied ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
          {match?.me && <p className="muted">あなたのデッキ：{DECK_INFO[match.me.deck].name}</p>}
        </div>
      )}
    </section>
  );
}
