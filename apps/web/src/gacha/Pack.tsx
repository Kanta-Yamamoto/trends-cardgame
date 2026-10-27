import { Link } from "react-router";
import { fmt, totalGems, type Wallet } from "./wallet";

/** パックの名前（今は 1 種類） */
export const PACK_NAME = "第1弾パック";

/** ジェムの形 */
export function Gem({ size }: { size?: number }) {
  return (
    <span className="gx-gem" style={size ? { width: size, height: size } : undefined} aria-hidden="true" />
  );
}

/** 上の帯の右に出すジェムの札（押すとジェムを買う画面） */
export function GemPill({ wallet }: { wallet: Wallet | null }) {
  const total = totalGems(wallet);
  return (
    <Link to="/shop" className="gx-gem-pill g3" aria-label={`ジェム ${total ?? "—"}。ジェムを買う`}>
      <Gem />
      <b>{total === null ? "—" : fmt(total)}</b>
      <span className="gx-plus" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 6v12M6 12h12" />
        </svg>
      </span>
    </Link>
  );
}

/** 切り取り線より上の 1 枚分 */
function CapSheet() {
  return (
    <div className="gx-pk-capin">
      <span className="gx-pk-foil" />
      <span className="gx-pk-crimp t" />
      <span className="gx-pk-sheen" />
    </div>
  );
}

/**
 * パック（第1弾）の絵。capOff で、上の切り取り線より上が飛んでいく。
 * 切り取り線より上は、裂けた側（裂け目 --tip より左。裂け目を軸に --capl だけめくれる）と、
 * まだ付いている側（右端を軸に --capr だけ浮く）の 2 枚に分けてある。変数が無ければ 1 枚に見える
 */
export function Pack({ capOff = false }: { capOff?: boolean }) {
  return (
    <div className="gx-pack" aria-hidden="true">
      <div className="gx-pk-body">
        <span className="gx-pk-foil" />
        <img className="gx-pk-chara" src="/assets/cards/m1-subject.webp" alt="" draggable={false} />
        <span className="gx-pk-logo">TRENDS</span>
        <span className="gx-pk-band">第1弾</span>
        <span className="gx-pk-crimp b" />
        <span className="gx-pk-sheen" />
      </div>
      <div className={`gx-pk-cap ${capOff ? "off" : ""}`}>
        <div className="gx-pk-flap l">
          <CapSheet />
        </div>
        <div className="gx-pk-flap r">
          <CapSheet />
        </div>
      </div>
    </div>
  );
}
