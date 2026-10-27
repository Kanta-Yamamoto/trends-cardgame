import { checkPlayerName, PLAYER_NAME_MAX, playerNameLength } from "@trends/game-core";

/** 入れた名前を確かめた結果（画面の下の一言と、決めるボタンを押せるか） */
export function nameStatus(
  value: string,
  current?: string,
): { ok: boolean; msg: string; cls: "" | "ok" | "ng" } {
  if (!value.trim()) return { ok: false, msg: `1〜${PLAYER_NAME_MAX}文字。あとから変えられます`, cls: "" };
  const c = checkPlayerName(value);
  if (!c.ok) return { ok: false, msg: c.reason, cls: "ng" };
  if (current !== undefined && c.name === current) return { ok: false, msg: "今の名前と同じです", cls: "" };
  return { ok: true, msg: "この名前にできます", cls: "ok" };
}

/** プレイヤー名の入力（文字数と、使えるかの一言つき）。初期登録とマイページで同じ */
export function NameField({
  id,
  value,
  onChange,
  current,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  /** 今の名前（同じなら変えられない） */
  current?: string;
  /** サーバーに断られたときの文 */
  error?: string | null;
  autoFocus?: boolean;
}) {
  const n = playerNameLength(value);
  const st = nameStatus(value, current);
  return (
    <div className="ac-field">
      <label className="ac-field-h" htmlFor={id}>
        プレイヤー名
        <span className={`ac-count ${n > PLAYER_NAME_MAX ? "over" : ""}`}>
          {n} / {PLAYER_NAME_MAX}
        </span>
      </label>
      <input
        id={id}
        className="ac-input"
        type="text"
        placeholder="例：そら"
        autoComplete="off"
        enterKeyHint="done"
        // biome-ignore lint/a11y/noAutofocus: 名前を入れるための小窓・画面なので、開いたらすぐ入れられるように
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className={`ac-msg ${error ? "ng" : st.cls}`} role="status">
        {error ?? st.msg}
      </p>
    </div>
  );
}
