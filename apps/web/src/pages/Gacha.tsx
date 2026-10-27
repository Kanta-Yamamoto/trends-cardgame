import { CARDS } from "@trends/cards";
import { openPack, PACK_PRICE, type PackCount, packChance, packPool } from "@trends/game-core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Opening, type PulledCard } from "../gacha/Opening";
import { Gem, PACK_NAME, Pack } from "../gacha/Pack";
import { fmt, totalGems, useWallet, type Wallet } from "../gacha/wallet";
import { api, useSession } from "../online/session";
import { usePageMusic } from "../sound/music";
import { SlotTable } from "./GachaRates";
import "../styles/gacha.css";

const POOL = packPool(CARDS);
/** パックに入るカードの種類（トークンを除く） */
export const PACK_KINDS = Object.values(POOL).flat().length;

type Sheet =
  | { kind: "confirm"; packs: PackCount }
  | { kind: "short"; packs: PackCount }
  | { kind: "rates" }
  | null;

/**
 * 本物のガチャ（ジェムを使い、カードが増える）を押せるか。10月27日、オーナー：「ジェムは今使えると良くないので、ガチャのボタンはまだ押せず」。
 * 開けるときは true にし、サーバーの GACHA_OPEN も true にする（サーバーは GACHA_OPEN でなければ断る）
 */
const REAL_GACHA = false;

/**
 * デモで引く（10月27日、オーナー：「一時的に同ページにデモでガチャを引くの機能を出しておきましょう」「これは後ほど消します」）。
 * 画面の中だけで同じルール（game-core の openPack）で開け、サーバーは呼ばない。カードは増えず、ジェムも減らない。NEW も出さない
 */
function demoPacks(packs: PackCount): PulledCard[][] {
  const rand = () => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32;
  return Array.from({ length: packs }, () => openPack(POOL, rand).map((id) => ({ id, isNew: false })));
}

/** 1 パックで出る割合の目安（「3パックに1枚」など） */
function perPack(rarity: number) {
  const p = packChance(rarity, POOL);
  if (p >= 0.999) return "毎パック1枚以上";
  return `${Math.round(1 / p)}パックに1枚`;
}

/**
 * ガチャ（10月27日。モックで決めた形）：真ん中にパック、下に「1パック」「10パック」。
 * ジェムが足りなければ「ジェムを買う」へ。開けたらパックを開ける演出（gacha/Opening.tsx）
 */
export function Gacha() {
  // 開いている間は、ガチャの曲を流す（パックを開ける演出の間も）
  usePageMusic("gacha");
  const token = useSession((s) => s.token);
  const wallet = useWallet((s) => s.wallet);
  const loadWallet = useWallet((s) => s.load);
  const setWallet = useWallet((s) => s.set);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // n：開けるたびに増やし、開ける画面を作り直す（もう1パックのとき、前のパックの続きにならないように）
  const [opening, setOpening] = useState<{ packs: PulledCard[][]; demo: boolean; n: number } | null>(null);
  const [openN, setOpenN] = useState(0);
  const show = (packs: PulledCard[][], demo: boolean) => {
    setOpening({ packs, demo, n: openN + 1 });
    setOpenN((n) => n + 1);
  };

  useEffect(() => {
    void loadWallet(token);
  }, [token, loadWallet]);

  const total = totalGems(wallet);
  const ask = (packs: PackCount) => {
    setError(null);
    if (total !== null && total < packs * PACK_PRICE) setSheet({ kind: "short", packs });
    else setSheet({ kind: "confirm", packs });
  };
  const open = (packs: PackCount) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    api<{ packs: PulledCard[][]; wallet: Wallet }>(
      "/gacha/open",
      { method: "POST", body: JSON.stringify({ packs }) },
      token,
    )
      .then((r) => {
        setWallet(r.wallet);
        setSheet(null);
        show(r.packs, false);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const demo = (packs: PackCount) => show(demoPacks(packs), true);

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

      {/* デモ（後で消す）：カードは増えず、ジェムも減らない */}
      <section className="gx-demo g2" aria-label="デモで引く">
        <div className="gx-demo-h">
          <span className="tag pri">デモ</span>
          <b>ためしに引く</b>
        </div>
        <p className="gx-demo-note">カードは増えず、ジェムも減りません。</p>
        <div className="gx-demo-btns">
          <button type="button" className="btn ghost" onClick={() => demo(1)}>
            1パック
          </button>
          <button type="button" className="btn ghost" onClick={() => demo(10)}>
            10パック
          </button>
        </div>
      </section>

      <div className="gx-dock">
        <div className="gx-pulls">
          <button type="button" className="btn ghost gx-pull" disabled={!REAL_GACHA} onClick={() => ask(1)}>
            <span className="l1">1パック</span>
            <span className="l2">
              <Gem />
              {fmt(PACK_PRICE)}
            </span>
          </button>
          <button type="button" className="btn gx-pull" disabled={!REAL_GACHA} onClick={() => ask(10)}>
            <span className="l1">10パック</span>
            <span className="l2">
              <Gem />
              {fmt(PACK_PRICE * 10)}
            </span>
          </button>
        </div>
        {!REAL_GACHA && <p className="gx-closed">ガチャは準備中です</p>}
        <button type="button" className="btn text" onClick={() => setSheet({ kind: "rates" })}>
          提供割合 ›
        </button>
      </div>

      {sheet && (
        <div className="sheet" role="dialog" aria-modal="true">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setSheet(null)} />
          <section className="gx-sheet">
            <div className="gx-grip" aria-hidden="true" />
            {sheet.kind === "confirm" && (
              <>
                <h2>{sheet.packs}パック開けますか？</h2>
                {total !== null && (
                  <div className="gx-cost">
                    <Gem size={20} />
                    <b>{fmt(total)}</b>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                    <b className="after">{fmt(total - sheet.packs * PACK_PRICE)}</b>
                  </div>
                )}
                <p className="gx-note">
                  ジェムを {fmt(sheet.packs * PACK_PRICE)} 使います。無償のジェムから先に使います。
                </p>
                {error && <p className="gx-error">{error}</p>}
                <div className="gx-btns">
                  <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
                    やめる
                  </button>
                  <button type="button" className="btn" disabled={busy} onClick={() => open(sheet.packs)}>
                    {busy ? "開けています…" : "開ける"}
                  </button>
                </div>
              </>
            )}
            {sheet.kind === "short" && (
              <>
                <h2>ジェムが足りません</h2>
                <p>
                  {sheet.packs}パックには {fmt(sheet.packs * PACK_PRICE)} いります。今は {fmt(total ?? 0)}{" "}
                  なので、あと <b>{fmt(sheet.packs * PACK_PRICE - (total ?? 0))}</b> です。
                </p>
                <div className="gx-btns">
                  <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
                    やめる
                  </button>
                  <Link to="/shop" className="btn">
                    ジェムを買う
                  </Link>
                </div>
              </>
            )}
            {sheet.kind === "rates" && (
              <>
                <h2>1パック（5枚）の中身</h2>
                <SlotTable />
                <p className="gx-note" style={{ marginTop: 10 }}>
                  同じ★のカードは、どれも同じ確率で出ます。同じカードが出ることもあります。
                </p>
                <div className="gx-btns">
                  <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
                    閉じる
                  </button>
                  <Link to="/gacha/rates" className="btn">
                    カードごとの確率
                  </Link>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {opening && (
        <Opening
          key={opening.n}
          packs={opening.packs}
          demo={opening.demo}
          onClose={() => setOpening(null)}
          onAgain={() => {
            if (opening.demo) {
              demo(1);
              return;
            }
            setOpening(null);
            ask(1);
          }}
        />
      )}
    </section>
  );
}
