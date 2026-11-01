import { create } from "zustand";
import { API_URL } from "../api/client";
import { deviceSecret, isApp } from "../native";

export interface User {
  id: string;
  name: string;
  picture: string | null;
  /** 本人がプレイヤー名を決めたか（false なら初期登録の画面だけを出す。前の版で保存したログインは持たない） */
  nameSet?: boolean;
}
export interface AuthConfig {
  googleClientId: string;
  devLogin: boolean;
}

const KEY = "trends.session";

/** ブラウザに保存したログイン（使えない環境では保存しない） */
function load(): { token: string; user: User } | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function save(v: { token: string; user: User } | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても、このページを開いている間はログインしたまま
  }
}

/** API を呼ぶ。失敗したらサーバーのメッセージで Error を投げる */
export async function api<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.message === "string" ? body.message : `エラー（${res.status}）`);
  return body as T;
}

interface Session {
  token: string | null;
  user: User | null;
  loginWithGoogle: (credential: string) => Promise<void>;
  loginForDev: (name: string) => Promise<void>;
  /** アプリの端末で入る（アプリにログインは無い） */
  loginWithDevice: () => Promise<void>;
  /** 名前を決めた・変えたあとの、新しいトークンとユーザーに入れ替える */
  setSession: (r: { token: string; user: User }) => void;
  logout: () => void;
  /** 保存してあるログインがまだ使えるか確かめる（期限切れ・消えたアカウントならログアウト） */
  check: () => Promise<void>;
}

export const useSession = create<Session>((set) => {
  const saved = load();
  const done = (r: { token: string; user: User }) => {
    save(r);
    set(r);
  };
  const session: Session = {
    token: saved?.token ?? null,
    user: saved?.user ?? null,
    loginWithGoogle: async (credential) =>
      done(await api("/auth/google", { method: "POST", body: JSON.stringify({ credential }) })),
    loginForDev: async (name) =>
      done(await api("/auth/dev", { method: "POST", body: JSON.stringify({ name }) })),
    loginWithDevice: async () =>
      done(
        await api("/auth/device", {
          method: "POST",
          body: JSON.stringify({ secret: await deviceSecret() }),
        }),
      ),
    setSession: done,
    logout: () => {
      save(null);
      set({ token: null, user: null });
    },
    check: async () => {
      const token = load()?.token;
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        // 断られたときだけログアウトする（電波が無い・サーバーが起き上がり中のときは、そのまま使う）
        if (res.status === 401) {
          save(null);
          set({ token: null, user: null });
          // アプリは入り直す（期限は 30 日）。画面の入口でも入り直すので、失敗はそのまま
          if (isApp) await session.loginWithDevice();
          return;
        }
        // 名前を決めたか・今の名前を、サーバーの値にそろえる（別の端末で名前を変えたときも）
        if (res.ok) {
          const me = (await res.json()) as User;
          if (load()?.token === token && typeof me.nameSet === "boolean") done({ token, user: me });
        }
      } catch {
        // 確かめられなくても、そのまま使う
      }
    },
  };
  return session;
});

/* ---------- Google のログインボタン（Google Identity Services） ---------- */

interface GoogleId {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let gsi: Promise<GoogleId> | null = null;
/** Google のログイン用スクリプトを1回だけ読み込む */
export function loadGoogle(): Promise<GoogleId> {
  gsi ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error("no google")));
    s.onerror = () => {
      gsi = null;
      reject(new Error("Google のログインを読み込めませんでした"));
    };
    document.head.appendChild(s);
  });
  return gsi;
}
