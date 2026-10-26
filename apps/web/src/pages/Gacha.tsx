import { Link } from "react-router";

/** ガチャ（まだ無い。ホームの入口だけ先に置き、押すとこの画面）。裏向きのカードを扇に並べ、下に「準備中」の台 */
export function Gacha() {
  return (
    <section className="page gacha">
      <span className="gacha-rays" aria-hidden="true" />
      <div className="gacha-fan" aria-hidden="true">
        <span className="gacha-iri" />
        <span className="gacha-back b1" />
        <span className="gacha-back b2" />
        <span className="gacha-back b3" />
        <span className="gacha-spark" style={{ left: -130, top: -150 }} />
        <span className="gacha-spark" style={{ left: 110, top: -120, animationDelay: "0.8s" }} />
        <span
          className="gacha-spark"
          style={{ left: 96, top: 70, animationDelay: "1.4s", width: 10, height: 10 }}
        />
        <span
          className="gacha-spark"
          style={{ left: -120, top: 60, animationDelay: "1.9s", width: 12, height: 12 }}
        />
      </div>
      <div className="gacha-box g3">
        <span className="tag pri gacha-soon">準備中</span>
        <h2>ガチャは、いま作っています</h2>
        <Link to="/" className="btn lg">
          ホームへ戻る
        </Link>
      </div>
    </section>
  );
}
