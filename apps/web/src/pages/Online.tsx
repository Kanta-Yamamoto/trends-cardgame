import type { Action, ClockView, GameState } from "@trends/game-core";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "../api/client";
import { Login } from "../auth/Login";
import { type DeckSel, deckFromRef } from "../game/decks";
import { type RemoteLink, type RemoteUpdate, useGame } from "../game/store";
import { useInviteLink } from "../invite";
import { isApp } from "../native";
import { formatClock, type RatingChange, useLive } from "../online/live";
import { api, useSession } from "../online/session";
import { Board, DeckGrid } from "./Play";

/**
 * 部屋に誘うリンク。公開前の招待リンクの守りが効いているときは、合言葉（?invite=）も付ける
 * （まだ招待されていない友だちでも、このリンク1つで入れるように。invite.ts）
 */
function useRoomLink() {
  const { link } = useInviteLink(window.location.pathname);
  return link ?? window.location.href;
}

/** 部屋に誘う（合言葉と招待リンク）。アプリは Web のリンクを使わないので、合言葉をコピーする */
function RoomInvite({ code }: { code: string }) {
  const link = useRoomLink();
  const invite = isApp ? code : link;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <button type="button" className="btn lg" onClick={copy}>
        {copied ? "コピーしました" : isApp ? "合言葉をコピー" : "招待リンクをコピー"}
      </button>
      {!isApp && <p className="room-link">{invite}</p>}
    </>
  );
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
  /** 集計の中の順位と、載っている人数（まだ載っていなければ順位は null） */
  rank?: number | null;
  ranked?: number;
}

/** ソケットにつなぐ（API_URL が空なら、画面と同じサーバーにつなぐ） */
function connect(token: string): Socket {
  const opts = { auth: { token }, transports: ["websocket", "polling"] };
  return API_URL ? io(API_URL, opts) : io(opts);
}

/* ---------- 通信が切れた対戦に戻る ---------- */

/** 戻る対戦と、2 人とも抜けているときに閉じる時刻（だれかつないでいれば null） */
interface Resume {
  match: MatchInfo;
  closesAt: number | null;
}

/**
 * 自分の決着していない対戦（無ければ null、確かめている途中は undefined）。
 * 確かめられなかったときは null（ふつうのロビーを出す。ほかの部屋に入ろうとしても、サーバーが断る）。
 * あるあいだは確かめ直す（相手が抜けた・戻った・決着した・閉じた）。閉じる時刻が来たら、すぐ確かめ直す
 */
function useCurrentMatch(token: string | null) {
  const [current, setCurrent] = useState<Resume | null | undefined>(undefined);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** 前に確かめた結果（確かめ直しに失敗したときは、これを出したままにする） */
    let last: Resume | null = null;
    const again = (ms: number) => {
      timer = setTimeout(check, Math.max(300, Math.min(RECHECK_MS, ms)));
    };
    const check = () =>
      api<{ match: MatchInfo | null; closesIn: number | null }>("/me/match", { cache: "no-store" }, token)
        .then((r) => {
          if (!alive) return;
          last = r.match
            ? { match: r.match, closesAt: r.closesIn === null ? null : Date.now() + r.closesIn }
            : null;
          setCurrent(last);
          if (last) again(last.closesAt === null ? RECHECK_MS : last.closesAt - Date.now() + 300);
        })
        .catch(() => {
          if (!alive) return;
          setCurrent(last);
          if (last) again(RECHECK_MS);
        });
    void check();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token]);
  return current;
}
/** 戻る対戦があるあいだ、確かめ直す間隔 */
const RECHECK_MS = 15_000;

/** 1 秒ごとに今の時刻を返す（on のあいだだけ） */
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/** 決着していない対戦があるあいだは、ロビーにこれだけを出す（ほかの対戦は始めず、その部屋に戻ってもらう） */
function ResumeMatch({ resume: { match, closesAt } }: { resume: Resume }) {
  const { user } = useSession();
  const navigate = useNavigate();
  const now = useNow(closesAt !== null);
  const foe = match.players.p1?.id === user?.id ? match.players.p2 : match.players.p1;
  const cpu = match.kind === "cpu";
  return (
    <div className="online-card resume">
      <h2>対戦が続いています</h2>
      <p>{cpu ? "CPU" : `${foe?.name ?? "相手"} さん`}との対戦の途中です。</p>
      {closesAt === null ? (
        <p className="muted">
          戻るまでのあいだも、あなたのターンは 60
          秒で終わり、持ち時間が減っていきます（使い切ると負け）。決着するまで、ほかの対戦はできません。
        </p>
      ) : (
        <p className="muted">
          {cpu ? "" : "相手も抜けているので、"}あと <b>{formatClock(Math.max(0, closesAt - now))}</b>{" "}
          でこの対戦を閉じます（勝ち負けなし）。閉じるまでに戻れば、続きから遊べます。
        </p>
      )}
      <button type="button" className="btn" onClick={() => navigate(`/online/${match.code}`)}>
        対戦に戻る
      </button>
    </div>
  );
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

/** 自分のレーティング（レート・戦績）とランダムマッチの決まり */
/** レートが何を意味するか分かるように、順位と上位の割合を添える（順位は 10 分ごとの集計） */
function rankText(m: MyRating | null) {
  if (!m?.rank || !m.ranked) return "";
  return `${m.rank}位・上位${Math.max(1, Math.round((m.rank / m.ranked) * 100))}%　`;
}

function RateCard({ token }: { token: string | null }) {
  const [mine, setMine] = useState<MyRating | null>(null);
  useEffect(() => {
    api<{ me: MyRating }>("/rankings", {}, token)
      .then((b) => setMine(b.me))
      .catch(() => {});
  }, [token]);
  return (
    <section className="rate-card g3">
      <div className="rate-top">
        <div>
          <span className="rate-label">あなたのレート</span>
          <span className="rate-num">{mine?.rating ?? "—"}</span>
          <span className="rate-rec">
            {rankText(mine)}
            {mine?.games ?? 0}戦 {mine?.wins ?? 0}勝
          </span>
        </div>
        <Link to="/ranking" className="rank-link">
          ランキング
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
      <p className="rate-facts">
        <span className="tag">1ターン 60秒</span>
        <span className="tag">持ち時間 10分</span>
        <span className="tag">勝つとレートが上がる</span>
      </p>
    </section>
  );
}

/** デッキを選ぶと待ち行列に入り、相手が見つかったらその部屋に入る */
function RandomMatch() {
  const { user, token, logout } = useSession();
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
    <>
      <RateCard token={token} />
      {error && <p className="notice">{error}</p>}
      <DeckGrid
        onPick={(sel) => {
          setError(null);
          setDeck(sel);
          setSince(Date.now());
        }}
        confirmLabel="このデッキで相手を探す"
      />
      {deck && (
        <div className="searching" role="status">
          <div className="radar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="radar-sweep" />
            <span className="radar-me">{Array.from(user?.name ?? "")[0] ?? "？"}</span>
          </div>
          <h2>相手を探しています</h2>
          <b className="searching-clock">{formatClock(waited)}</b>
          <p className="muted">デッキ：{deck.name}</p>
          <p className="muted">15 秒たっても相手がいなければ、CPU と対戦します（レートは動きません）。</p>
          <button type="button" className="btn ghost" onClick={cancel}>
            やめる
          </button>
        </div>
      )}
    </>
  );
}

/* ---------- ロビー（ランダムマッチ／友だちと：部屋を作る・合言葉で入る） ---------- */

export function OnlineLobby() {
  const { user, token } = useSession();
  const navigate = useNavigate();
  const current = useCurrentMatch(user ? token : null);
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
      {!user ? (
        <Login />
      ) : current === undefined ? null : current ? (
        <ResumeMatch resume={current} />
      ) : (
        <>
          <div className="seg g2" role="tablist" aria-label="対戦のしかた">
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
              <form className="online-card join-card" onSubmit={join}>
                <h2>合言葉で入る</h2>
                <p className="muted">友だちから届いた 6 文字の合言葉を入れます。</p>
                <div className="join-row">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="K7QX2M"
                    maxLength={6}
                    aria-label="合言葉"
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn" disabled={code.trim().length < 6}>
                    入る
                  </button>
                </div>
              </form>
              {error && <p className="notice">{error}</p>}
              <fieldset disabled={busy} className="plain">
                <DeckGrid onPick={create} confirmLabel="このデッキで部屋を作る" />
              </fieldset>
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

  const member = !!user && !!info && (info.players.p1?.id === user.id || info.players.p2?.id === user.id);
  const ready = member || !!deck;
  const current = useCurrentMatch(token);
  /** ほかの部屋で続いている対戦（あれば、この部屋には入らずそちらに戻ってもらう） */
  const elsewhere = info && !member && current && current.match.code !== info.code ? current : null;

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
      ready: (turn: number) => socket.emit("ready", { code, turn }),
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
      if (m.state && m.me && m.opponent && m.status !== "closed") {
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
    // 相手が自分のターンの始めを見せ終えて、時計が動き出した
    socket.on("clock", (c: ClockView | null) => useLive.getState().setClock(c));
    socket.on("rated", (r: RatingChange) => useLive.getState().setRating(r));
    return () => {
      socket.disconnect();
      useGame.getState().quit();
      useLive.getState().reset();
    };
  }, [ready, token, code, deck, logout]);

  /** 2 人とも抜けたので、決着なしで閉じた対戦 */
  const closed = match?.status === "closed";
  if (mode === "online" && hasGame && !closed) {
    return (
      <section className="page play">
        <Board
          onQuit={() => navigate("/online")}
          quitNotes={
            match?.kind === "cpu"
              ? [
                  "1 分以内にロビーの「対戦に戻る」から戻れば、続きを遊べます",
                  "1 分たつと、勝ち負けなしで対戦を閉じます",
                ]
              : [
                  "対戦は続きます。ロビーの「対戦に戻る」から続きを遊べます",
                  "戻るまでのあいだも、あなたのターンは 60 秒で終わり、持ち時間が減っていきます（使い切ると負け）",
                ]
          }
        />
      </section>
    );
  }

  const full = !!info && !member && !!info.players.p2;
  return (
    <section className="page online">
      {!user ? (
        <Login />
      ) : error ? (
        <div className="online-card">
          <p className="notice">{error}</p>
          <button type="button" className="btn ghost" onClick={() => navigate("/online")}>
            ロビーに戻る
          </button>
        </div>
      ) : closed ? (
        <div className="online-card">
          <p className="notice">この対戦は、2人とも抜けたので閉じました（勝ち負けなし）。</p>
          <button type="button" className="btn ghost" onClick={() => navigate("/online")}>
            ロビーに戻る
          </button>
        </div>
      ) : elsewhere ? (
        <ResumeMatch resume={elsewhere} />
      ) : full ? (
        <div className="online-card">
          <p className="notice">この部屋はもう2人そろっています。</p>
        </div>
      ) : info && !ready ? (
        <>
          <p className="muted online-note">
            {info.players.p1?.name} さんの部屋に入ります。使うデッキを選ぶと対戦が始まります。
          </p>
          <DeckGrid onPick={setDeck} confirmLabel="このデッキで対戦する" />
        </>
      ) : (
        <>
          <section className="room-seats online-card">
            <div className="room-seat">
              <span className="room-av">{Array.from(user.name)[0] ?? "？"}</span>
              <b>{user.name}</b>
              {match?.me && (
                <span className="room-deck">{deckFromRef(match.me.deck)?.name ?? "自分のデッキ"}</span>
              )}
            </div>
            <span className="room-vs">VS</span>
            <div className="room-seat">
              <span className="room-av wait">?</span>
              <b>友だち</b>
              <span className="room-wait">
                待っています
                <i />
                <i />
                <i />
              </span>
            </div>
          </section>
          <section className="online-card code-card">
            <h2>合言葉</h2>
            <p className="room-code">
              {Array.from(match?.code ?? code.toUpperCase()).map((ch, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 合言葉の文字は同じ字が並ぶことがあるので、場所で見分ける
                <span key={i} style={{ animationDelay: `${i * 0.05}s` }}>
                  {ch}
                </span>
              ))}
            </p>
            <RoomInvite code={match?.code ?? code.toUpperCase()} />
          </section>
          <p className="room-hint g2">
            {isApp ? "この合言葉" : "この合言葉か招待リンク"}
            を、対戦したい友だちに送ってください。友だちが入ると、すぐに対戦が始まります。友だちとの対戦では、レートは動きません。
          </p>
        </>
      )}
    </section>
  );
}
