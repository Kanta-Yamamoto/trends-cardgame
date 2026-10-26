import { useEffect, useState } from "react";
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
/** 丸の中に出す名前の 1 文字目 */
const initial = (name: string) => Array.from(name.trim())[0] ?? "？";

/** ランキング（ランダムマッチのレート。10 分ごとに集計し直す）。上位 3 人を特別扱いせず、順に並べて 1〜3 の数字だけ金・銀・銅にする */
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

  if (error)
    return (
      <section className="page ranking">
        <p className="notice">{error}</p>
      </section>
    );
  if (!board)
    return (
      <section className="page ranking">
        <p className="muted">読み込み中…</p>
      </section>
    );
  return (
    <section className="page ranking">
      <p className="rank-when">
        <b>
          <i />
          {hm(board.updatedAt)} の集計
        </b>
        <span>次は {hm(board.nextAt)} ごろ</span>
      </p>
      {board.players.length === 0 ? (
        <p className="muted rank-empty">まだ誰も載っていません。</p>
      ) : (
        <ol className="rank-list">
          {board.players.map((p, i) => (
            <li
              key={`${p.rank}-${p.name}`}
              className={`rank-row ${p.rank <= 3 ? `top m${p.rank} g3` : "g2"} ${p.me ? "is-me" : ""}`}
              style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}
            >
              {p.rank <= 3 ? (
                <span className="rank-medal">{p.rank}</span>
              ) : (
                <span className="rank-no">{p.rank}</span>
              )}
              <span className="rank-av" aria-hidden="true">
                {initial(p.name)}
              </span>
              <span className="rank-who">
                <b>{p.name}</b>
                <small>
                  {p.games}戦{p.wins}勝
                </small>
              </span>
              <span className="rank-rate">{p.rating}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="muted rank-note">
        ランダムマッチで 1 戦すると、次の集計から順位に載ります。友だちとの対戦・CPU
        との対戦では、レートは動きません。
      </p>
      {/* 自分の行は、下に貼りつけて常に見せる */}
      <div className="rank-mine g3">
        <span className="rank-no">
          {board.me.rank ?? "—"}
          <small>{board.me.rank ? `/ ${board.me.ranked}人` : "未集計"}</small>
        </span>
        <span className="rank-av" aria-hidden="true">
          {initial(user?.name ?? "あ")}
        </span>
        <span className="rank-who">
          <b>あなた</b>
          <small>
            {board.me.games}戦{board.me.wins}勝
          </small>
        </span>
        <span className="rank-rate">{board.me.rating}</span>
      </div>
    </section>
  );
}
