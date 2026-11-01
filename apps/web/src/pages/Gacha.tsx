import { CARDS } from "@trends/cards";
import { DAILY_PACKS, MAX_OPEN_PACKS, packChance, packPool } from "@trends/game-core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type Access, useAccess } from "../gacha/access";
import { useCollection } from "../gacha/collection";
import { Opening, type PulledCard } from "../gacha/Opening";
import { PACK_NAME, Pack } from "../gacha/Pack";
import { api, useSession } from "../online/session";
import { useUnlock } from "../purchase/Unlock";
import { usePageMusic } from "../sound/music";
import { GachaTour } from "../tutorial/TourGuides";
import { SlotTable } from "./GachaRates";
import "../styles/gacha.css";

const POOL = packPool(CARDS);
/** パックに入るカードの種類（トークンを除く） */
export const PACK_KINDS = Object.values(POOL).flat().length;

/** 1 パックで出る割合の目安（「3パックに1枚」など） */
function perPack(rarity: number) {
  const p = packChance(rarity, POOL);
  if (p >= 0.999) return "毎パック1枚以上";
  return `${Math.round(1 / p)}パックに1枚`;
}

/**
 * ガチャ（11月1日。お金ではなくパックを開ける体験として作り直した）：真ん中にパック、下に開けるボタン。
 * 買う前はチュートリアルの 1 パックだけ、買ったあとは毎日のパックを開ける（docs/product.md）。
 * 開けたらパックを開ける演出（gacha/Opening.tsx）
 */
export function Gacha() {
  // 開いている間は、ガチャの曲を流す（パックを開ける演出の間も）
  usePageMusic("gacha");
  const token = useSession((s) => s.token);
  const access = useAccess((s) => s.access);
  const loadAccess = useAccess((s) => s.load);
  const setAccess = useAccess((s) => s.set);
  const loadCards = useCollection((s) => s.load);
  const showUnlock = useUnlock((s) => s.show);
  const [rates, setRates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // n：開けるたびに増やし、開ける画面を作り直す（もう1パックのとき、前のパックの続きにならないように）
  const [opening, setOpening] = useState<{ packs: PulledCard[][]; n: number } | null>(null);

  useEffect(() => {
    void loadAccess(token);
  }, [token, loadAccess]);

  const open = (packs: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    api<{ packs: PulledCard[][]; access: Access }>(
      "/gacha/open",
      { method: "POST", body: JSON.stringify({ packs }) },
      token,
    )
      .then((r) => {
        setAccess(r.access);
        setOpening((o) => ({ packs: r.packs, n: (o?.n ?? 0) + 1 }));
        void loadCards(token);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const left = access?.packs ?? 0;
  const many = Math.min(left, MAX_OPEN_PACKS);

  return (
    <section className="page gx-top">
      <span className="gx-rays" aria-hidden="true" />
      <span className="gx-iri" aria-hidden="true" />
      <div className="gx-pack-wrap">
        <Pack />
      </div>
      <div className="gx-info">
        <h2>{PACK_NAME}</h2>
        <p className="gx-sub">1パック 5枚入り・全{PACK_KINDS}種類</p>
        <div className="gx-rate3 g2">
          {[5, 4, 3].map((r) => (
            <div key={r}>
              <span className="gx-stars">{"★".repeat(r)}</span>
              <b>{perPack(r)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="gx-dock">
        {left > 0 ? (
          <>
            <p className="gx-left">
              今開けられるパック <b>{left}</b>
            </p>
            <div className="gx-pulls">
              {/* data-tut：チュートリアルで押してもらうボタン */}
              <button
                type="button"
                className={`btn ${many > 1 ? "ghost" : ""} gx-pull`}
                data-tut="gacha-pack"
                data-decide-se
                disabled={busy}
                onClick={() => open(1)}
              >
                1パック開ける
              </button>
              {many > 1 && (
                <button
                  type="button"
                  className="btn gx-pull"
                  data-decide-se
                  disabled={busy}
                  onClick={() => open(many)}
                >
                  {many}パック開ける
                </button>
              )}
            </div>
          </>
        ) : access?.unlocked ? (
          <p className="gx-closed">次のパックは明日です（毎日 {DAILY_PACKS} パック）</p>
        ) : (
          access && (
            <>
              <p className="gx-closed">パックの続きは、全部解放すると開けられます</p>
              <button type="button" className="btn" data-decide-se onClick={showUnlock}>
                全部解放する
              </button>
            </>
          )
        )}
        {error && <p className="gx-error">{error}</p>}
        <button type="button" className="btn text" onClick={() => setRates(true)}>
          提供割合 ›
        </button>
      </div>

      {rates && (
        <div className="sheet" role="dialog" aria-modal="true">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setRates(false)} />
          <section className="gx-sheet">
            <div className="gx-grip" aria-hidden="true" />
            <h2>1パック（5枚）の中身</h2>
            <SlotTable />
            <p className="gx-note" style={{ marginTop: 10 }}>
              同じ★のカードは、どれも同じ確率で出ます。同じカードが出ることもあります。
            </p>
            <div className="gx-btns">
              <button type="button" className="btn ghost" onClick={() => setRates(false)}>
                閉じる
              </button>
              <Link to="/gacha/rates" className="btn">
                カードごとの確率
              </Link>
            </div>
          </section>
        </div>
      )}

      {!opening && !rates && <GachaTour />}
      {opening && (
        <Opening
          key={opening.n}
          packs={opening.packs}
          onClose={() => setOpening(null)}
          onAgain={left > 0 ? () => open(1) : undefined}
        />
      )}
    </section>
  );
}
