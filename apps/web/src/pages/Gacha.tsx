import { CARDS, type CardDef } from "@trends/cards";
import { DAILY_PACKS, MAX_OPEN_PACKS } from "@trends/game-core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ATTR_META } from "../cards/meta";
import { type Access, useAccess } from "../gacha/access";
import { useCollection } from "../gacha/collection";
import { Opening, type PulledCard } from "../gacha/Opening";
import { PACK_NAME, Pack } from "../gacha/Pack";
import { CardPopup } from "../game/CardPopup";
import { api, useSession } from "../online/session";
import { useUnlock } from "../purchase/Unlock";
import { usePageMusic } from "../sound/music";
import { GachaTour } from "../tutorial/TourGuides";
import { SlotTable } from "./GachaRates";
import "../styles/gacha.css";

const card = (id: string) => CARDS.find((c) => c.id === id);
/** パックの左右に覗かせるカード（第1弾の顔の 3 人のうち、パックの絵でない 2 人） */
const SIDE_L = card("c16");
const SIDE_R = card("c15");
/** ピックアップカード。押すと拡大の小窓で効果まで読める */
const PICKUP = ["g20", "c2", "c3"].flatMap((id) => card(id) ?? []);

/**
 * ガチャ（11月2日。オーナーと案 D で決めた形）：左右にカードが覗くパック、帯のパック名、ピックアップカード、下に開けるボタン。
 * 確率の文は画面に出さず、提供割合に置く（審査に要る）。この画面だけ、パックに合わせて赤・黒・白の地にする。
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
  const [zoom, setZoom] = useState<CardDef | null>(null);
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
      <div className="gx-hero">
        <img className="gx-peek l" src={SIDE_L?.art} alt="" draggable={false} />
        <img className="gx-peek r" src={SIDE_R?.art} alt="" draggable={false} />
        <div className="gx-pack-wrap">
          <Pack />
        </div>
      </div>
      <h2 className="gx-ribbon">
        <small>第1弾</small>
        {PACK_NAME}
      </h2>
      <section className="gx-pick" aria-label="ピックアップカード">
        <h3>ピックアップカード</h3>
        <div className="gx-pick-row">
          {PICKUP.map((c) => (
            <button key={c.id} type="button" className="gx-pick-card" onClick={() => setZoom(c)}>
              <img src={c.art} alt="" draggable={false} />
              <b>{c.name}</b>
              <span className="gx-stars">{"★".repeat(c.rarity)}</span>
              <span className="gx-pick-tags">
                {c.attributes.map((a) => (
                  <i key={a} style={{ background: ATTR_META[a].color }}>
                    {a}
                  </i>
                ))}
                {c.kaiwai.slice(0, 1).map((k) => (
                  <i key={k} className="kw">
                    {k}
                  </i>
                ))}
              </span>
            </button>
          ))}
        </div>
      </section>

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
              <p className="gx-closed">パックの続きは、解放すると開けられます</p>
              <button type="button" className="btn" data-decide-se onClick={showUnlock}>
                すべての機能を解放
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

      {zoom && <CardPopup card={zoom} onClose={() => setZoom(null)} />}
      {!opening && !rates && !zoom && <GachaTour />}
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
