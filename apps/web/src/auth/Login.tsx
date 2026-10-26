import { type FormEvent, useEffect, useRef, useState } from "react";
import { type AuthConfig, api, loadGoogle, useSession } from "../online/session";

/**
 * ログイン（Google アカウント。手元の開発では名前だけのログインも）。
 * サービス全体でログインが要る（10月26日。App.tsx の入口で、ログインしていなければこの画面だけを出す）
 */
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
        g.renderButton(ref.current, { theme: "filled_blue", size: "large", shape: "pill", locale: "ja" });
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

export function Login() {
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
      <p className="muted">TRENDS は、Google アカウントでログインして遊びます。</p>
      {down && <p className="notice">サーバーに繋がりません。時間をおいて開き直してください。</p>}
      {cfg?.googleClientId && <GoogleButton clientId={cfg.googleClientId} />}
      {cfg?.devLogin && <DevLogin />}
      {cfg && !cfg.googleClientId && !cfg.devLogin && (
        <p className="notice">ログインの設定がまだです（GOOGLE_CLIENT_ID）。</p>
      )}
    </div>
  );
}

export function Account() {
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
