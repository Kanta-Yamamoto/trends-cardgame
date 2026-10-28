import { CARDS, type CardDef } from "@trends/cards";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { HoloCard } from "../cards/HoloCard";
import { frameSize } from "../frame";
import { useMusicScene } from "../sound/music";
import { PACK_NAME, Pack } from "./Pack";
import { grab, letGo, newTear, PACK_H, PACK_W, pull, shape, step, still, type TearEvent } from "./tear";

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
 * ★5 の当たりのカード（10月27日。オーナー：「画面全体を枠とみなして、絵と効果を全体的に出したい」「カードの枠を成して出してあげたい」
 * 「何秒か表示したあとに元のカードの大きさまで縮小して一連の動作を終えて」）。白が引くと、画面そのものをカードの枠にして出す
 * （カード面を画面の形いっぱいに描く。絵は画面を覆い、名前・効果の板は下）。白が引き始めてから show の間見せる
 * → 枠ごと舞台のカードの大きさ・位置まで縮める（shrink。形もカードの比に戻る）→ 大きいカードを薄く消して舞台のカードに渡す（settle）。
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

/** ★5 を引いたあとの白い舞台で、きらめく光の粒（画面の中の位置 %・きらめき始めるまでの秒） */
const MOTES = [
  [12, 18, 0.2],
  [30, 11, 1.9],
  [71, 14, 0.9],
  [88, 24, 2.6],
  [8, 38, 1.4],
  [93, 43, 0.4],
  [17, 57, 2.2],
  [84, 61, 1.1],
  [6, 74, 3.0],
  [27, 84, 0.7],
  [62, 88, 2.4],
  [91, 79, 1.6],
  [48, 7, 3.3],
  [79, 34, 2.9],
  [21, 31, 3.6],
  [69, 75, 0],
] as const;

/**
 * 裂けきってから（ミリ秒）：tear 切れ端が落ちていく → out 開いた口から 5 枚が出てくる
 * → rise カードを残してパックが下へ抜ける（2 割スッと下がり、そこから一定の速さで。gacha.css の gx-pk-pull）
 * → reveal パックがカードの下から外れたら、カードが真ん中に来て、めくれる
 */
const OPEN_MS = { out: 320, rise: 320 + 600, reveal: 320 + 600 + 900, gone: 320 + 600 + 1050 } as const;

type Phase = "idle" | "tear" | "out" | "rise" | "reveal" | "done";
/**
 * 当たりの流れ：lift 浮かせる → sq 回す → white 白が覆う → hold 白いまま → present 当たりの画面（★5 は画面いっぱいのカード）
 * →（★5 だけ）shrink 舞台のカードの大きさまで縮める → settle 舞台のカードに渡す → shown 見せ終わった
 */
type Hit = "" | "lift" | "sq" | "white" | "hold" | "present" | "shrink" | "settle" | "shown";

interface St {
  /** 何パック目か */
  at: number;
  phase: Phase;
  /** 何枚目をめくっているか */
  cur: number;
  flipped: boolean;
  hit: Hit;
  /** 10 パックの結果を出しているか */
  summary: boolean;
  /** 抜いたパックが下へ消えきったか（めくり始めてからも、消えきるまでは描く） */
  packGone: boolean;
}
const FIRST: St = { at: 0, phase: "idle", cur: 0, flipped: false, hit: "", summary: false, packGone: false };

/** 裂くときの手ごたえの震え（Android の Chrome だけ。iPhone の Safari は震わせられない） */
const BUZZ: Record<TearEvent, number> = { notch: 14, tick: 6, done: 28 };
function buzz(e: TearEvent) {
  try {
    navigator.vibrate?.(BUZZ[e]);
  } catch {
    // 震わせられなくても、裂ける
  }
}

/** 舞台の大きさ：画面の高さに合わせて、全体を拡大・縮小する */
function stageScale() {
  const h = frameSize().height;
  return Math.max(0.72, Math.min(1.12, (h - 220) / 600));
}

/**
 * パックを開ける（画面いっぱい）。パックの上半分を横になぞって裂き（手ごたえは tear.ts）、1 枚ずつめくる。
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
  /** 裂く手ごたえ。指の動きのたびに React を描き直さず、毎フレーム CSS 変数だけを書く（カード 5 枚を描き直さない） */
  const tr = useRef(newTear());
  const floatRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const drag = useRef<{ x0: number; box: DOMRect; moved: boolean } | null>(null);

  const stopTear = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    drag.current = null;
  };
  const stopAll = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    stopTear();
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
      cancelAnimationFrame(raf.current);
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
  // ★5 の絵は、当たりの画面で画面いっぱいに出す前に、読み込んで展開しておく（出た瞬間に絵が遅れて出て、ちらつかないように）。
  // 絵の場所はカード面ごとに CSS にもあるので、舞台に置いた 5 枚目のカード面から集める
  const root = useRef<HTMLDivElement>(null);
  const warmed = useRef<HTMLImageElement[]>([]);
  const warmKey = big && s.phase === "reveal" ? `${s.at}-${last?.id}` : "";
  useEffect(() => {
    if (!warmKey) return;
    const el = root.current?.querySelectorAll<HTMLElement>(".gx-card")[4];
    if (!el) return;
    const urls = new Set<string>();
    for (const n of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
      const cs = getComputedStyle(n);
      for (const v of [cs.backgroundImage, cs.maskImage, cs.getPropertyValue("-webkit-mask-image")])
        for (const m of v.matchAll(/url\("?([^")]+)"?\)/g))
          if (m[1] && !m[1].startsWith("data:")) urls.add(m[1]);
    }
    warmed.current = [...urls].map((u) => {
      const img = new Image();
      img.src = u;
      img.decode().catch(() => {});
      return img;
    });
  }, [warmKey]);
  // 開けている間はガチャの曲の代わりに小さめの曲を流し、最後の結果（1 パックは 5 枚が並んだところ、10 パックは結果の一覧）でガチャの曲をゆっくり戻す
  useMusicScene(s.summary || (!many && s.phase === "done") ? null : "gachaPull");

  const tear = () => {
    patch({ phase: "tear" });
    later(() => patch({ phase: "out" }), OPEN_MS.out);
    later(() => patch({ phase: "rise" }), OPEN_MS.rise);
    later(() => patch({ phase: "reveal" }), OPEN_MS.reveal);
    later(() => patch({ packGone: true }), OPEN_MS.gone);
  };
  /** 手ごたえを 1 フレームすすめ、パックの傾き・切り取り線・上の端・口の開きを CSS 変数に書く。止まったら回すのをやめる */
  const frame = (prev: number) => (now: number) => {
    const t = tr.current;
    for (const e of step(t, Math.min(0.05, Math.max(0, (now - prev) / 1000)))) {
      buzz(e);
      if (e === "done") tear();
    }
    const el = floatRef.current;
    if (el) {
      const f = shape(t);
      const px = (k: string, v: number) => el.style.setProperty(k, `${v.toFixed(2)}px`);
      const deg = (k: string, v: number) => el.style.setProperty(k, `${v.toFixed(2)}deg`);
      px("--tip", f.tip);
      px("--yl", f.yl);
      px("--yt", f.yt);
      px("--yr", f.yr);
      deg("--ang", f.ang);
      px("--hx", f.hx);
      px("--mouth", f.mouth);
      px("--mouth-end", f.mouthEnd);
      px("--band", f.band);
      deg("--rot", f.rot);
      px("--px", f.rot * 1.4);
      deg("--capr", f.capR);
      deg("--capl", f.capL);
      el.classList.toggle("grip", t.hold);
      el.classList.toggle("torn", t.tip > 0);
    }
    raf.current = el && !still(t) ? requestAnimationFrame(frame(now)) : 0;
  };
  const run = () => {
    if (!raf.current) raf.current = requestAnimationFrame(frame(performance.now()));
  };
  /** 指の位置を、パックの中の位置（幅 PACK_W・高さ PACK_H）にする */
  const packAt = (e: PointerEvent<HTMLButtonElement>): [number, number] => {
    const b = drag.current?.box;
    if (!b?.width || !b.height) return [0, 0];
    return [((e.clientX - b.left) / b.width) * PACK_W, ((e.clientY - b.top) / b.height) * PACK_H];
  };
  const packDown = (e: PointerEvent<HTMLButtonElement>) => {
    const el = floatRef.current;
    if (ref.current.phase !== "idle" || !el) return;
    drag.current = { x0: e.clientX, box: el.getBoundingClientRect(), moved: false };
    grab(tr.current, ...packAt(e));
    run();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 捕まえられなくても、なぞれる
    }
  };
  const packMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || ref.current.phase !== "idle") return;
    if (Math.abs(e.clientX - d.x0) > 6) d.moved = true;
    pull(tr.current, ...packAt(e));
    run();
  };
  const packUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    letGo(tr.current, !d.moved);
    run();
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
    tr.current = newTear();
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
  // ★5 を引いたら、白が画面を覆ったところから舞台の地を白にし、5 枚の並びまでそのまま（スキップしたときも）
  const lux = big && (hit === "hold" || bigOn || hit === "shown");
  // 白い舞台の霞と光の粒は、大きいカードを舞台に戻してから（大きいカードの後ろで動かすと、見えないのに重くなる）
  const luxFx = big && (hit === "settle" || hit === "shown");
  // ★5 の画面いっぱいのカードを縮めた先：舞台のカード（真ん中から 10px 上。.gx-stage の translateY）
  const toW = CARD_W * scale;
  const toH = toW / CARD_RATIO;

  return (
    <div
      ref={root}
      className={`gx-open ${lux ? "lux" : ""}`}
      style={vars}
      role="dialog"
      aria-modal="true"
      aria-label="パックを開ける"
    >
      <div className="gx-lux" aria-hidden="true">
        {luxFx && (
          <>
            <span className="gx-lux-haze" />
            <span className="gx-lux-motes">
              {MOTES.map(([x, y, d]) => (
                <i key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
              ))}
            </span>
          </>
        )}
      </div>
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
        {(phase === "idle" ||
          phase === "tear" ||
          phase === "out" ||
          phase === "rise" ||
          (phase === "reveal" && !s.packGone)) && (
          // めくり始めても、抜いているパックはそのまま（rise）下へ消えきるまで描く
          <div className={`gx-pk-out ${phase === "reveal" ? "rise" : phase}`}>
            <div className="gx-pk-float" ref={floatRef}>
              <div className="gx-pk-pull">
                {phase !== "idle" && <div className="gx-leak" />}
                <Pack capOff={phase !== "idle"} />
                {phase === "idle" && (
                  <div className="gx-guide" aria-hidden="true">
                    <i />
                  </div>
                )}
              </div>
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
            // パックの中（パックの後ろに隠れている）
            tf = "translate(0px, 30px) scale(.86)";
            z = 1;
            cls = "hid";
          } else if (phase === "out" || phase === "rise") {
            // 開いた口から上へ出てくる。5 枚はぴったり重ねて 1 枚に見せ、下の方はまだパックの中（パックが前に重なって隠す）。
            // パックが下へ抜けるまでこのまま。抜けたあと（reveal）で束にずらす
            tf = "translate(0px, -66px) scale(.86)";
            z = i === 0 ? 50 : 40 - i;
            cls = "out";
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
          <div
            className="gx-big-card"
            style={
              hit === "present"
                ? undefined
                : {
                    left: `calc(50% - ${toW / 2}px)`,
                    top: `calc(50% - 10px - ${toH / 2}px)`,
                    width: toW,
                    height: toH,
                  }
            }
          >
            <div className="gx-big-in">
              {/* 平らに出すので、触っていないときの揺れ（毎フレーム、光の位置を書き換えて描き直す）は止める */}
              <HoloCard card={last.card} interactive idle={false} fill />
            </div>
          </div>
          {last.isNew && <span className="gx-pr-new gx-big-new">NEW</span>}
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
