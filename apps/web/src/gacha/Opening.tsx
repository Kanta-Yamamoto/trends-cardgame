import { CARDS, type CardDef } from "@trends/cards";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { HoloCard } from "../cards/HoloCard";
import { frameSize } from "../frame";
import { PACK_NAME, Pack } from "./Pack";

/** 開けたパックの 1 枚（isNew：このガチャの前は持っていなかった） */
export interface PulledCard {
  id: string;
  isNew: boolean;
}

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

/**
 * 当たり（5 枚目が★4・★5）の時間（ミリ秒）。10月27日にオーナーとモックで決めた形：
 * 宙に浮かせ（lift）→ 真ん中を軸に回す絞り（sq。全体の 26% で 30% まで加速して回り、残りでゆっくり）。表は見せず、まわりから後ろの光が漏れる
 * → whiteFrom の割合から白が画面を覆う → 白いまま（hold）→ 白が引いて（whiteOut）当たりのカードを見せる。★5 は長く、★4 は短く
 */
const HIT = {
  4: { lift: 350, sq: 1500, whiteFrom: 0.7, hold: 150, whiteOut: 700 },
  5: { lift: 450, sq: 2300, whiteFrom: 0.72, hold: 320, whiteOut: 1000 },
} as const;
/**
 * ★5 の当たりのカード（10月27日。オーナー：「画面全体を枠とみなして、絵と効果を全体的に出したい」「縦横比は守って」
 * 「何秒か表示したあとに元のカードの大きさまで縮小して一連の動作を終えて」）。白が引くと、カードを縦横比のまま画面いっぱいに出し、
 * 白が引き始めてから show の間見せる → 舞台のカードの大きさ・位置まで縮める（shrink）→ 大きいカードを薄く消して舞台のカードに渡す（settle）。
 * 見せている間にタップすると、すぐ縮め始める
 */
const BIG = { show: 3500, shrink: 800, settle: 250 } as const;
/** カードの縦横比（幅 / 高さ。cards.css の aspect-ratio と同じ） */
const CARD_RATIO = 63 / 88;
/** 舞台のカードの幅（gacha.css の .gx-card と同じ。舞台ごと --s 倍になる） */
const CARD_W = 210;
/** 開け終わったときの 5 枚の並び（上に 3 枚、下に 2 枚。舞台の真ん中からの位置） */
const GRID = [
  [-118, -96],
  [0, -96],
  [118, -96],
  [-59, 76],
  [59, 76],
] as const;

type Phase = "idle" | "tear" | "rise" | "reveal" | "done";
/**
 * 当たりの流れ：lift 浮かせる → sq 回す → white 白が覆う → hold 白いまま → present 当たりの画面（★5 は画面いっぱいのカード）
 * →（★5 だけ）shrink 舞台のカードの大きさまで縮める → settle 舞台のカードに渡す → shown 見せ終わった
 */
type Hit = "" | "lift" | "sq" | "white" | "hold" | "present" | "shrink" | "settle" | "shown";

interface St {
  /** 何パック目か */
  at: number;
  phase: Phase;
  /** 切り取り線をどこまで切ったか（0〜1） */
  cut: number;
  /** 何枚目をめくっているか */
  cur: number;
  flipped: boolean;
  hit: Hit;
  /** 10 パックの結果を出しているか */
  summary: boolean;
}
const FIRST: St = { at: 0, phase: "idle", cut: 0, cur: 0, flipped: false, hit: "", summary: false };

/** 舞台の大きさ：画面の高さに合わせて、全体を拡大・縮小する */
function stageScale() {
  const h = frameSize().height;
  return Math.max(0.72, Math.min(1.12, (h - 220) / 600));
}

/**
 * パックを開ける（画面いっぱい）。パックの上を横になぞって裂き、1 枚ずつめくる。
 * 5 枚目が★4・★5 のときは、浮かせて回し、漏れた光が白く画面を覆ってから、当たりのカードを見せる。
 * 10 パックは 1 パックずつ同じ開け方で、スキップすると 10 パックの結果へ
 */
export function Opening({
  packs,
  demo = false,
  onClose,
  onAgain,
}: {
  packs: PulledCard[][];
  /** デモ（画面の中だけで開けた。カードは増えず、ジェムも減らない）。そうと分かるように印を出し続ける */
  demo?: boolean;
  onClose: () => void;
  /** 1 パックのとき「もう1パック」 */
  onAgain?: () => void;
}) {
  const [s, setS] = useState<St>(FIRST);
  const [scale, setScale] = useState(stageScale);
  const ref = useRef(s);
  ref.current = s;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cutIv = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const drag = useRef<{ x0: number; w: number; moved: boolean } | null>(null);

  const stopAll = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    clearInterval(cutIv.current);
    drag.current = null;
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const patch = (p: Partial<St>) => setS((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    const onResize = () => setScale(stageScale());
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      for (const t of timers.current) clearTimeout(t);
      clearInterval(cutIv.current);
    };
  }, []);

  const pack = packs[s.at] ?? [];
  const cards = pack
    .map((p) => ({ ...p, card: BY_ID.get(p.id) }))
    .filter((c): c is PulledCard & { card: CardDef } => !!c.card);
  const last = cards[4];
  const rarity = last?.card.rarity ?? 3;
  const rare = rarity >= 4;
  const big = rarity >= 5;
  const t = HIT[big ? 5 : 4];
  const many = packs.length > 1;

  const tear = () => {
    patch({ phase: "tear", cut: 1 });
    later(() => patch({ phase: "rise" }), 500);
    later(() => patch({ phase: "reveal" }), 1150);
  };
  const autoCut = () => {
    clearInterval(cutIv.current);
    cutIv.current = setInterval(() => {
      const c = Math.min(1, ref.current.cut + 16 / 380);
      if (c >= 1) {
        clearInterval(cutIv.current);
        tear();
      } else patch({ cut: c });
    }, 16);
  };
  const packDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (ref.current.phase !== "idle") return;
    drag.current = { x0: e.clientX, w: e.currentTarget.getBoundingClientRect().width, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 捕まえられなくても、なぞれる
    }
  };
  const packMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || ref.current.phase !== "idle") return;
    const dx = Math.abs(e.clientX - d.x0);
    if (dx > 6) d.moved = true;
    const cut = Math.min(1, dx / (d.w * 0.85));
    if (cut >= 1) {
      drag.current = null;
      tear();
    } else patch({ cut });
  };
  const packUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    // 押しただけ・7 割まで切ったときは、残りを自動で切る
    if (!d.moved || ref.current.cut >= 0.7) autoCut();
    else patch({ cut: 0 });
  };

  /** ★5：画面いっぱいのカードを、舞台のカードの大きさまで縮めて、一連の流れを終える */
  const shrinkBig = () => {
    if (ref.current.hit !== "present") return;
    patch({ hit: "shrink" });
    later(() => patch({ hit: "settle" }), BIG.shrink);
    later(() => patch({ hit: "shown" }), BIG.shrink + BIG.settle);
  };
  const tapCard = () => {
    const p = ref.current;
    if (p.phase !== "reveal" || (p.hit !== "" && p.hit !== "shown")) return;
    if (!p.flipped) {
      if (p.cur === 4 && rare) {
        patch({ hit: "lift" });
        later(() => patch({ hit: "sq" }), t.lift);
        later(() => patch({ hit: "white" }), t.lift + t.sq * t.whiteFrom);
        // 白に覆われたところでカードを表にしておく（見せるのは当たりの画面）
        later(() => patch({ hit: "hold", flipped: true }), t.lift + t.sq);
        later(() => patch({ hit: "present" }), t.lift + t.sq + t.hold);
        if (big) later(shrinkBig, t.lift + t.sq + t.hold + BIG.show);
      } else patch({ flipped: true });
    } else if (p.cur === 4) patch({ phase: "done" });
    else patch({ cur: p.cur + 1, flipped: false });
  };
  const closePresent = () => patch({ phase: "done", hit: "shown" });
  const skip = () => {
    stopAll();
    if (many) patch({ summary: true });
    else patch({ phase: "done", hit: rare ? "shown" : "" });
  };
  const nextPack = () => {
    stopAll();
    setS({ ...FIRST, at: ref.current.at + 1 });
  };

  if (s.summary) return <TenResult packs={packs} demo={demo} onClose={onClose} />;

  const { phase, hit } = s;
  const lifting = hit === "lift" || hit === "sq" || hit === "white" || hit === "hold";
  const squeezing = hit === "sq" || hit === "white";
  let hint = "";
  if (phase === "idle") hint = "パックの上を、横になぞって開ける";
  else if (phase === "reveal" && (hit === "" || hit === "shown"))
    hint = s.flipped ? "タップで次へ" : "タップでめくる";
  else if (phase === "done") hint = "5枚を手に入れました";
  const isLast = s.at >= packs.length - 1;

  const vars = {
    "--s": scale,
    "--sq": `${t.sq}ms`,
    "--win": `${Math.round(t.sq * (1 - t.whiteFrom))}ms`,
    "--wout": `${t.whiteOut}ms`,
    "--shrink": `${BIG.shrink}ms`,
    "--settle": `${BIG.settle}ms`,
  } as CSSProperties;
  const bigOn = big && (hit === "present" || hit === "shrink" || hit === "settle");
  // ★5 のカードを画面いっぱいに出す大きさ（縦横比はそのまま）と、縮めた先（舞台のカード）の倍率
  const frame = frameSize();
  const bigW = Math.min(frame.width, frame.height * CARD_RATIO);
  const toStage = (CARD_W * scale) / bigW;

  return (
    <div className="gx-open" style={vars} role="dialog" aria-modal="true" aria-label="パックを開ける">
      <div className={`gx-dim ${hit === "lift" || squeezing ? "on" : ""}`} />
      <header className="gx-open-head">
        <h1>
          {PACK_NAME}
          {demo && <small className="gx-demo-mark">デモ・カードもジェムも変わりません</small>}
        </h1>
        {many && (
          <span className="gx-count">
            {s.at + 1} / {packs.length}
          </span>
        )}
      </header>

      <div className="gx-stage">
        {(phase === "idle" || phase === "tear" || phase === "rise") && (
          <div className={`gx-pk-out ${phase === "rise" ? "sink" : ""}`}>
            <div className="gx-pk-float">
              {phase !== "idle" && <div className="gx-leak" />}
              <Pack capOff={phase !== "idle"} />
              {phase === "idle" && s.cut > 0 && (
                <div className="gx-cut" style={{ width: `${s.cut * 100}%` }} />
              )}
              {phase === "idle" && s.cut === 0 && (
                <div className="gx-guide" aria-hidden="true">
                  <i />
                </div>
              )}
              <button
                type="button"
                className="gx-pk-btn"
                aria-label="パックの上をなぞって開ける"
                onPointerDown={packDown}
                onPointerMove={packMove}
                onPointerUp={packUp}
                onPointerCancel={packUp}
              />
            </div>
          </div>
        )}
        {phase === "reveal" && s.cur === 4 && (squeezing || hit === "hold") && (
          <div className="gx-spill" aria-hidden="true">
            <span className="gx-spill-glow" />
            <span className="gx-spill-core" />
          </div>
        )}
        {cards.map((c, i) => {
          let tf: string;
          let z: number;
          let cls = "";
          const flip = phase === "done" || (phase === "reveal" && (i < s.cur || (i === s.cur && s.flipped)));
          if (phase === "idle" || phase === "tear") {
            tf = "translate(0px, 40px) scale(.86)";
            z = 1;
            cls = "hid";
          } else if (phase === "done") {
            const g = GRID[i] ?? [0, 0];
            tf = `translate(${g[0]}px, ${g[1]}px) scale(.5)`;
            z = 10 + i;
          } else if (phase === "reveal" && i < s.cur) {
            tf = `translate(${(i - 2) * 70}px, 245px) scale(.3)`;
            z = 10 + i;
          } else if (phase === "reveal" && i === s.cur) {
            const up = i === 4 && lifting;
            tf = up ? "translate(0px, -26px) scale(1.06)" : "translate(0px, 0px) scale(1)";
            z = 50;
          } else {
            const d = i - s.cur;
            tf = `translate(${d * 4}px, ${-d * 6}px) scale(1)`;
            z = 40 - d;
          }
          if (flip) cls += " flip";
          if (i === 4 && hit === "hold") cls += " now";
          if (i === 4 && (hit === "lift" || squeezing)) cls += " lift";
          if (i === 4 && squeezing) cls += " sq";
          if (i === 4 && rare && (hit === "settle" || hit === "shown" || (phase === "done" && hit !== "")))
            cls += " hit";
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが 2 枚出ることがあるので、パックの中の順番で見分ける
            <div key={`${s.at}-${i}`} className={`gx-card ${cls}`} style={{ transform: tf, zIndex: z }}>
              <div className="gx-in">
                <span className="gx-back" />
                <div className="gx-face">
                  <HoloCard card={c.card} compact />
                </div>
              </div>
              {phase === "done" && c.isNew && <span className="gx-new">NEW</span>}
            </div>
          );
        })}
        {phase === "reveal" && (
          <button type="button" className="gx-tap" aria-label="めくる" onClick={tapCard} />
        )}
      </div>

      {hint && (
        <p className="gx-open-hint">
          {hint}
          {phase === "reveal" && <b>{Math.min(s.cur + 1, 5)} / 5</b>}
        </p>
      )}
      {(phase === "idle" || phase === "reveal") && (
        <div className="gx-open-dock one">
          <button type="button" className="btn ghost gx-dk" onClick={skip}>
            スキップ
          </button>
        </div>
      )}
      {phase === "done" && (
        <div className="gx-open-dock">
          {!many ? (
            <>
              <button type="button" className="btn ghost gx-dk" onClick={onClose}>
                ガチャへ
              </button>
              <button type="button" className="btn" onClick={onAgain ?? onClose}>
                {demo ? "もう1パック（デモ）" : "もう1パック開ける"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost gx-dk" onClick={() => patch({ summary: true })}>
                まとめて見る
              </button>
              <button
                type="button"
                className="btn"
                onClick={isLast ? () => patch({ summary: true }) : nextPack}
              >
                {isLast ? "結果を見る" : `次のパック（${s.at + 2}/${packs.length}）`}
              </button>
            </>
          )}
        </div>
      )}

      {hit === "present" && !big && last && (
        <div className="gx-present">
          <button type="button" className="gx-pr-bg" aria-label="次へ" onClick={closePresent} />
          <div className="gx-pr-halo" aria-hidden="true" />
          {[50, 120, 210, 280, 340, 170].map((x, i) => (
            <i
              key={x}
              className="gx-pr-spark"
              aria-hidden="true"
              style={{ left: `${(x / 390) * 100}%`, animationDelay: `${[0, 1.6, 0.8, 2.4, 3.3, 4.1][i]}s` }}
            />
          ))}
          {last.isNew && <span className="gx-pr-new">NEW</span>}
          <div className="gx-pr-card">
            <HoloCard card={last.card} interactive />
          </div>
          <div className="gx-pr-foot">
            <p>タップで次へ</p>
          </div>
        </div>
      )}
      {bigOn && last && (
        <div className={`gx-big ${hit}`}>
          <div className="gx-big-bg" aria-hidden="true">
            {[50, 120, 210, 280, 340, 170].map((x, i) => (
              <i
                key={x}
                className="gx-pr-spark"
                style={{ left: `${(x / 390) * 100}%`, animationDelay: `${[0, 1.6, 0.8, 2.4, 3.3, 4.1][i]}s` }}
              />
            ))}
          </div>
          {last.isNew && (
            <span
              className="gx-pr-new gx-big-new"
              style={{ top: Math.max(12, (frame.height - bigW / CARD_RATIO) / 2 - 42) }}
            >
              NEW
            </span>
          )}
          <div
            className="gx-big-card"
            style={{
              width: bigW,
              // 舞台のカードは、真ん中から 10px 上（.gx-stage の translateY）
              transform:
                hit === "present"
                  ? "translate(-50%, -50%)"
                  : `translate(-50%, calc(-50% - 10px)) scale(${toStage})`,
            }}
          >
            <div className="gx-big-in">
              <HoloCard card={last.card} interactive />
            </div>
          </div>
          <button type="button" className="gx-big-tap" aria-label="次へ" onClick={shrinkBig} />
        </div>
      )}
      <div
        className={`gx-white ${hit === "white" || hit === "hold" ? "in" : hit === "present" ? "out" : ""}`}
      />
    </div>
  );
}

/** 出たカードを小さく 1 枚（NEW の札つき） */
function Thumb({ c, delay }: { c: PulledCard & { card: CardDef }; delay?: number }) {
  return (
    <span className="gx-th" style={delay ? { animationDelay: `${delay}s` } : undefined}>
      <HoloCard card={c.card} compact />
      {c.isNew && <span className="gx-tnew">NEW</span>}
    </span>
  );
}

/** 10 パックの結果：★5・★4 を大きく、その下にパックごとの 5 枚 */
function TenResult({ packs, demo, onClose }: { packs: PulledCard[][]; demo: boolean; onClose: () => void }) {
  const rows = packs.map((p) =>
    p
      .map((x) => ({ ...x, card: BY_ID.get(x.id) }))
      .filter((x): x is PulledCard & { card: CardDef } => !!x.card),
  );
  const all = rows.flat();
  const of = (r: number) => all.filter((c) => c.card.rarity === r);
  const h5 = of(5);
  const h4 = of(4);
  const news = all.filter((c) => c.isNew).length;
  return (
    <div className="gx-open" role="dialog" aria-modal="true" aria-label={`${packs.length}パックの結果`}>
      <div className="gx-sum">
        <header className="gx-sum-head">
          <h1>
            {packs.length}パックの結果
            <small>
              {demo
                ? `${all.length}枚・デモ（カードもジェムも変わりません）`
                : `${all.length}枚・NEW ${news}枚`}
            </small>
          </h1>
        </header>
        <div className="gx-sum-count">
          {[5, 4, 3].map((r) => (
            <div key={r} className="g2">
              <span className="gx-stars">{"★".repeat(r)}</span>
              <b>
                {of(r).length}
                <small>枚</small>
              </b>
            </div>
          ))}
        </div>
        {h5.length > 0 && (
          <>
            <div className="sec">
              <h2>
                <span className="gx-stars">★★★★★</span>
              </h2>
            </div>
            <div className="gx-hits5">
              {h5.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが何枚も出ることがあるので、順番で見分ける
                <Thumb key={i} c={c} delay={i * 0.08} />
              ))}
            </div>
          </>
        )}
        {h4.length > 0 && (
          <>
            <div className="sec">
              <h2>
                <span className="gx-stars">★★★★</span>
              </h2>
            </div>
            <div className="gx-hits4">
              {h4.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが何枚も出ることがあるので、順番で見分ける
                <Thumb key={i} c={c} delay={0.2 + i * 0.05} />
              ))}
            </div>
          </>
        )}
        <div className="sec">
          <h2>パックごと</h2>
          <small>5枚目が★3以上の枠</small>
        </div>
        <div className="gx-packs">
          {rows.map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: パックの順番そのものが見分け
            <div key={i} className="gx-prow g2">
              <span className="gx-pno">{i + 1}</span>
              {r.map((c, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが 2 枚出ることがあるので、順番で見分ける
                <Thumb key={j} c={c} />
              ))}
            </div>
          ))}
        </div>
        <div className="gx-sum-dock">
          <button type="button" className="btn lg" onClick={onClose}>
            ガチャへ
          </button>
        </div>
      </div>
    </div>
  );
}
