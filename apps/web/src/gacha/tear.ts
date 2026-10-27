/**
 * パックを裂く手ごたえ（10月27日）。指の位置で切り取り線の裂け目を進め、パックの傾き・上の端の浮きをばねで動かす。
 * 画面に依存しない（数はパックの中の座標。幅 200）。
 * - 切り口：指で引いても、NOTCH まではパックの端だけが引っぱられて浮く。そこを越えると破れて裂け始める
 * - 裂いている間、裂け目は指より GRIP だけ後ろにいて、速く動かすとさらに遅れる（LAG）。
 *   遅れた分だけパックが指の側へ傾き、裂けた上の端がめくれる（ゆっくり引いても、止めて押さえていても重さが残る）
 * - 裂けきるのは、指がパックの右端に来たとき（指をどこに置いても、置いた所から右端までで裂けきる）
 * - 途中で指をはなすと、裂けた所まではそのまま残る（7 割を越えていれば、残りを自動で切る）
 * - 切り取り線は、なぞり始めた高さ（左端）から指の高さへ引いたまっすぐな線。斜めになぞれば斜めに裂ける（shape）
 */
export const PACK_W = 200;
export const PACK_H = 300;
/** 切り口が破れるまでに引っぱる長さ */
const NOTCH = 22;
/** 裂くのに要る力：裂いている間、指はいつもこれだけ裂け目の先を引っぱっている */
const GRIP = 10;
/** 裂け目が指に追いつくまでの時間（秒）。大きいほど重い */
const LAG = 0.07;
/** 自動で切るとき、端から端までの時間（秒） */
const AUTO = 0.38;
/** 置いた所から右端までが短すぎるとき、これだけは動かして裂けきる（幅に対して） */
const MIN_RUN = 0.45;
/** 切り取り線を引ける高さ（上の圧着の下から、パックの上の方まで） */
const Y_MIN = 18;
const Y_MAX = 120;
/** 線の傾きの上限（約 19 度） */
const SLOPE = 0.35;
/** 線の傾きが指の高さに追いつくまでの時間（秒） */
const SLOPE_LAG = 0.08;
/** 裂けきったあと、上が飛んでいく間に口が小さくなるまでの時間（秒）と、残る口の開き */
const MOUTH_CLOSE = 0.3;
const MOUTH_OPEN = 5;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

interface Spring {
  x: number;
  v: number;
}

export interface Tear {
  /** 裂け目の先（0〜PACK_W） */
  tip: number;
  /** 指が引っぱっている先 */
  aim: number;
  /** 切り口が破れたか */
  notched: boolean;
  /** 指で押さえているか */
  hold: boolean;
  /** 残りを自動で切っているか */
  auto: boolean;
  /** 裂けきったか */
  done: boolean;
  /** 切り取り線：左端の高さと傾き（右へ 1 進むと下へ slope） */
  y0: number;
  slope: number;
  /** 今の指の位置 */
  fx: number;
  fy: number;
  /** 指を置いたときの、指の位置・裂け目・指の動きに対する裂け目の進み */
  fx0: number;
  tip0: number;
  gain: number;
  /** パックの傾き（度） */
  rot: Spring;
  /** まだ付いている側の上の端が、右端を軸に浮く角度（度。破れる前に引っぱられる） */
  capR: Spring;
  /** 裂けた上の端が、裂け目を軸にめくれる角度（度） */
  capL: Spring;
  /** 最後に震わせた区切り（幅の 1/10 ごと） */
  tick: number;
  /** 裂けきってからの時間（秒）と、そのときの口の開き */
  since: number;
  openAtDone: number;
}

export type TearEvent = "notch" | "tick" | "done";

export function newTear(): Tear {
  return {
    tip: 0,
    aim: 0,
    notched: false,
    hold: false,
    auto: false,
    done: false,
    y0: 38,
    slope: 0,
    fx: 0,
    fy: 38,
    fx0: 0,
    tip0: 0,
    gain: 1,
    rot: { x: 0, v: 0 },
    capR: { x: 0, v: 0 },
    capL: { x: 0, v: 0 },
    tick: 0,
    since: 0,
    openAtDone: 0,
  };
}

/** 指を置いた（fx・fy はパックの中の位置）。まだ裂けていなければ、置いた高さから裂く */
export function grab(t: Tear, fx: number, fy: number) {
  if (t.done) return;
  t.hold = true;
  t.auto = false;
  if (t.tip === 0 && !t.notched) {
    t.y0 = clamp(fy, Y_MIN, Y_MAX);
    t.slope = 0;
  }
  t.fx = fx;
  t.fy = fy;
  t.fx0 = fx;
  t.tip0 = t.tip;
  t.aim = t.tip;
  // 指が右端に来たときに、裂け目も右端に来るように
  t.gain = (PACK_W + GRIP - t.tip) / Math.max(PACK_W - fx, PACK_W * MIN_RUN);
}

/** 指を動かした */
export function pull(t: Tear, fx: number, fy: number) {
  if (!t.hold || t.done) return;
  t.fx = fx;
  t.fy = fy;
  t.aim = t.tip0 + (fx - t.fx0) * t.gain;
}

/** 指をはなした。押しただけ・7 割を越えて裂いたときは、残りを自動で切る */
export function letGo(t: Tear, tapped: boolean) {
  if (!t.hold || t.done) return;
  t.hold = false;
  if (tapped || t.tip >= PACK_W * 0.7) t.auto = true;
  else t.aim = t.tip;
}

/** 引っぱっている長さ（裂け目と指の差） */
function tension(t: Tear) {
  return (t.hold || t.auto) && !t.done ? Math.max(0, t.aim - t.tip) : 0;
}

function targets(t: Tear) {
  const ten = tension(t);
  return {
    rot: Math.min(4, ten * 0.11),
    capR: t.notched ? 0 : Math.min(3, ten * 0.13),
    capL: t.tip > 0 ? Math.min(13, 2.5 + 7 * (t.tip / PACK_W) + ten * 0.1) : 0,
  };
}

function spring(s: Spring, to: number, k: number, damp: number, dt: number) {
  s.v += (k * (to - s.x) - 2 * damp * Math.sqrt(k) * s.v) * dt;
  s.x += s.v * dt;
}

/** dt 秒すすめる。破れた・裂け目が 1/10 進んだ・裂けきったときを返す */
export function step(t: Tear, dt: number): TearEvent[] {
  const ev: TearEvent[] = [];
  if (t.done) t.since += dt;
  if (t.hold && !t.done) {
    // 線は、左端の入り始めから今の指へ。右端でもパックの上の方に収まる傾きまで
    const lo = Math.max(-SLOPE, (Y_MIN - t.y0) / PACK_W);
    const hi = Math.min(SLOPE, (Y_MAX - t.y0) / PACK_W);
    const to = clamp((clamp(t.fy, Y_MIN, Y_MAX) - t.y0) / Math.max(t.fx, 60), lo, hi);
    t.slope += (to - t.slope) * (1 - Math.exp(-dt / SLOPE_LAG));
  }
  if (t.auto && !t.done) t.aim = Math.min(PACK_W + GRIP + 30, Math.max(t.aim, t.tip) + (PACK_W / AUTO) * dt);
  if (!t.notched && !t.done && tension(t) > NOTCH) {
    t.notched = true;
    ev.push("notch");
  }
  if (t.notched && !t.done && (t.hold || t.auto)) {
    const to = t.aim - GRIP;
    t.tip = Math.min(PACK_W, Math.max(t.tip, t.tip + (to - t.tip) * (1 - Math.exp(-dt / LAG))));
    // 残りわずかになったら一気に裂ける。指が右端まで来ていれば、少し手前からでも裂けきる
    const rest = t.aim >= PACK_W + GRIP - 0.5 ? 15 : 4;
    if (t.tip >= PACK_W - rest) {
      t.tip = PACK_W;
      t.done = true;
      t.hold = false;
      t.auto = false;
      t.openAtDone = gap(t);
      // 上が取れた反動で、パックが逆に振れる
      t.rot.v -= 70;
      ev.push("done");
    } else {
      const k = Math.floor((t.tip / PACK_W) * 10);
      if (k > t.tick) {
        t.tick = k;
        ev.push("tick");
      }
    }
  }
  const to = targets(t);
  // ばねは細かく刻んで、遅い端末で dt が大きくなっても暴れないようにする
  const n = Math.max(1, Math.ceil(dt / 0.008));
  for (let i = 0; i < n; i++) {
    spring(t.rot, to.rot, 170, 0.4, dt / n);
    spring(t.capR, to.capR, 380, 0.28, dt / n);
    spring(t.capL, to.capL, 260, 0.5, dt / n);
  }
  return ev;
}

/** もう動かない（指も自動の切りもなく、ばねが止まり、裂けきったあとの口も閉じ終えた） */
export function still(t: Tear) {
  if (t.hold || t.auto || (t.done && t.since < MOUTH_CLOSE)) return false;
  const to = targets(t);
  const near = (s: Spring, x: number) => Math.abs(s.x - x) < 0.02 && Math.abs(s.v) < 0.1;
  return near(t.rot, to.rot) && near(t.capR, to.capR) && near(t.capL, to.capL);
}

/** 画面に描く形（パックの中の座標・度）。Opening が CSS の変数にそのまま書く */
export interface TearShape {
  /** 裂け目の先 */
  tip: number;
  /** 切り取り線の高さ：左端・裂け目・右端 */
  yl: number;
  yt: number;
  yr: number;
  /** 切り取り線の傾き（度） */
  ang: number;
  /** 口が開いている所の右の端（破れる前は右端、裂いている間は裂け目）と、左端での口の開き。
   *  上の端が浮いてできた隙間は、めくれたフィルムの内側（銀色）で埋める */
  hx: number;
  mouth: number;
  /** 口の右の端での開き（裂けきったあとは口全体が開く） */
  mouthEnd: number;
  /** 裂けた上の端がめくれて見える、裏の銀色の幅 */
  band: number;
  rot: number;
  capL: number;
  capR: number;
}

const DEG = Math.PI / 180;

/** 上の端が左端でどれだけ浮いたか（その分だけ隙間が開く） */
function gap(t: Tear) {
  return Math.max(0, t.notched ? t.tip * Math.sin(t.capL.x * DEG) : PACK_W * Math.sin(t.capR.x * DEG));
}

export function shape(t: Tear): TearShape {
  const at = (x: number) => t.y0 + t.slope * x;
  // 裂けきったら、上が飛んでいく間に、隙間を小さな口（MOUTH_OPEN）まで閉じる
  const k = Math.min(1, t.since / MOUTH_CLOSE);
  const mouth = t.done ? t.openAtDone + (MOUTH_OPEN - t.openAtDone) * (1 - (1 - k) ** 2) : gap(t);
  return {
    tip: t.tip,
    yl: t.y0,
    yt: at(t.tip),
    yr: at(PACK_W),
    ang: Math.atan(t.slope) / DEG,
    hx: t.notched ? t.tip : PACK_W,
    mouth,
    mouthEnd: t.done ? mouth * 0.6 : 0,
    band: 1.2 + Math.max(0, t.capL.x) * 0.15,
    rot: t.rot.x,
    capL: t.capL.x,
    capR: t.capR.x,
  };
}
