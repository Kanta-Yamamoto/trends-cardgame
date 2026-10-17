import { create } from "zustand";
import { API_URL } from "../api/client";

export interface User {
  id: string;
  name: string;
  picture: string | null;
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
  logout: () => void;
}

export const useSession = create<Session>((set) => {
  const saved = load();
  const done = (r: { token: string; user: User }) => {
    save(r);
    set(r);
  };
  return {
    token: saved?.token ?? null,
    user: saved?.user ?? null,
    loginWithGoogle: async (credential) =>
      done(await api("/auth/google", { method: "POST", body: JSON.stringify({ credential }) })),
    loginForDev: async (name) =>
      done(await api("/auth/dev", { method: "POST", body: JSON.stringify({ name }) })),
    logout: () => {
      save(null);
      set({ token: null, user: null });
    },
  };
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
