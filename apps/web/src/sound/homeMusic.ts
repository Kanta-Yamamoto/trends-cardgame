import { useEffect, useSyncExternalStore } from "react";
import TRACK from "./home.mp3";

/**
 * ホームの音楽（10月27日。オーナー：「これ、ログイン時のホームの音楽にしたい」。曲はオーナーが Suno で作った「未来の静けさ」）。
 * ホーム画面を開いている間だけ流し、ほかの画面へ移ったとき・アプリが裏に回ったときは止める（戻ると続きから）。
 * <audio> ではなく Web Audio で鳴らす：
 * - 音量とフェードが iPhone でも効く（iPhone では <audio> の volume を変えられない）
 * - Android の通知に「再生中」が出ない
 * - iPhone のマナーモードでは鳴らさず、ほかのアプリの音楽も止めない（audioSession を ambient に）
 * ブラウザは画面を一度押すまで音を出させないので、そのときは最初に押したところで鳴り始める
 */

/** 音量（曲そのままの大きさを 1） */
const VOLUME = 0.7;
/** 鳴り始め・止めるときのフェード（秒） */
const FADE_IN = 1.2;
const FADE_OUT = 0.4;
/** 止めたかどうかを端末に覚える（"off" で止めている） */
const KEY = "trends.homeMusic";
/** ブラウザが音を出してよいと認める操作 */
const GESTURES = ["pointerup", "touchend", "click", "keydown"] as const;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let track: Promise<AudioBuffer> | null = null;
let source: AudioBufferSourceNode | null = null;
/** ホーム画面を開いているか */
let onHome = false;
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

function shouldPlay() {
  return onHome && enabled && document.visibilityState === "visible";
}

/** 初めて要るときに一度だけ用意する（Web Audio のないブラウザ・テストでは何もしない） */
function setup(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof AudioContext === "undefined") return null;
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = "ambient";
  ctx = new AudioContext();
  gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  // 押すまで音を出させないブラウザ・電話などで止められた iPhone は、次に押したときに鳴らし直す
  const unlock = () => {
    if (ctx && ctx.state !== "running" && shouldPlay()) ctx.resume().catch(() => {});
  };
  for (const g of GESTURES) document.addEventListener(g, unlock, true);
  document.addEventListener("visibilitychange", sync);
  return ctx;
}

/** 曲を読んで音の波にする（失敗したら次に開いたときに読み直す） */
function loadTrack(c: AudioContext): Promise<AudioBuffer> {
  track ??= fetch(TRACK)
    .then((res) => res.arrayBuffer())
    .then((data) => c.decodeAudioData(data))
    .catch((err) => {
      track = null;
      throw err;
    });
  return track;
}

/** 今の音量から to まで sec 秒で動かす */
function fadeTo(c: AudioContext, g: GainNode, to: number, sec: number) {
  const now = c.currentTime;
  g.gain.cancelScheduledValues(now);
  g.gain.setValueAtTime(g.gain.value, now);
  g.gain.linearRampToValueAtTime(to, now + sec);
}

/** 流すべきかどうかに合わせて、鳴らす・止める */
function sync() {
  const c = setup();
  const g = gain;
  if (!c || !g) return;
  window.clearTimeout(stopTimer);
  if (!shouldPlay()) {
    fadeTo(c, g, 0, FADE_OUT);
    // 消え終わったら止める（止めている間は電池を使わず、次はその続きから鳴る）
    stopTimer = window.setTimeout(
      () => {
        if (!shouldPlay() && c.state === "running") c.suspend().catch(() => {});
      },
      FADE_OUT * 1000 + 50,
    );
    return;
  }
  loadTrack(c)
    .then((buffer) => {
      if (!shouldPlay()) return;
      if (!source) {
        source = c.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(g);
        source.start();
      }
      // 押す前で音を出させてもらえないときは、押したときに鳴る（unlock）
      c.resume().catch(() => {});
      fadeTo(c, g, VOLUME, FADE_IN);
    })
    .catch(() => {
      // 読めなければ鳴らさない（画面はそのまま使える）
    });
}

/** ホーム画面を開いている間だけ音楽を流す（Home から呼ぶ） */
export function useHomeMusic() {
  useEffect(() => {
    onHome = true;
    sync();
    return () => {
      onHome = false;
      sync();
    };
  }, []);
}

export function setMusicOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // 覚えられなくても、開いている間は選んだとおり
  }
  for (const f of subscribers) f();
  sync();
}

/** 音楽を流す設定か（ホームのボタンの表示に使う） */
export function useMusicOn(): boolean {
  return useSyncExternalStore(
    (f) => {
      subscribers.add(f);
      return () => subscribers.delete(f);
    },
    () => enabled,
  );
}
