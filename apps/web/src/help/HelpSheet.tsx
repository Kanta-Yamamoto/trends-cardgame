import { useEffect } from "react";
import { AttrChips } from "../cards/AttrChips";
import { EffectText } from "../cards/EffectText";
import { HELP, useHelp } from "./help";

/** 効果文の語を押したときの解説の小窓。闇堕ちなら、そのカードの闇堕ちの姿も添える */
export function HelpSheet() {
  const { term, card, close } = useHelp();
  useEffect(() => {
    if (!term) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [term, close]);
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
