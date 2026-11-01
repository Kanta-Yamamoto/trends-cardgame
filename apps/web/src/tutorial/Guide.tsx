import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { frameRect } from "../frame";
import { Rich } from "./Rich";

/** ちびミナモの表情（apps/web/public/assets/tutorial/minamo-*.webp。元の絵は assets/original/minamo-chibi-*.webp） */
export type Face = "open" | "point" | "cheer" | "think" | "shy" | "surprise";
export const FACES: readonly Face[] = ["open", "point", "cheer", "think", "shy", "surprise"];
export const faceUrl = (f: Face) => `/assets/tutorial/minamo-${f}.webp`;

/** 表情の絵を先に読んでおく（切り替えたときに一瞬消えないように） */
export function preloadFaces() {
  for (const f of FACES) {
    const img = new Image();
    img.src = faceUrl(f);
  }
}

export interface GuideProps {
  face: Face;
  text: string;
  /** 光らせて、押せるようにする場所（CSS のセレクタ）。ここ以外は押せない */
  targets?: readonly string[];
  /** 光らせるだけで、押せない場所 */
  shows?: readonly string[];
  /** 光らせずに押せるようにする場所（選んだカードを選び直す・小窓の「やめる」など） */
  allow?: readonly string[];
  /** 吹き出しのボタン（説明だけの場面で次へ進む） */
  next?: { label: string; onClick: () => void };
  /** 案内を隠す（演出の間）。そのあいだも、決めた場所しか押せない */
  hidden?: boolean;
  /** 「スキップ」を押したとき（無ければボタンを出さない） */
  onSkip?: () => void;
  /** 光らせた場所が押されたとき（押した先の動きはそのまま進む） */
  onTarget?: () => void;
  /** 案内をふだん置く場所：この要素のすぐ上（対戦では手札の上）。光らせた場所と重なるときは、画面の上か下へ */
  dock?: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 光らせる場所の角の丸み */
  r: number;
}

/** 光らせる場所のまわりの余白 */
const PAD = 6;
/** 画面の端からの間・上に置くときの上の空き（戻る・スキップのボタンの下） */
const EDGE = 10;
const TOP_GAP = 56;

/** 案内（丸い枠と吹き出し）の縦の位置。side は吹き出しのしっぽを上下どちらに付けるか */
interface Place {
  y: number;
  side: "top" | "bottom";
}

const boxesOf = (sels: readonly string[]): Box[] =>
  sels.flatMap((s) =>
    [...document.querySelectorAll<HTMLElement>(s)].flatMap((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return [];
      const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8;
      return [
        { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2, r: radius + PAD },
      ];
    }),
  );
/**
 * 押してほしい場所が、画面の中にあって、ほかの要素（下に固定した帯など）に隠れていないか。
 * 上・真ん中・下の 3 か所で、いちばん手前にある要素がその場所自身（か中身）かを確かめる。案内そのもの（.tut-ui）は数えない
 */
function inSight(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  if (r.top < 0 || r.bottom > vh) return false;
  const x = r.left + r.width / 2;
  return [0.2, 0.5, 0.8].every((k) => {
    const hit = document.elementFromPoint(x, r.top + r.height * k);
    return !hit || el.contains(hit) || !!hit.closest(".tut-ui");
  });
}

const same = (a: Box[], b: Box[]) =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i] as Box;
    return (
      Math.abs(x.x - y.x) < 0.5 &&
      Math.abs(x.y - y.y) < 0.5 &&
      Math.abs(x.w - y.w) < 0.5 &&
      Math.abs(x.h - y.h) < 0.5
    );
  });

/**
 * ちびミナモの案内（10月27日。オーナー：「左下か右下など都合のいいところに丸の枠を作ってそのなかにちびキャラの胸から上くらいを写して、
 * ボタン操作もシャドウで特定のしか押せないような誘導をして」）。
 * 画面を暗くし、押してほしい場所だけを丸く抜いて光らせる。押せるのは光らせた場所（と allow）と、案内そのものだけ。
 * 丸い枠と吹き出しは画面の左に、ふだんの場所（dock の上）に近く、光らせた場所と重ならない高さで出す
 */
export function Guide({
  face,
  text,
  targets = [],
  shows = [],
  allow = [],
  next,
  hidden,
  onSkip,
  onTarget,
  dock,
}: GuideProps) {
  const [holes, setHoles] = useState<Box[]>([]);
  const [frame, setFrame] = useState(() => frameRect());
  const [place, setPlace] = useState<Place | null>(null);
  const [asking, setAsking] = useState(false);
  const holesRef = useRef<Box[]>([]);
  const guideRef = useRef<HTMLDivElement>(null);
  const onTargetRef = useRef(onTarget);
  onTargetRef.current = onTarget;
  const key = [...targets, "|", ...shows].join(",");

  // 光らせる場所を毎フレーム測る（カードが動いても輪が付いていく）。変わったときだけ描き直す
  // biome-ignore lint/correctness/useExhaustiveDependencies: セレクタの並び（key）が変わったときだけ測り直す
  useLayoutEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = hidden ? [] : boxesOf([...targets, ...shows]);
      if (!same(next, holesRef.current)) {
        holesRef.current = next;
        setHoles(next);
      }
      const f = frameRect();
      setFrame((p) => (p.left === f.left && p.width === f.width && p.height === f.height ? p : f));
      const h = guideRef.current?.offsetHeight ?? 120;
      const d = dock ? document.querySelector(dock)?.getBoundingClientRect() : undefined;
      // ふだんの場所に近い順に、光らせた場所と重ならない高さを探す（見つからなければ、ふだんの場所）
      const lo = f.top + TOP_GAP;
      const hi = f.top + f.height - h - 20;
      const want = Math.max(lo, Math.min(hi, d ? d.top - h - 6 : hi));
      const free = (y: number) => next.every((b) => y + h + 4 < b.y || y - 4 > b.y + b.h);
      let y = want;
      for (let k = 0; k <= f.height; k += 8) {
        const up = want - k;
        const down = want + k;
        if (down <= hi && free(down)) {
          y = down;
          break;
        }
        if (up >= lo && free(up)) {
          y = up;
          break;
        }
      }
      const pick: Place = { y, side: y + h / 2 < f.top + f.height * 0.4 ? "top" : "bottom" };
      setPlace((p) => (p && p.side === pick.side && Math.abs(p.y - pick.y) < 1 ? p : pick));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [key, hidden, dock]);

  // 決めた場所のほかは押せないようにする（押し始め・クリックを、届く前に止める）。スクロールは止めない
  // biome-ignore lint/correctness/useExhaustiveDependencies: セレクタの並びが変わったときだけ付け直す
  useEffect(() => {
    const ok = [".tut-ui", ...targets, ...allow];
    const guard = (e: Event) => {
      const t = e.target;
      if (t instanceof Element && ok.some((s) => t.closest(s))) {
        if (e.type === "click" && targets.some((s) => t.closest(s)))
          setTimeout(() => onTargetRef.current?.());
        return;
      }
      e.stopPropagation();
      if (e.type !== "pointerdown") e.preventDefault();
    };
    const types = ["pointerdown", "mousedown", "click", "dblclick", "contextmenu"] as const;
    for (const ty of types) window.addEventListener(ty, guard, true);
    return () => {
      for (const ty of types) window.removeEventListener(ty, guard, true);
    };
  }, [targets.join(","), allow.join(",")]);

  // 光らせた場所が画面の外にあるか、下に固定した帯（ガチャの「1パック」「10パック」の帯など）に隠れていれば、
  // 見えるところまで動かす（11月1日。オーナー：ガチャの案内で、デモの「1パック」が下の帯の裏に隠れ、輪が帯の上に出ていた）。
  // 絵や書体が読み込まれて並びがずれることがあるので、少し後にもう一度確かめる
  useEffect(() => {
    if (hidden || !targets[0]) return;
    const sel = targets[0];
    const check = () => {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && !inSight(el)) el.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    check();
    const timers = [300, 900].map((ms) => setTimeout(check, ms));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [targets[0], hidden]);

  // 案内が次へ進んだら、終わるかの問いは閉じる
  // biome-ignore lint/correctness/useExhaustiveDependencies: 文が変わったときだけ閉じる
  useEffect(() => setAsking(false), [text]);

  if (hidden) return null;
  const top = place?.side === "top";
  // 位置が決まるまで（最初の 1 回の測りの前）は見せない
  const style = {
    left: frame.left + EDGE,
    top: place?.y ?? frame.top,
    visibility: place ? undefined : "hidden",
  } as const;
  const width = frame.width - EDGE * 2;
  const dark = holes.length > 0 || !!next;
  const hasTarget = targets.length > 0 && holes.length > 0;

  return (
    <div className="vp-layer tut-layer">
      {dark && (
        <svg className="tut-dim" width="100%" height="100%" aria-hidden="true">
          <defs>
            <mask id="tut-holes">
              <rect width="100%" height="100%" fill="#fff" />
              {holes.map((b) => (
                <rect key={`${b.x},${b.y}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} fill="#000" />
              ))}
            </mask>
          </defs>
          <rect
            x={frame.left}
            y={frame.top}
            width={frame.width}
            height={frame.height}
            fill="currentColor"
            mask="url(#tut-holes)"
          />
        </svg>
      )}
      {holes.map((b) => (
        <span
          key={`ring-${b.x},${b.y}`}
          className={`tut-ring ${hasTarget ? "tap" : "look"}`}
          aria-hidden="true"
          style={{ left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: b.r }}
        />
      ))}
      <div
        ref={guideRef}
        className={`tut-ui tut-guide ${top ? "at-top" : "at-bottom"}`}
        style={{ ...style, width }}
      >
        <span className="tut-face" aria-hidden="true">
          <img key={face} src={faceUrl(face)} alt="" draggable={false} />
        </span>
        <div className="tut-bubble" role="status" aria-live="polite">
          <b className="tut-who">ミナモ</b>
          {asking ? (
            <>
              <p>チュートリアルを終わりにする？ ホームのメニューから、いつでもまた見られるよ。</p>
              <div className="tut-acts">
                <button type="button" className="btn ghost small" onClick={() => setAsking(false)}>
                  続ける
                </button>
                <button type="button" className="btn small" onClick={onSkip}>
                  終わる
                </button>
              </div>
            </>
          ) : (
            <>
              <p key={text}>
                <Rich text={text} />
              </p>
              {next && (
                <div className="tut-acts">
                  <button type="button" className="btn small" onClick={next.onClick}>
                    {next.label}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {onSkip && !asking && (
        <button
          type="button"
          className="tut-ui tut-skip btn ghost small"
          style={{ left: frame.left + frame.width - EDGE, top: frame.top + EDGE }}
          onClick={() => setAsking(true)}
        >
          スキップ
        </button>
      )}
    </div>
  );
}
