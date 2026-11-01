/** パックの名前（今は 1 種類） */
export const PACK_NAME = "DIRECTOR'S CUT";

/**
 * パックの表の印刷。本体と、切り取り線より上の 2 枚に同じ絵を重ね、線で切り分ける。
 * 表紙は『演出家』（11月2日。第1弾は『演出家』『フィクサー』『調停者』の 3 人を顔にする）
 */
function Print() {
  return (
    <>
      <span className="gx-pk-foil" />
      <img className="gx-pk-chara" src="/assets/cards/c17-subject.webp" alt="" draggable={false} />
      <span className="gx-pk-logo">TRENDS</span>
      <span className="gx-pk-band">第1弾</span>
      <span className="gx-pk-crimp t" />
      <span className="gx-pk-crimp b" />
      <span className="gx-pk-sheen" />
    </>
  );
}

/**
 * パック（第1弾）の絵。capOff で、切り取り線より上が飛んでいく。
 * 外側は印刷、内側は銀色のフィルム。切り取り線（gacha/tear.ts の shape）で、本体・裂けた側（裂け目より左。
 * 裂け目を軸に --capl だけめくれる）・まだ付いている側（右端を軸に --capr だけ浮く）に切り分ける。
 * 裂けた所のふちと、上の端が浮いて開いた口に、内側の銀色が見える。
 * カードを残してパックを抜く間は、真ん中がテカって袋らしく見える（gloss）
 */
export function Pack({ capOff = false }: { capOff?: boolean }) {
  return (
    <div className="gx-pack" aria-hidden="true">
      <div className="gx-pk-body">
        <Print />
        <span className="gx-pk-edge" />
        <span className="gx-pk-gloss" />
      </div>
      <span className="gx-pk-mouth" />
      <div className={`gx-pk-cap ${capOff ? "off" : ""}`}>
        <div className="gx-pk-flap r">
          <Print />
        </div>
        <div className="gx-pk-flap l">
          <Print />
          <span className="gx-pk-edge" />
        </div>
      </div>
    </div>
  );
}
