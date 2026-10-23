import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, useSession } from "../online/session";

interface RankRow {
  rank: number;
  name: string;
  rating: number;
  games: number;
  wins: number;
  me: boolean;
}
interface Board {
  /** 集計した時刻・次に集計する時刻（ISO） */
  updatedAt: string;
  nextAt: string;
  players: RankRow[];
  me: { rating: number; games: number; wins: number; rank: number | null; ranked: number };
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

/** ランキング（ランダムマッチのレート。10 分ごとに集計し直す） */
export function Ranking() {
  const { user, token } = useSession();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api<Board>("/rankings", {}, token)
      .then(setBoard)
      .catch((e: Error) => setError(e.message));
  }, [token]);

  return (
    <section className="page online ranking">
      <header className="page-head">
        <h1>ランキング</h1>
        <p className="muted">ランダムマッチのレートの順位です。10 分ごとに集計し直します。</p>
      </header>
      {!user ? (
        <div className="online-card">
          <p className="muted">ランキングは、ログインすると見られます。</p>
          <Link to="/online" className="btn">
            ログインする
          </Link>
        </div>
      ) : error ? (
        <div className="online-card">
          <p className="notice">{error}</p>
        </div>
      ) : !board ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <>
          <div className="online-card rank-me">
            <span>
              あなたの順位
              <b>{board.me.rank ? `${board.me.rank}位` : "—"}</b>
              {board.me.rank && <small>／{board.me.ranked}人</small>}
            </span>
            <span>
              レート <b>{board.me.rating}</b>
              <small>
                {board.me.games}戦 {board.me.wins}勝
              </small>
            </span>
          </div>
          {!board.me.rank && (
            <p className="muted">ランダムマッチで 1 戦すると、次の集計から順位に載ります。</p>
          )}
          <p className="rank-time muted">
            {hm(board.updatedAt)} の集計（次は {hm(board.nextAt)} ごろ）
          </p>
          {board.players.length === 0 ? (
            <p className="muted">まだ誰も載っていません。</p>
          ) : (
            <ol className="rank-list">
              {board.players.map((p) => (
                <li
                  key={`${p.rank}-${p.name}`}
                  className={`${p.me ? "me" : ""} ${p.rank <= 3 ? `top top${p.rank}` : ""}`}
                >
                  <span className="rank-no">{p.rank}</span>
                  <span className="rank-name">{p.name}</span>
                  <span className="rank-games">
                    {p.games}戦{p.wins}勝
                  </span>
                  <span className="rank-rate">{p.rating}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
