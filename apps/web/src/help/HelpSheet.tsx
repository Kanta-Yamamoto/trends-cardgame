import type { CardDef } from "@trends/cards";
import { useEffect } from "react";
import { AttrChips } from "../cards/AttrChips";
import { EffectText } from "../cards/EffectText";
import { HELP, useHelp } from "./help";

/**
 * 効果文の語を押したときの解説の小窓。闇堕ちなら、そのカードの闇堕ちの姿も添える。
 * トークンの名前（盾・裁きの雷 など）を押したときは、そのカードの種類・コスト・効果を見せる
 */
export function HelpSheet() {
  const { term, card, token, close } = useHelp();
  const shown = !!term || !!token;
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, close]);
  if (token) return <TokenSheet token={token} close={close} />;
  if (!term) return null;
  const h = HELP[term];
  if (!h) return null;
  const dark = h.kind === "dark" && card?.dark ? card.dark : null;
  return (
    <div className="zoom-sheet help-sheet" role="dialog" aria-modal="true" aria-label={`${h.title} の解説`}>
      <button type="button" className="zoom-sheet-bg" aria-label="閉じる" onClick={close} />
      <div className={`help-body ${h.kind}`}>
        <span className="help-kind">
          {h.kind === "keyword"
            ? "キーワード"
            : h.kind === "state"
              ? "状態"
              : h.kind === "dark"
                ? "★5 の仕組み"
                : "効果の語"}
        </span>
        <h2>{h.title}</h2>
        <p>{h.text}</p>
        {dark && card && (
          <div className="help-dark">
            <span className="help-dark-head">
              {card.name} の闇堕ち：<b>{dark.name}</b>
              <span className="help-dark-stats">
                <i className="t-atk">{dark.attack}</i>／<i className="t-hp">{dark.hp}</i>
              </span>
            </span>
            {dark.keywords.length > 0 && <span className="help-dark-kw">{dark.keywords.join("・")}</span>}
            <p className="help-dark-effect">
              <EffectText text={dark.effect} />
            </p>
            <AttrChips card={card} />
          </div>
        )}
        <button type="button" className="btn ghost" onClick={close}>
          閉じる
        </button>
      </div>
    </div>
  );
}

/** トークンのカードの小窓（ネ申の盾・裁きの雷・天罰 など、効果で生まれるカードの中身） */
function TokenSheet({ token, close }: { token: CardDef; close: () => void }) {
  return (
    <div
      className="zoom-sheet help-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={`${token.name} の効果`}
    >
      <button type="button" className="zoom-sheet-bg" aria-label="閉じる" onClick={close} />
      <div className="help-body token">
        <span className="help-kind">トークン</span>
        <h2>{token.name}</h2>
        <p className="help-token-meta">
          {token.type === "icon" ? "キャラクター" : "呪文"}・コスト {token.cost}
          {token.type === "icon" && (
            <>
              ・攻撃力 <b className="t-atk">{token.attack}</b>・体力 <b className="t-hp">{token.hp}</b>
            </>
          )}
        </p>
        {token.effect && (
          <p>
            <EffectText text={token.effect} />
          </p>
        )}
        <button type="button" className="btn ghost" onClick={close}>
          閉じる
        </button>
      </div>
    </div>
  );
}
