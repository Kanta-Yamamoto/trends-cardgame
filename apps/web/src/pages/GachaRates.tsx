import { CARDS } from "@trends/cards";
import { PACK_SLOTS, packChance, packPool, slotOdds } from "@trends/game-core";
import { useState } from "react";
import "../styles/gacha.css";

const POOL = packPool(CARDS);
const NAME = new Map(CARDS.map((c) => [c.id, c.name]));
/** パックに入るカードの種類（トークンを除く） */
const KINDS = Object.values(POOL).flat().length;

/** 確率の表示（33.33% など。小さい値は小数第 3 位まで） */
const pct = (p: number, digits = 2) => `${p >= 0.9999 ? "100" : (p * 100).toFixed(digits)}%`;
const stars = (r: number) => "★".repeat(r);

/** 続く枠のうち、同じ値のものをまとめる（1〜3枚目 など） */
function mergeSlots<T>(values: (T | undefined)[]): { label: string; value: T }[] {
  const out: { from: number; to: number; value: T; key: string }[] = [];
  values.forEach((value, i) => {
    if (value === undefined) return;
    const key = JSON.stringify(value);
    const prev = out[out.length - 1];
    if (prev && prev.key === key && prev.to === i - 1) prev.to = i;
    else out.push({ from: i, to: i, value, key });
  });
  return out.map((g) => ({
    label: g.from === g.to ? `${g.from + 1}枚目` : `${g.from + 1}〜${g.to + 1}枚目`,
    value: g.value,
  }));
}

/** 枠ごとの★の割合（同じ割合の枠はまとめる） */
const slotGroups = () =>
  mergeSlots(PACK_SLOTS.map((slot) => slotOdds(slot, POOL))).map((g) => ({ label: g.label, odds: g.value }));

/** 1 パックの中身の表（ガチャの小窓と、このページで同じ） */
export function SlotTable() {
  return (
    <div className="gx-tbl">
      {slotGroups().map((g) => (
        <div key={g.label} className="gx-tr">
          <span className="k">{g.label}</span>
          <span className="v">
            {[...g.odds]
              .sort((a, b) => b.rarity - a.rarity)
              .map((o) => (
                <span key={o.rarity}>
                  {stars(o.rarity)}
                  <small>{o.kinds}種類</small>
                  <b className="gx-pct">{pct(o.p)}</b>
                </span>
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}

/** カード 1 枚ごとの確率（枠ごと。同じ★のカードはどれも同じ）。「4枚目 5.000%／5枚目 0.833%」の形 */
function cardRates(rarity: number) {
  const perSlot = PACK_SLOTS.map((slot) => {
    const o = slotOdds(slot, POOL).find((x) => x.rarity === rarity);
    return o ? pct(o.p / o.kinds, 3) : undefined;
  });
  return mergeSlots(perSlot);
}

/** 提供割合（10月27日）：1 パックで出る目安・枠ごとの割合・カードごとの確率 */
export function GachaRates() {
  const [open, setOpen] = useState<Record<number, boolean>>({ 5: true });
  return (
    <section className="page gx-rates">
      <div className="sec">
        <h2>1パックで出る目安</h2>
        <small>全{KINDS}種類</small>
      </div>
      <div className="gx-per">
        {[5, 4, 3].map((r) => {
          const p = packChance(r, POOL);
          return (
            <div key={r} className="g2">
              <span className="gx-stars">{stars(r)}</span>
              <b>{pct(p)}</b>
              <small>{p >= 0.9999 ? "毎パック1枚以上" : `${Math.round(1 / p)}パックに1枚`}</small>
            </div>
          );
        })}
      </div>
      <div className="sec">
        <h2>1パック（5枚）の中身</h2>
      </div>
      <SlotTable />
      <div className="sec">
        <h2>カードごとの確率</h2>
        <small>押すと開きます</small>
      </div>
      {[5, 4, 3, 2, 1].map((r) => {
        const ids = POOL[r] ?? [];
        if (!ids.length) return null;
        const rates = cardRates(r);
        const rate = rates.map((x) => `${x.label} ${x.value}`).join("／");
        const each = rates.map((x) => x.value).join("／");
        return (
          <section key={r} className="gx-grp g2">
            <button type="button" className="gx-grp-h" onClick={() => setOpen((o) => ({ ...o, [r]: !o[r] }))}>
              <span className="gx-stars">{stars(r)}</span>
              <span className="grow">
                {ids.length}種類・{rate}
              </span>
              <svg
                className={open[r] ? "open" : ""}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            {open[r] && (
              <div className="gx-cl">
                {ids.map((id) => (
                  <div key={id}>
                    <span>{NAME.get(id)}</span>
                    <i>{each}</i>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
      <div className="gx-foot">
        <p>同じ★のカードは、どれも同じ確率で出ます。同じカードが出ることもあります。</p>
        <p>確率は四捨五入しているため、足して100%にならないことがあります。</p>
      </div>
    </section>
  );
}
