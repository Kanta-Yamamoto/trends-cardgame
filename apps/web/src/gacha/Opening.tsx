import { CARDS, type CardDef } from "@trends/cards";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { HoloCard } from "../cards/HoloCard";
import { frameSize } from "../frame";
import { PACK_NAME, Pack } from "./Pack";
import { grab, letGo, newTear, PACK_W, pull, step, still, type TearEvent } from "./tear";

/** 開けたパックの 1 枚（isNew：このガチャの前は持っていなかった） */
export interface PulledCard {
  id: string;
  isNew: boolean;
}

const BY_ID = new Map(CARDS.map((c) => [c.id, c]));

/**
 * 当たり（5 枚目が★4・★5）の時間（ミリ秒）。10月27日にオーナーとモックで決めた形：
 * 宙に浮かせ（lift）→ 真ん中を軸に回す絞り（sq。全体の 26% で 30% まで加速して回り、残りでゆっくり）。表は見せず、まわりから後ろの光が漏れる
 * → whiteFrom の割合から白が画面を覆う → 白いまま（hold）→ 白が引いて（whiteOut）当たりのカードを見せる画面。★5 は長く、★4 は短く
 */
const HIT = {
  4: { lift: 350, sq: 1500, whiteFrom: 0.7, hold: 150, whiteOut: 700 },
  5: { lift: 450, sq: 2300, whiteFrom: 0.72, hold: 320, whiteOut: 1000 },
} as const;
/** 開け終わったときの 5 枚の並び（上に 3 枚、下に 2 枚。舞台の真ん中からの位置） */
const GRID = [
  [-118, -96],
  [0, -96],
  [118, -96],
  [-59, 76],
  [59, 76],
] as const;

type Phase = "idle" | "tear" | "rise" | "reveal" | "done";
/** 当たりの流れ：lift 浮かせる → sq 回す → white 白が覆う → hold 白いまま → present 当たりの画面 → shown 見せ終わった */
type Hit = "" | "lift" | "sq" | "white" | "hold" | "present" | "shown";

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
}
const FIRST: St = { at: 0, phase: "idle", cur: 0, flipped: false, hit: "", summary: false };

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
  const drag = useRef<{ x0: number; left: number; width: number; moved: boolean } | null>(null);

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
  const t = HIT[rarity >= 5 ? 5 : 4];
  const many = packs.length > 1;

  const tear = () => {
    patch({ phase: "tear" });
    later(() => patch({ phase: "rise" }), 500);
    later(() => patch({ phase: "reveal" }), 1150);
  };
  /** 手ごたえを 1 フレームすすめ、パックの傾き・上の端・裂け目を CSS 変数に書く。止まったら回すのをやめる */
  const frame = (prev: number) => (now: number) => {
    const t = tr.current;
    for (const e of step(t, Math.min(0.05, Math.max(0, (now - prev) / 1000)))) {
      buzz(e);
      if (e === "done") tear();
    }
    const el = floatRef.current;
    if (el) {
      el.style.setProperty("--tip", `${t.tip.toFixed(1)}px`);
      el.style.setProperty("--rot", `${t.rot.x.toFixed(2)}deg`);
      el.style.setProperty("--px", `${(t.rot.x * 1.4).toFixed(1)}px`);
      el.style.setProperty("--capr", `${t.capR.x.toFixed(2)}deg`);
      el.style.setProperty("--capl", `${t.capL.x.toFixed(2)}deg`);
      el.classList.toggle("grip", t.hold);
      el.classList.toggle("torn", t.tip > 0);
    }
    raf.current = el && !still(t) ? requestAnimationFrame(frame(now)) : 0;
  };
  const run = () => {
    if (!raf.current) raf.current = requestAnimationFrame(frame(performance.now()));
  };
  /** 指の位置を、パックの中の x（幅 PACK_W）にする */
  const packX = (clientX: number) => {
    const d = drag.current;
    return d ? ((clientX - d.left) / d.width) * PACK_W : 0;
  };
  const packDown = (e: PointerEvent<HTMLButtonElement>) => {
    const el = floatRef.current;
    if (ref.current.phase !== "idle" || !el) return;
    const r = el.getBoundingClientRect();
    drag.current = { x0: e.clientX, left: r.left, width: r.width || PACK_W, moved: false };
    grab(tr.current, packX(e.clientX));
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
    pull(tr.current, packX(e.clientX));
    run();
  };
  const packUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    letGo(tr.current, !d.moved);
    run();
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
  } as CSSProperties;

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
            <div className="gx-pk-float" ref={floatRef}>
              <div className="gx-pk-pull">
                {phase !== "idle" && <div className="gx-leak" />}
                <Pack capOff={phase !== "idle"} />
                {phase === "idle" && (
                  <>
                    <div className="gx-cut" />
                    <div className="gx-guide" aria-hidden="true">
                      <i />
                    </div>
                  </>
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
          if (i === 4 && rare && (hit === "shown" || (phase === "done" && hit !== ""))) cls += " hit";
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

      {hit === "present" && last && (
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
