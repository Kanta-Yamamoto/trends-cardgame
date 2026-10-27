import { useEffect, useSyncExternalStore } from "react";
import BATTLE from "./battle.mp3";
import COLLECTION from "./collection.mp3";
import DECK_SELECT from "./deck.mp3";
import GACHA from "./gacha.mp3";
import HOME from "./home.mp3";
import PULL from "./pull.mp3";

/**
 * 画面の音楽（10月27日）。曲のある画面を開いている間だけ流し、ほかの画面へ移ったとき・アプリが裏に回ったときは止める（戻ると続きから）。
 * 曲はどれもオーナーが Suno で作った
 * - ホーム：「未来の静けさ」（オーナー：「これ、ログイン時のホームの音楽にしたい」）
 * - ガチャ（/gacha）：「Glossy Shop Groove」、対戦中（CPU 戦・オンライン対戦の盤面）：「Breakbeat Focus」
 *   （オーナー：「少しドラムの音が刺さるので高音をすこーーし…削ってもいいかも」。2.5kHz より上のドラムの山だけを軽く抑えてある。docs/history.md）
 *   ガチャはパックを開けている間は、ガチャの曲の代わりに「Floating Anticipation」を小さめの音で流し、最後の結果の画面でガチャの曲をゆっくり戻す
 *   （オーナー：「ガチャを引くところは静かにね。最後のリザルトのところからゆっくりフェードインする」「これ、ガチャのカードを引く時に小さめの音で流しておいて」。useMusicScene）
 * - デッキを選ぶ画面（CPU 戦・オンライン対戦。DeckGrid）：「Deck Selection」（オーナー：「デッキを選択する画面でこの音楽を流して」）
 * - カード一覧（/cards）・デッキを組む（/decks）：「Harmonic Lift」（オーナー：「これ、カード一覧とデッキ選択画面で。ホームよりも９割くらいの大きさで」）
 * 止めるボタン（MusicToggle）の設定は 1 つで、どの曲にも効く。
 * <audio> ではなく Web Audio で鳴らす：
 * - 音量とフェードが iPhone でも効く（iPhone では <audio> の volume を変えられない）
 * - Android の通知に「再生中」が出ない
 * - iPhone のマナーモードでは鳴らさず、ほかのアプリの音楽も止めない（audioSession を ambient に）
 * ブラウザは画面を一度押すまで音を出させないので、そのときは最初に押したところで鳴り始める
 */

/** 曲と音量（曲そのままの大きさを 1）。音量は、どの曲も同じ大きさに聞こえるようにラウドネスで合わせた */
const TRACKS = {
  home: { url: HOME, volume: 0.7 },
  gacha: { url: GACHA, volume: 0.62 },
  battle: { url: BATTLE, volume: 0.66 },
  deckSelect: { url: DECK_SELECT, volume: 0.66 },
  /** ホームの 9 割の大きさ（ホームより 0.9dB 小さく聞こえる） */
  collection: { url: COLLECTION, volume: 0.54 },
  /** ガチャのパックを開けている間。小さめ（ほかの曲より 8dB ほど小さく聞こえる） */
  gachaPull: { url: PULL, volume: 0.26 },
};
export type MusicName = keyof typeof TRACKS;
const NAMES = Object.keys(TRACKS) as MusicName[];

/** 鳴り始め・止めるときのフェード（秒） */
const FADE_IN = 1.2;
const FADE_OUT = 0.4;
/** 場面の曲から画面の曲へ戻すとき（ガチャの結果の画面）のフェード（秒） */
const FADE_SLOW = 3;
/** 止めたかどうかを端末に覚える（"off" で止めている。名前はホームだけだった頃のまま） */
const KEY = "trends.homeMusic";
/** ブラウザが音を出してよいと認める操作 */
const GESTURES = ["pointerup", "touchend", "click", "keydown"] as const;

interface Deck {
  /** 読んで音の波にしたもの（流していない曲は手放す。対戦の曲だけで 60MB ほどあるため） */
  buffer: Promise<AudioBuffer> | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  /** 流し始めた時刻（曲の頭の位置に直したもの） */
  startedAt: number;
  /** 止めたところ（次はここから） */
  offset: number;
}
const decks = Object.fromEntries(
  NAMES.map((n) => [n, { buffer: null, source: null, gain: null, startedAt: 0, offset: 0 }]),
) as Record<MusicName, Deck>;

let ctx: AudioContext | null = null;
/** 開いている画面の曲 */
let current: MusicName | null = null;
/** 画面の曲の代わりに、いま流す場面の曲（ガチャのパックを開けている間） */
let scene: MusicName | null = null;
/** 次に鳴らすときは、ゆっくり上げる（場面の曲から画面の曲へ戻すとき） */
let slowNext = false;
let enabled = loadEnabled();
let stopTimer = 0;
const subscribers = new Set<() => void>();

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** 今流す曲（無ければ null） */
function wanted(): MusicName | null {
  return enabled && document.visibilityState === "visible" ? (scene ?? current) : null;
}

/** 初めて要るときに一度だけ用意する（Web Audio のないブラウザ・テストでは何もしない） */
function setup(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "ambient";
  ctx = new AudioContext();
  // 押すまで音を出させないブラウザ・電話などで止められた iPhone は、次に押したときに鳴らし直す
  const unlock = () => {
    if (ctx && ctx.state !== "running" && wanted()) ctx.resume().catch(() => {});
  };
  for (const g of GESTURES) document.addEventListener(g, unlock, true);
  document.addEventListener("visibilitychange", sync);
  return ctx;
}

/** 曲を読んで音の波にする（失敗したら次に開いたときに読み直す） */
function load(c: AudioContext, name: MusicName): Promise<AudioBuffer> {
  const d = decks[name];
  const p = fetch(TRACKS[name].url)
    .then((res) => res.arrayBuffer())
    .then((data) => c.decodeAudioData(data))
    .catch((err) => {
      if (d.buffer === p) d.buffer = null;
      throw err;
    });
  d.buffer = p;
  return p;
}

/** 今の音量から to まで sec 秒で動かす */
function fadeTo(c: AudioContext, g: GainNode, to: number, sec: number) {
  const now = c.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(to, now + sec);
}

function play(c: AudioContext, name: MusicName, fadeIn: number) {
  const d = decks[name];
  (d.buffer ?? load(c, name))
    .then((buffer) => {
      if (wanted() !== name) return;
      if (!d.gain) {
        d.gain = c.createGain();
        d.gain.gain.value = 0;
        d.gain.connect(c.destination);
      }
      if (!d.source) {
        const offset = d.offset % buffer.duration;
        d.source = c.createBufferSource();
        d.source.buffer = buffer;
        d.source.loop = true;
        d.source.connect(d.gain);
        d.source.start(0, offset);
        d.startedAt = c.currentTime - offset;
      }
      // 押す前で音を出させてもらえないときは、押したときに鳴る（unlock）
      c.resume().catch(() => {});
      fadeTo(c, d.gain, TRACKS[name].volume, fadeIn);
    })
    .catch(() => {
      // 読めなければ鳴らさない（画面はそのまま使える）
    });
}

/** 止めたところを覚えて、音の波を手放す */
function release(c: AudioContext, name: MusicName) {
  const d = decks[name];
  if (d.source) {
    const duration = d.source.buffer?.duration ?? 0;
    if (duration > 0) d.offset = (c.currentTime - d.startedAt) % duration;
    d.source.stop();
    d.source.disconnect();
    d.source = null;
  }
  d.buffer = null;
}

/** 流すべき曲に合わせて、鳴らす・止める */
function sync() {
  const c = setup();
  if (!c) return;
  window.clearTimeout(stopTimer);
  if (document.visibilityState === "hidden") {
    // 裏に回ったら、すぐ止める（音の波はそのまま。戻ったら続きから小さい音で上げる）
    for (const d of Object.values(decks)) {
      if (!d.gain) continue;
      d.gain.gain.cancelScheduledValues(0);
      d.gain.gain.value = 0;
    }
    c.suspend().catch(() => {});
    return;
  }
  const want = wanted();
  for (const name of NAMES) {
    const g = decks[name].gain;
    if (name !== want && g) fadeTo(c, g, 0, FADE_OUT);
  }
  if (want) play(c, want, slowNext ? FADE_SLOW : FADE_IN);
  slowNext = false;
  // 消え終わったら、流していない曲を止めて手放す。何も流さないなら Web Audio ごと止める（電池を使わない）
  stopTimer = window.setTimeout(
    () => {
      const now = wanted();
      for (const name of NAMES) if (name !== now) release(c, name);
      if (!now && c.state === "running") c.suspend().catch(() => {});
    },
    FADE_OUT * 1000 + 50,
  );
}

function notify() {
  for (const f of subscribers) f();
}

/** この画面を開いている間、name の曲を流す（ホーム・ガチャ・カード一覧・デッキを組む・デッキ選び・対戦の盤面から呼ぶ） */
export function usePageMusic(name: MusicName) {
  useEffect(() => {
    current = name;
    notify();
    sync();
    return () => {
      if (current === name) current = null;
      notify();
      sync();
    };
  }, [name]);
}

/**
 * name の間は、開いている画面の曲の代わりに name の曲を流す（画面の曲は止めたところを覚える）。
 * null に戻ったら、画面の曲を止めたところから FADE_SLOW 秒かけてゆっくり上げる（ガチャのパックを開ける画面から呼ぶ）
 */
export function useMusicScene(name: MusicName | null) {
  useEffect(() => {
    if (!name) return;
    scene = name;
    sync();
    return () => {
      if (scene === name) scene = null;
      slowNext = true;
      sync();
    };
  }, [name]);
}

export function setMusicOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // 覚えられなくても、開いている間は選んだとおり
  }
  notify();
  sync();
}

/** 音楽を流す設定か（止めるボタンの表示に使う） */
export function useMusicOn(): boolean {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f);
      return () => subscribers.delete(f);
    },
    () => enabled,
  );
}

/** 開いている画面に曲があるか（上の帯に音楽のボタンを出すかに使う） */
export function useMusicPage(): MusicName | null {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f);
      return () => subscribers.delete(f);
    },
    () => current,
  );
}
