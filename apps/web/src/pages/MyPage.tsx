import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router";
import { NameField, nameStatus } from "../auth/NameField";
import { fmt, totalGems, useWallet } from "../gacha/wallet";
import { api, type User, useSession } from "../online/session";
import "../styles/account.css";

/** ランキングの自分の分（/rankings の me） */
interface MyRank {
  rating: number;
  games: number;
  wins: number;
  rank: number | null;
}

function Icon({ d, className }: { d: string[]; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}
const I = {
  pen: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  friends: [
    "M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z",
    "M2.5 20a6.5 6.5 0 0 1 13 0",
    "M17 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
    "M16 14.2A5 5 0 0 1 21.5 19",
  ],
  card: [
    "M7.5 2.5h9A2.5 2.5 0 0 1 19 5v14a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 19V5a2.5 2.5 0 0 1 2.5-2.5z",
    "M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z",
    "M8 17a4 4 0 0 1 8 0",
  ],
  gem: ["M7 4h10l4 5-9 11L3 9z", "M3 9h18M12 20L8.5 9 12 4l3.5 5z"],
  logout: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 8l-4 4 4 4M6 12h10"],
  chevron: ["M9 6l6 6-6 6"],
};

/**
 * マイページ（10月27日。モックの A 案）：ホームの左上の札から開く。
 * 今は名前を変えるだけ。フレンド・プロフカードはこれから足す場所として「準備中」の行を置く
 */
export function MyPage() {
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const setSession = useSession((s) => s.setSession);
  const logout = useSession((s) => s.logout);
  const wallet = useWallet((s) => s.wallet);
  const loadWallet = useWallet((s) => s.load);
  const [mine, setMine] = useState<MyRank | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(0);

  useEffect(() => {
    if (!token) return;
    void loadWallet(token);
    api<{ me: MyRank }>("/rankings", {}, token)
      .then((b) => setMine(b.me))
      .catch(() => {});
  }, [token, loadWallet]);

  if (!user) return null;
  const open = () => {
    setDraft(user.name);
    setError(null);
    setEditing(true);
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!nameStatus(draft, user.name).ok || busy) return;
    setBusy(true);
    setError(null);
    api<{ token: string; user: User }>(
      "/me/name",
      { method: "PUT", body: JSON.stringify({ name: draft }) },
      token,
    )
      .then((r) => {
        setSession(r);
        setEditing(false);
        setToast((n) => n + 1);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  const gems = totalGems(wallet);

  return (
    <section className="page ac-me">
      <section className="ac-prof g2">
        <div className="ac-prof-top">
          <span className="ac-big-av" aria-hidden="true">
            {Array.from(user.name)[0]}
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="ac-name-row">
              <h2 className="ac-name">{user.name}</h2>
              <button type="button" className="ac-edit" aria-label="名前を変える" onClick={open}>
                <Icon d={I.pen} />
              </button>
            </div>
            <p className="ac-login">Google でログイン中</p>
          </div>
        </div>
        <div className="ac-stats">
          <div className="ac-stat">
            <small>レート</small>
            <b className="pri">{mine?.rating ?? "—"}</b>
          </div>
          <div className="ac-stat">
            <small>ランキング</small>
            <b>
              {mine?.rank ?? "—"}
              {mine?.rank != null && <span>位</span>}
            </b>
          </div>
          <div className="ac-stat">
            <small>戦績</small>
            <b>
              {mine?.games ?? 0}
              <span>戦</span>
              {mine?.wins ?? 0}
              <span>勝</span>
            </b>
          </div>
        </div>
      </section>

      <div className="sec">
        <h2>これから増えるもの</h2>
      </div>
      <div className="ac-rows">
        <div className="ac-row soon g2">
          <Icon d={I.friends} />
          <span className="grow">フレンド</span>
          <span className="tag">準備中</span>
        </div>
        <div className="ac-row soon g2">
          <Icon d={I.card} />
          <span className="grow">プロフカード</span>
          <span className="tag">準備中</span>
        </div>
      </div>

      <div className="sec">
        <h2>アカウント</h2>
      </div>
      <div className="ac-rows">
        <button type="button" className="ac-row g2" onClick={open}>
          <Icon d={I.pen} />
          <span className="grow">名前を変える</span>
          <Icon d={I.chevron} className="ac-chev" />
        </button>
        <Link to="/shop" className="ac-row g2">
          <Icon d={I.gem} />
          <span className="grow">ジェム</span>
          <span className="note">
            持っている<b>{gems === null ? "—" : fmt(gems)}</b>
          </span>
          <Icon d={I.chevron} className="ac-chev" />
        </Link>
        <button type="button" className="ac-row dim g2" onClick={logout}>
          <Icon d={I.logout} />
          <span className="grow">ログアウト</span>
        </button>
      </div>

      {toast > 0 && (
        <div key={toast} className="ac-toast g3" role="status">
          名前を「{user.name}」に変えました
        </div>
      )}
      {editing && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="名前を変える">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setEditing(false)} />
          <form className="ac-sheet" onSubmit={save}>
            <div className="ac-grip" aria-hidden="true" />
            <h2>名前を変える</h2>
            <NameField
              id="me-name"
              value={draft}
              onChange={setDraft}
              current={user.name}
              error={error}
              autoFocus
            />
            <div className="ac-sheet-btns">
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                やめる
              </button>
              <button type="submit" className="btn" disabled={!nameStatus(draft, user.name).ok || busy}>
                {busy ? "変えています…" : "変える"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
