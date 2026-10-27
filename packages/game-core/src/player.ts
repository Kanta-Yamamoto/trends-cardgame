/**
 * プレイヤー名の決まり（10月27日。初めてログインしたときに決め、マイページで変えられる）。
 * ランキング・オンライン対戦の相手の画面・ホームの左上の札に出る
 */

/** 名前の長さの上限（文字数）。ホームの札・ランキングの行で切れずに収まる長さ */
export const PLAYER_NAME_MAX = 10;

/** 使えない言葉（CPU 戦の相手の名前・運営とまぎらわしいもの）。大文字・小文字・全角を区別せず、含んでいたら使えない */
export const RESERVED_NAME_WORDS = ["CPU", "運営", "TRENDS"] as const;

export type PlayerNameCheck = { ok: true; name: string } | { ok: false; reason: string };

/** 名前を確かめる。前後の空白は削って返す */
export function checkPlayerName(raw: string): PlayerNameCheck {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length === 0) return { ok: false, reason: "名前を入れてください" };
  if (length > PLAYER_NAME_MAX) return { ok: false, reason: `${PLAYER_NAME_MAX}文字までです` };
  // 改行・制御文字は入れさせない（ランキングの行が崩れる）
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name)) return { ok: false, reason: "使えない文字が入っています" };
  const plain = name.normalize("NFKC").toUpperCase();
  if (RESERVED_NAME_WORDS.some((w) => plain.includes(w)))
    return { ok: false, reason: "CPU・運営とまぎらわしい名前は使えません" };
  return { ok: true, name };
}

/** 名前の文字数（絵文字なども 1 文字と数える。画面の「3 / 10」に使う） */
export const playerNameLength = (raw: string) => Array.from(raw.trim()).length;
