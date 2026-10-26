import type { Action, ClockView, GameState } from "@trends/game-core";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api/client";
import { Account, Login } from "../auth/Login";
import { type DeckSel, deckFromRef } from "../game/decks";
import { type RemoteLink, type RemoteUpdate, useGame } from "../game/store";
import { formatClock, type RatingChange, useLive } from "../online/live";
import { api, useSession } from "../online/session";
import { Board, DeckGrid } from "./Play";

/**
 * 部屋に誘うリンク。公開前の招待リンクの守りが効いているときは、合言葉（?invite=）も付ける
 * （まだ招待されていない友だちでも、このリンク1つで入れるように）
 */
function useRoomLink() {
  const [link, setLink] = useState(() => window.location.href);
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/auth/invite`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { invite?: string | null } | null) => {
        if (!alive || !b?.invite) return;
        const url = new URL(window.location.href);
        url.searchParams.set("invite", b.invite);
        setLink(url.toString());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return link;
}

interface Seat {
  id: string;
  name: string;
  /** 構築済みデッキの ID か "custom:…"（自分で組んだデッキ） */
  deck: string;
}
interface MatchInfo {
  code: string;
  status: string;
  /** friend（合言葉の部屋）/ random（ランダムマッチ）/ cpu（ランダムマッチで待機している CPU と） */
  kind: string;
  players: { p1: Seat | null; p2: Seat | null };
}
interface MatchMsg {
  code: string;
  status: string;
  me: Seat | null;
  opponent: Seat | null;
  state: GameState | null;
  kind: string;
  clock: ClockView | null;
  /** ランダムマッチで決着していれば、レーティングの動き */
  rating: RatingChange | null;
}
/** 自分のレーティング */
export interface MyRating {
  rating: number;
  games: number;
  wins: number;
}

/** ソケットにつなぐ（API_URL が空なら、画面と同じサーバーにつなぐ） */
function connect(token: string): Socket {
  const opts = { auth: { token }, transports: ["websocket", "polling"] };
  return API_URL ? io(API_URL, opts) : io(opts);
}

/* ---------- ランダムマッチ ---------- */

/** 待ち始めてからの時間を 1 秒ごとに数える */
function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, now - since);
}

/** 自分のレーティング（レート・戦績） */
function MyRatingLine({ token }: { token: string | null }) {
  const [mine, setMine] = useState<MyRating | null>(null);
  useEffect(() => {
    api<MyRating>("/me/rating", {}, token)
      .then(setMine)
      .catch(() => {});
  }, [token]);
  return (
    <p className="my-rating">
      あなたのレート <b>{mine?.rating ?? "—"}</b>
      {mine && mine.games > 0 && (
        <small>
          {mine.games}戦 {mine.wins}勝
        </small>
      )}
      <Link to="/ranking" className="btn ghost small">
        ランキング
      </Link>
    </p>
  );
}

/** デッキを選ぶと待ち行列に入り、相手が見つかったらその部屋に入る */
function RandomMatch() {
  const { token, logout } = useSession();
  const navigate = useNavigate();
  /** 相手を探しているデッキ（null なら選ぶ前） */
  const [deck, setDeck] = useState<DeckSel | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waited = useElapsed(since);

  useEffect(() => {
    if (!deck || !token) return;
    const socket = connect(token);
    // つなぎ直したときも、もう一度並ぶ
    socket.on("connect", () => {
      socket.emit("queue", { deck: deck.ref }, (ack: { ok: boolean; error?: string }) => {
        if (ack.ok) return;
        setError(ack.error ?? "相手を探せませんでした");
        setDeck(null);
        setSince(null);
      });
    });
    socket.on("matched", ({ code }: { code: string }) => navigate(`/online/${code}`));
    socket.on("auth_error", () => logout());
    return () => {
      socket.emit("unqueue");
      socket.disconnect();
    };
  }, [deck, token, navigate, logout]);

  const cancel = () => {
    setDeck(null);
    setSince(null);
  };

  return (
    <div className="online-card">
      <h2>ランダムマッチ</h2>
      <MyRatingLine token={token} />
      {deck ? (
        <div className="searching" role="status">
          <span className="search-spin" aria-hidden="true" />
          <p>
            相手を探しています <b>{formatClock(waited)}</b>
          </p>
          <p className="muted">デッキ：{deck.name}</p>
          <p className="muted">15 秒たっても相手がいなければ、CPU と対戦します（レートは動きません）。</p>
          <button type="button" className="btn ghost" onClick={cancel}>
            やめる
          </button>
        </div>
      ) : (
        <>
          <p className="muted">
            レートの近い人と対戦します。勝つとレートが上がり、負けると下がります（はじめは 1500）。
          </p>
          {error && <p className="notice">{error}</p>}
          <DeckGrid
            onPick={(sel) => {
              setError(null);
              setDeck(sel);
              setSince(Date.now());
            }}
            confirmLabel="このデッキで相手を探す"
          />
        </>
      )}
    </div>
  );
}

/* ---------- ロビー（ランダムマッチ／友だちと：部屋を作る・合言葉で入る） ---------- */

export function OnlineLobby() {
  const { user, token } = useSession();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"random" | "friend">("random");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async (sel: DeckSel) => {
    setBusy(true);
    setError(null);
    try {
      const m = await api<MatchInfo>(
        "/matches",
        { method: "POST", body: JSON.stringify({ deck: sel.ref }) },
        token,
      );
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
          ランダムマッチ（レート戦）か、友だちと合言葉で対戦します。1 ターンは 60
          秒まで（過ぎたら自動でターン終了）。持ち時間は 1 試合で 10 分で、使い切ると負けです。
        </p>
        <Account />
      </header>
      {!user ? (
        <Login />
      ) : (
        <>
          <div className="online-tabs" role="tablist" aria-label="対戦のしかた">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "random"}
              className={tab === "random" ? "on" : ""}
              onClick={() => setTab("random")}
            >
              ランダムマッチ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "friend"}
              className={tab === "friend" ? "on" : ""}
              onClick={() => setTab("friend")}
            >
              友だちと対戦
            </button>
          </div>
          {tab === "random" ? (
            <RandomMatch />
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
                <p className="muted">
                  使うデッキを選ぶと部屋ができます。友だちとの対戦では、レートは動きません。
                </p>
                {error && <p className="notice">{error}</p>}
                <fieldset disabled={busy} className="plain">
                  <DeckGrid onPick={create} confirmLabel="このデッキで部屋を作る" />
                </fieldset>
              </div>
            </>
          )}
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
  const [deck, setDeck] = useState<DeckSel | null>(null);
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
    const socket = connect(token);
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
      socket.emit("join", { code, deck: deck?.ref }, (ack: { ok: boolean; error?: string }) => {
        if (!ack.ok) setError(ack.error ?? "部屋に入れませんでした");
      });
    });
    socket.on("auth_error", () => {
      logout();
    });
    socket.on("match", (m: MatchMsg) => {
      setMatch(m);
      setError(null);
      useLive.getState().setClock(m.clock);
      useLive.getState().setRating(m.rating);
      if (m.state && m.me && m.opponent) {
        const sel = deckFromRef(m.me.deck);
        if (sel)
          useGame.getState().startOnline({
            deck: sel,
            foeName: m.opponent.name,
            foeDeckRef: m.opponent.deck,
            state: m.state,
            link,
          });
      }
    });
    socket.on("update", (u: RemoteUpdate & { clock?: ClockView | null }) => {
      // 時計は届いたらすぐ（盤面は演出のあとで進む）
      if (u.clock !== undefined) useLive.getState().setClock(u.clock);
      useGame.getState().receive(u);
    });
    socket.on("rated", (r: RatingChange) => useLive.getState().setRating(r));
    return () => {
      socket.disconnect();
      useGame.getState().quit();
      useLive.getState().reset();
    };
  }, [ready, token, code, deck, logout]);

  const invite = useRoomLink();
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
          {match?.me && (
            <p className="muted">あなたのデッキ：{deckFromRef(match.me.deck)?.name ?? "自分のデッキ"}</p>
          )}
        </div>
      )}
    </section>
  );
}
