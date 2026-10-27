import { PACK_PRICE } from "@trends/game-core";
import { type CSSProperties, useEffect, useState } from "react";
import { Gem } from "../gacha/Pack";
import { fmt, totalGems, useWallet } from "../gacha/wallet";
import { useSession } from "../online/session";
import "../styles/gacha.css";

/**
 * ジェムの並び（金額は仮。1 ジェム ＝ 1 円）と、絵の宝石の置き方（左・上・大きさ）。
 * 決済（Stripe のカード払い。PayPay は後から足せる）の準備ができるまでは、買えない状態で画面だけ用意する（10月27日、オーナー）
 */
const ITEMS: { amount: number; gems: [number, number, number][] }[] = [
  { amount: 150, gems: [[16, 10, 22]] },
  {
    amount: 500,
    gems: [
      [6, 14, 20],
      [24, 8, 24],
    ],
  },
  {
    amount: 1500,
    gems: [
      [2, 16, 20],
      [26, 16, 20],
      [13, 2, 26],
    ],
  },
  {
    amount: 3000,
    gems: [
      [0, 20, 20],
      [30, 20, 20],
      [6, 4, 22],
      [24, 0, 26],
    ],
  },
  {
    amount: 5000,
    gems: [
      [0, 22, 20],
      [32, 22, 20],
      [16, 24, 18],
      [4, 4, 24],
      [24, 0, 28],
    ],
  },
];

const yen = (n: number) => `¥${fmt(n)}`;
/** 何パック分か（3パック分と少し など） */
function packsOf(amount: number) {
  const n = Math.floor(amount / PACK_PRICE);
  return amount % PACK_PRICE === 0 ? `${n}パック分` : `${n}パック分と少し`;
}

/** ジェムを買う（10月27日。画面だけ。押すと購入の確認まで進み、支払うボタンは「準備中」） */
export function Shop() {
  const token = useSession((s) => s.token);
  const wallet = useWallet((s) => s.wallet);
  const loadWallet = useWallet((s) => s.load);
  const [sel, setSel] = useState<number | null>(null);
  const [method, setMethod] = useState<"card" | "paypay">("card");

  useEffect(() => {
    void loadWallet(token);
  }, [token, loadWallet]);

  const total = totalGems(wallet);
  const item = sel === null ? null : ITEMS[sel];

  return (
    <section className="page gx-shop">
      <section className="gx-bal g2">
        <div className="gx-bal-top">
          <small>持っているジェム</small>
          <span className="gx-bal-num">
            <Gem />
            <b>{total === null ? "—" : fmt(total)}</b>
          </span>
        </div>
        <div className="gx-bal-split">
          <span>
            有償<b>{wallet ? fmt(wallet.paid) : "—"}</b>
          </span>
          <span>
            無償<b>{wallet ? fmt(wallet.free) : "—"}</b>
          </span>
        </div>
      </section>
      <div className="sec">
        <h2>ジェム</h2>
        <small>1パック ＝ {PACK_PRICE}</small>
      </div>
      <div className="gx-items">
        {ITEMS.map((it, i) => (
          <button key={it.amount} type="button" className="gx-item g2" onClick={() => setSel(i)}>
            <span className="gx-pile" aria-hidden="true">
              {it.gems.map(([x, y, s]) => (
                <span
                  key={`${x}-${y}`}
                  className="gx-gem"
                  style={{ left: x, top: y, width: s, height: s } as CSSProperties}
                />
              ))}
            </span>
            <span className="gx-amt">
              <b>{fmt(it.amount)}</b>
              <small>{packsOf(it.amount)}</small>
            </span>
            <span className="gx-price">{yen(it.amount)}</span>
          </button>
        ))}
      </div>
      <p className="gx-soon g2">
        <span className="tag pri">準備中</span>
        支払いの準備ができたら、買えるようになります
      </p>
      <div className="gx-foot">
        <p>買ったジェムは、ガチャに使えます。無償のジェムから先に使います。</p>
      </div>

      {item && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="購入の確認">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setSel(null)} />
          <section className="gx-sheet">
            <div className="gx-grip" aria-hidden="true" />
            <h2>購入の確認</h2>
            <div className="gx-buy">
              <Gem size={28} />
              <span className="grow">
                <b>{fmt(item.amount)}</b>
                <small>ジェム・{packsOf(item.amount)}</small>
              </span>
              <span className="yen">{yen(item.amount)}</span>
            </div>
            <p className="gx-sub-h">支払い方法</p>
            <button
              type="button"
              className={`gx-opt ${method === "card" ? "on" : ""}`}
              onClick={() => setMethod("card")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
                <path d="M2.5 10h19M6 15h4" />
              </svg>
              <span className="grow">
                <b>クレジットカード</b>
                <small>デビットカードも使えます</small>
              </span>
              <span className="dot" />
            </button>
            <button
              type="button"
              className={`gx-opt ${method === "paypay" ? "on" : ""}`}
              onClick={() => setMethod("paypay")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                <path d="M9.5 8h5v5h-5zM11 18h2" />
              </svg>
              <span className="grow">
                <b>PayPay</b>
                <small>PayPay アプリで支払う</small>
              </span>
              <span className="dot" />
            </button>
            <div className="gx-terms">
              <div>
                <span>支払う金額</span>
                <span>{yen(item.amount)}（税込）</span>
              </div>
              <div>
                <span>支払いの時期</span>
                <span>このあとすぐ</span>
              </div>
              <div>
                <span>ジェムが届く</span>
                <span>支払いが終わってすぐ</span>
              </div>
              <div>
                <span>返金・取り消し</span>
                <span>できません</span>
              </div>
            </div>
            <div className="gx-btns">
              <button type="button" className="btn ghost" onClick={() => setSel(null)}>
                やめる
              </button>
              <button type="button" className="btn" disabled>
                準備中
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
