import { App } from "@capacitor/app";
import { useEffect, useSyncExternalStore } from "react";
import { isApp } from "../native";
import BATTLE from "./battle.mp3";
import COLLECTION from "./collection.mp3";
import DARK from "./dark.mp3";
import DECK_SELECT from "./deck.mp3";
import GACHA from "./gacha.mp3";
import HOME from "./home.mp3";
import { LEVELS_KEY, levelGain, readLevels, type SoundKind, type SoundLevels } from "./levels";
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
 * - 闇堕ちのあと：「Tense Loop」を 1 周だけ流し、終わったら対戦の曲へ戻す（オーナー：「闇落ちした後に、流れる音楽」「一周終わったら BGM に戻す」。playMusicOnce）
 * 音の大きさの窓（SoundMenu）の設定は 1 つで、どの曲にも効く。音楽を 0 にすると曲を止める。
 * <audio> ではなく Web Audio で鳴らす：
 * - 音量とフェードが iPhone でも効く（iPhone では <audio> の volume を変えられない）
 * - Android の通知に「再生中」が出ない
 * - iPhone のマナーモードでは鳴らさず、ほかのアプリの音楽も止めない（audioSession を ambient に）
 * 11月2日（オーナー：「携帯の設定として音を出すんだったら出しっぱなしにする」「そういうの全部なしでいい」）：
 * アプリが前に出ている間は Web Audio を動かしたままにする。曲の無い画面で止める工夫をやめた（起こせないと効果音が消えていた）。
 * 裏に回るとき・ホームへ戻る操作の途中は、全体をすぐ絞ってから止める（いきなり止めると異音が出る）。
 * ブラウザは画面を一度押すまで音を出させないことがあるので、そのときは最初に押したところで鳴り始める
 */

/** 曲と音量（曲そのままの大きさを 1）。音量は、どの曲も同じ大きさに聞こえるようにラウドネスで合わせた */
const TRACKS = {
  home: { url: HOME, volume: 0.7 },
  gacha: { url: GACHA, volume: 0.62 },
  battle: { url: BATTLE, volume: 0.66 },
  dark: { url: DARK, volume: 0.66 },
  deckSelect: { url: DECK_SELECT, volume: 0.66 },
  /** ホームの 9 割の大きさ（ホームより 0.9dB 小さく聞こえる） */
  collection: { url: COLLECTION, volume: 0.54 },
  /** ガチャのパックを開けている間。小さめ（ほかの曲より 8dB ほど小さく聞こえる） */
  gachaPull: { url: PULL, volume: 0.26 },
};
export type MusicName = keyof typeof TRACKS;
const NAMES = Object.keys(TRACKS) as MusicName[];

/** 効果音と比べた音楽の大きさ（オーナー：「音楽を相対的に小さく」。11月2日：「特に BGM がでかいかもしれない」で 0.6 から下げた） */
const BGM_SCALE = 0.42;
/** 全体の大きさ（オーナー：「iPhone の基準の音よりもだいぶ基準の音がでかすぎる」）。音楽と効果音の両方に掛ける */
const MASTER = 0.4;
/** 裏に回るときに全体を絞る時間と、戻るときに上げる時間（秒） */
const PAUSE_FADE = 0.03;
const WAKE_FADE = 0.25;
/** 起こしても動かないときに、作り直すまでの時間（ミリ秒。iPhone は電話や切り替えのあと起きないことがある） */
const WAKE_LIMIT = 600;
/** 鳴り始め・止めるときのフェード（秒） */
const FADE_IN = 1.2;
const FADE_OUT = 0.4;
/** 場面の曲から画面の曲へ戻すとき（ガチャの結果の画面）のフェード（秒） */
const FADE_SLOW = 3;
/** 音楽の大きさを変えたときのフェード（秒） */
const FADE_QUICK = 0.15;
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
/** すべての音が通る、全体の大きさ */
let master: GainNode | null = null;
/** アプリが前に出ているか（iPhone でホームへ戻る操作の途中は、画面が見えていても false） */
let appActive = true;
let listening = false;
/** 開いている画面の曲 */
let current: MusicName | null = null;
/** 画面の曲の代わりに、いま流す場面の曲（ガチャのパックを開けている間） */
let scene: MusicName | null = null;
/** 1 周だけ流している場面の曲 */
let once: MusicName | null = null;
/** 次に鳴らすときは、ゆっくり上げる（場面の曲から画面の曲へ戻すとき） */
let slowNext = false;
/** 次に鳴らすときは、すぐ今の大きさにする（音楽の大きさを変えたとき） */
let quickNext = false;
let levels = loadLevels();
let stopTimer = 0;
const subscribers = new Set<() => void>();

function loadLevels(): SoundLevels {
  return readLevels((key) => localStorage.getItem(key));
}

/** アプリが前に出ていて、音を出してよいか */
const audible = () => appActive && document.visibilityState === "visible";

/** 今流す曲（無ければ null） */
function wanted(): MusicName | null {
  return levels.bgm > 0 && audible() ? (scene ?? current) : null;
}

/** 音の出口を作る */
function open(): AudioContext {
  const c = new AudioContext();
  const m = c.createGain();
  m.gain.value = MASTER;
  m.connect(c.destination);
  ctx = c;
  master = m;
  return c;
}

/** 起こしても動かない Web Audio を作り直す（読んだ音の波はそのまま使える） */
function rebuild() {
  const old = ctx;
  for (const d of Object.values(decks)) {
    d.source = null;
    d.gain = null;
  }
  open();
  old?.close().catch(() => {});
  sync();
}

/**
 * 止まっている Web Audio を起こす。押したときに起こしても起きなければ作り直す
 * （11月2日：押す前は起きないのが普通なので、押したときだけ作り直す。押す前にも作り直していて、押すまで 0.6 秒ごとに作り直していた）
 */
function wake(byGesture = false) {
  const c = ctx;
  if (!c || !audible()) return;
  if (master) fadeTo(c, master, MASTER, WAKE_FADE);
  if (c.state === "running") return;
  c.resume().catch(() => {});
  if (!byGesture) return;
  window.setTimeout(() => {
    if (ctx === c && c.state !== "running" && audible()) rebuild();
  }, WAKE_LIMIT);
}

/** 全体をすぐ絞ってから止める（いきなり止めると異音が出る） */
function pause() {
  const c = ctx;
  if (!c) return;
  if (master) fadeTo(c, master, 0, PAUSE_FADE);
  window.setTimeout(
    () => {
      if (ctx === c && !audible()) c.suspend().catch(() => {});
    },
    PAUSE_FADE * 1000 + 30,
  );
}

/** 初めて要るときに一度だけ用意する（Web Audio のないブラウザ・テストでは何もしない） */
function setup(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "ambient";
  const c = open();
  if (!listening) {
    listening = true;
    // 押すまで音を出させないブラウザ・電話などで止められた iPhone は、次に押したときに鳴らし直す
    for (const g of GESTURES) document.addEventListener(g, () => wake(true), true);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    // アプリでは、ホームへ戻る操作の途中（画面はまだ見えている）から止める
    if (isApp)
      void App.addListener("appStateChange", ({ isActive }) => {
        appActive = isActive;
        sync();
      });
  }
  return c;
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
        if (master) d.gain.connect(master);
      }
      if (!d.source) {
        const offset = name === once ? 0 : d.offset % buffer.duration;
        const source = c.createBufferSource();
        d.source = source;
        source.buffer = buffer;
        source.loop = name !== once;
        // 1 周流し終えたら、元の曲へ戻す（止めたときは d.source が先に空になるので、何もしない）
        if (name === once)
          source.onended = () => {
            if (d.source === source) endOnce(d);
          };
        source.connect(d.gain);
        d.source.start(0, offset);
        d.startedAt = c.currentTime - offset;
      }
      // 押す前で音を出させてもらえないときは、押したときに鳴る（wake）
      wake();
      fadeTo(c, d.gain, TRACKS[name].volume * BGM_SCALE * levelGain(levels.bgm), fadeIn);
    })
    .catch(() => {
      // 読めなければ鳴らさない（画面はそのまま使える）
    });
}

/** 1 周流し終えた場面の曲を手放して、元の曲へ戻す */
function endOnce(d: Deck) {
  d.source?.disconnect();
  d.source = null;
  d.offset = 0;
  scene = null;
  once = null;
  sync();
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
  if (!audible()) {
    pause();
    return;
  }
  wake();
  const want = wanted();
  for (const name of NAMES) {
    const g = decks[name].gain;
    if (name !== want && g) fadeTo(c, g, 0, FADE_OUT);
  }
  if (want) play(c, want, quickNext ? FADE_QUICK : slowNext ? FADE_SLOW : FADE_IN);
  slowNext = false;
  quickNext = false;
  // 消え終わったら、流していない曲を止めて手放す
  stopTimer = window.setTimeout(
    () => {
      const now = wanted();
      for (const name of NAMES) if (name !== now) release(c, name);
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
      // 1 周だけの曲の途中で画面を離れたら、次の画面に持ち越さない
      if (once) {
        scene = null;
        once = null;
      }
      notify();
      sync();
    };
  }, [name]);
}

/** 開いている画面の曲の代わりに name の曲を 1 周だけ流し、終わったら元の曲へ戻す（流している間は流し直さない） */
export function playMusicOnce(name: MusicName) {
  if (once === name) return;
  once = name;
  scene = name;
  sync();
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

/** 音楽か効果音の大きさを変える（端末に覚える） */
export function setSoundLevel(kind: SoundKind, level: number) {
  levels = { ...levels, [kind]: level };
  try {
    localStorage.setItem(LEVELS_KEY, JSON.stringify(levels));
  } catch {
    // 覚えられなくても、開いている間は選んだとおり
  }
  notify();
  if (kind === "bgm") {
    quickNext = true;
    sync();
  }
}

/** 音楽と効果音の大きさ（音の大きさの窓に使う） */
export function useSoundLevels(): SoundLevels {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f);
      return () => subscribers.delete(f);
    },
    () => levels,
  );
}

/** 効果音を鳴らす先（効果音が 0 の間・裏に回っている間は null） */
export function soundOutput(): { ctx: AudioContext; out: AudioNode } | null {
  if (levels.se === 0 || !audible()) return null;
  const c = setup();
  if (!c || !master) return null;
  wake();
  return { ctx: c, out: master };
}

/** 効果音の大きさの倍率 */
export function seGain(): number {
  return levelGain(levels.se);
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
