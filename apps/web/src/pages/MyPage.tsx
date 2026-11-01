import { type FormEvent, useEffect, useState } from "react";
import { API_URL } from "../api/client";
import { NameField, nameStatus } from "../auth/NameField";
import { useAccess } from "../gacha/access";
import { InviteFriends } from "../InviteFriends";
import { forgetDevice, isApp } from "../native";
import { api, type User, useSession } from "../online/session";
import { Store } from "../purchase/store";
import { applyPurchase, useUnlock } from "../purchase/Unlock";
import "../styles/account.css";

/** プライバシーポリシーのページのある場所（アプリの中の画面にはサーバーの道が無いので、サーバーの URL で開く） */
const POLICY_ORIGIN = API_URL || window.location.origin;

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
  key: ["M14.5 3.5a6 6 0 1 1-5.2 9L3 18.8V21h2.2v-2h2v-2h2l1.3-1.3a6 6 0 1 0 4-12.2z", "M16 7.5h.01"],
  restore: ["M4 12a8 8 0 1 0 2.6-5.9", "M4 4v4.5h4.5"],
  trash: ["M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"],
  doc: ["M7 3h7l5 5v13H7z", "M14 3v5h5M10 13h6M10 17h6"],
  logout: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 8l-4 4 4 4M6 12h10"],
  chevron: ["M9 6l6 6-6 6"],
  invite: ["M9 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M19 8v6M16 11h6"],
};

/**
 * マイページ（10月27日。モックの A 案）：ホームの左上の札から開く。
 * 名前を変える・友だちを招待する。フレンド・プロフカードはこれから足す場所として「準備中」の行を置く
 */
export function MyPage() {
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const setSession = useSession((s) => s.setSession);
  const logout = useSession((s) => s.logout);
  const access = useAccess((s) => s.access);
  const loadAccess = useAccess((s) => s.load);
  const showUnlock = useUnlock((s) => s.show);
  const [mine, setMine] = useState<MyRank | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(0);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void loadAccess(token);
    api<{ me: MyRank }>("/rankings", {}, token)
      .then((b) => setMine(b.me))
      .catch(() => {});
  }, [token, loadAccess]);

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
  const restore = () => {
    setBusy(true);
    setNotice(null);
    applyPurchase(() => Store.restore())
      .then((ok) => setNotice(ok ? "購入を復元しました" : "復元できる購入が見つかりませんでした"))
      .catch((err: Error) => setNotice(err.message))
      .finally(() => setBusy(false));
  };
  /** データを消す（審査の決まり）。サーバーの分を消し、この端末の分も消して、最初の画面から始める */
  const wipe = async () => {
    if (!window.confirm("カード・デッキ・戦績をすべて消します。元に戻せません。消しますか？")) return;
    setBusy(true);
    try {
      await api("/me", { method: "DELETE" }, token);
      await forgetDevice();
      localStorage.clear();
      window.location.replace("/");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "消せませんでした");
      setBusy(false);
    }
  };

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
            {!isApp && <p className="ac-login">Google でログイン中</p>}
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

      {!isApp && (
        <>
          <div className="sec">
            <h2>友だち</h2>
          </div>
          <div className="ac-rows">
            <button type="button" className="ac-row g2" onClick={() => setInviting(true)}>
              <Icon d={I.invite} />
              <span className="grow">友だちを招待</span>
              <Icon d={I.chevron} className="ac-chev" />
            </button>
          </div>
        </>
      )}

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
        {isApp && access && !access.unlocked && (
          <button type="button" className="ac-row g2" onClick={showUnlock}>
            <Icon d={I.key} />
            <span className="grow">すべての機能を解放</span>
            <Icon d={I.chevron} className="ac-chev" />
          </button>
        )}
        {isApp && (
          <button type="button" className="ac-row g2" disabled={busy} onClick={restore}>
            <Icon d={I.restore} />
            <span className="grow">購入を復元</span>
          </button>
        )}
        <a className="ac-row g2" href={`${POLICY_ORIGIN}/privacy.html`} target="_blank" rel="noreferrer">
          <Icon d={I.doc} />
          <span className="grow">プライバシーポリシー</span>
          <Icon d={I.chevron} className="ac-chev" />
        </a>
        {isApp ? (
          <button type="button" className="ac-row dim g2" disabled={busy} onClick={() => void wipe()}>
            <Icon d={I.trash} />
            <span className="grow">データを消す</span>
          </button>
        ) : (
          <button type="button" className="ac-row dim g2" onClick={logout}>
            <Icon d={I.logout} />
            <span className="grow">ログアウト</span>
          </button>
        )}
      </div>

      {notice && (
        <p className="ac-notice g2" role="status">
          {notice}
        </p>
      )}
      {toast > 0 && (
        <div key={toast} className="ac-toast g3" role="status">
          名前を「{user.name}」に変えました
        </div>
      )}
      {inviting && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="友だちを招待">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setInviting(false)} />
          <section className="ac-sheet">
            <div className="ac-grip" aria-hidden="true" />
            <h2>友だちを招待</h2>
            <InviteFriends />
          </section>
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
