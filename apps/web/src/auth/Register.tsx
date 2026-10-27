import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { fmt } from "../gacha/wallet";
import { api, type User, useSession } from "../online/session";
import { NameField, nameStatus } from "./NameField";
import "../styles/account.css";

interface Renamed {
  token: string;
  user: User;
  /** 初めて決めたときに配られたジェム */
  welcomeGems: number;
}

/**
 * 初期登録（10月27日。モックの A 案）：初めてログインした人は、プレイヤー名を決めるまでこの画面だけ。
 * 地はログインの画面と同じ。名前を決めると「ようこそ」を出し、ホームへ
 */
export function RegisterScreen() {
  const token = useSession((s) => s.token);
  const setSession = useSession((s) => s.setSession);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Renamed | null>(null);
  const ok = nameStatus(name).ok;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    api<Renamed>("/me/name", { method: "PUT", body: JSON.stringify({ name }) }, token)
      .then(setDone)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  const goHome = () => {
    if (!done) return;
    navigate("/");
    setSession({ token: done.token, user: done.user });
  };

  return (
    <div className="login-screen ac-reg">
      <div className="login-bg" aria-hidden="true">
        <span style={{ backgroundImage: "url(/assets/cards/c13-art.jpg)" }} />
      </div>
      <span className="login-rays" aria-hidden="true" />
      <img className="login-chara" src="/assets/cards/c13-subject.webp" alt="" draggable={false} />
      <p className="login-brand" aria-hidden="true">
        TRENDS
      </p>
      <main className="login-box g3">
        {done ? (
          <section className="ac-welcome" aria-live="polite">
            <span className="ac-big-av" aria-hidden="true">
              {Array.from(done.user.name)[0]}
            </span>
            <h1>ようこそ、{done.user.name}</h1>
            <p className="ac-lead">ホームの左上の札を押すと、いつでもマイページを開けます。</p>
            {done.welcomeGems > 0 && (
              <p className="ac-gift">
                はじめてのお礼に、ジェムを<b>{fmt(done.welcomeGems)}</b>贈りました
              </p>
            )}
            <button type="button" className="btn lg" onClick={goHome}>
              ホームへ
            </button>
          </section>
        ) : (
          <form className="ac-reg-box" onSubmit={submit}>
            <span className="tag pri">はじめに</span>
            <h1>プレイヤー名を決める</h1>
            <p className="ac-lead">
              対戦の相手とランキングに出る名前です。あとからマイページで変えられます。
            </p>
            <NameField id="reg-name" value={name} onChange={setName} error={error} />
            <button type="submit" className="btn lg" disabled={!ok || busy}>
              {busy ? "決めています…" : "この名前ではじめる"}
            </button>
            <button type="button" className="btn text" onClick={logout}>
              ほかのアカウントで入り直す
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
