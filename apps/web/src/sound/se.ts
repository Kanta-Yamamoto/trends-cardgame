import { seGain, soundDone, soundOutput } from "./music";
import ARBITER from "./se/arbiter.wav";
import ATTACK from "./se/attack.wav";
import ATTACK_LIGHT from "./se/attack_light.wav";
import LANDING from "./se/landing.wav";
import SPELL from "./se/spell.wav";
import SPELL_HIT from "./se/spell_hit.wav";
import STAT_UP from "./se/stat_up.wav";
import TURN_CHANGE from "./se/turn_change.wav";
import UI_DECIDE from "./se/ui_decide.wav";
import UI_TAP from "./se/ui_tap.wav";
import VANISH from "./se/vanish.wav";

/**
 * 効果音（10月31日）。音はオーナーが ElevenLabs で作り、頭の無音を切って音量をそろえた（元の注文は docs/sound-effects.md）。
 * 曲と同じ Web Audio で鳴らす（大きさは曲と別に、音の大きさの窓で変える。0 の間・裏に回っている間は鳴らさない）。
 * すべてのボタンには付けない。ゲームの手ごたえがある所だけ
 */

/** 音と音量（ファイルそのままの大きさを 1）。ファイルは短いので、WAV のまま持つ（MP3 は頭に無音が入り、着地とずれる） */
const SOUNDS = {
  /** キャラクター・トークンが場に着地するとき。暫定で全員同じ音（オーナー：「クリーチャーの着地の時の音は暫定でこれにしておいて」） */
  landing: { url: LANDING, volume: 0.6 },
  /** 破壊されたキャラクターが、黒く溶けて消えるとき（オーナー：「破壊ではなく、破壊した後の消えるモーションにしましょう」） */
  vanish: { url: VANISH, volume: 0.6 },
  /** 攻撃がキャラクター・プレイヤーに当たるとき（オーナー：「相手のキャラクターへの攻撃、相手のプレイヤーへの攻撃はこれで」）。溜めのあとに「ドン」が来る */
  attack: { url: ATTACK, volume: 0.8 },
  /** 攻撃力 2 以下のキャラクターの攻撃（オーナー：「攻撃力が2以下のやつの攻撃は、この音にして、すべて」）。高い音なので、攻撃の音より小さく */
  attackLight: { url: ATTACK_LIGHT, volume: 0.5 },
  /** 呪文を使ったとき。自分も相手も同じ音（オーナー：「呪文で相手にダメージを与えるとか何かしら呪文を使った時にこの音にしてみて」） */
  spell: { url: SPELL, volume: 0.6 },
  /** 『調停者』の剣の突き。刀を抜く音と一撃の音を重ねた（オーナー：「調停者の剣の音は、これの合わせ技にして」「高音も低音もあっていい感じになる」） */
  arbiter: { url: ARBITER, volume: 0.8 },
  /** 呪文のダメージがキャラクター・プレイヤーに当たるとき（オーナー：「これ呪文で相手にダメージ与える時の基本の音」） */
  spellHit: { url: SPELL_HIT, volume: 0.7 },
  /** 攻撃力・体力が上がるとき（オーナー：「これとりあえずスタッツ上昇時の音」） */
  statUp: { url: STAT_UP, volume: 0.5 },
  /** ターンが入れ替わって、ターンの帯が出るとき。自分も相手も同じ音（オーナー：「相手の時もこっちの時も両方ともこの音にまず変えておいてください」） */
  turnChange: { url: TURN_CHANGE, volume: 0.6 },
  /** 主のボタンと、音の付いたボタン（ホーム・戻るボタン）を押したとき */
  uiTap: { url: UI_TAP, volume: 0.6 },
  /** 大事な決める操作（デッキを決めて対戦を始める・もう一度・デッキを保存・パックを開ける）。高い音なので、基本の音より小さく */
  uiDecide: { url: UI_DECIDE, volume: 0.42 },
};
export type SeName = keyof typeof SOUNDS;
const NAMES = Object.keys(SOUNDS) as SeName[];

/** arbiter の音の頭から山までの秒数。突きが当たるこの秒数前に鳴らし始める */
export const ARBITER_HIT = 0.15;

/** 攻撃の音と、音の頭から山までの秒数。当たるこの秒数前に鳴らし始める */
export function attackSound(attack: number): { name: SeName; hit: number } {
  return attack <= 2 ? { name: "attackLight", hit: 0.175 } : { name: "attack", hit: 0.16 };
}

/** landing の音の頭から山までの秒数。着地のこの秒数前に鳴らし始める */
export const LANDING_HIT = 0.03;

/** 同じ音を続けて鳴らす間隔（秒）。トークンが同時に並ぶときに重なって大きくならないように */
const MIN_GAP = 0.045;
/** 味方全体の強化は 1 体ずつ続けて当たるので、長い音が重ならないように間を空ける */
const GAPS: Partial<Record<SeName, number>> = { statUp: 0.25 };

const buffers = new Map<SeName, AudioBuffer>();
const loading = new Set<SeName>();
const lastAt = new Map<SeName, number>();
let ringing = 0;

function load(c: AudioContext, name: SeName) {
  if (buffers.has(name) || loading.has(name)) return;
  loading.add(name);
  fetch(SOUNDS[name].url)
    .then((res) => res.arrayBuffer())
    .then((data) => c.decodeAudioData(data))
    .then((buffer) => buffers.set(name, buffer))
    .catch(() => {
      // 読めなければ鳴らさない（遊ぶのに困らない）
    })
    .finally(() => loading.delete(name));
}

/** 効果音を鳴らす。読み終わっていなければ今回は鳴らさない（遅れて鳴ると、動きとずれるため） */
export function playSe(name: SeName) {
  const c = soundOutput();
  if (!c) return;
  const buffer = buffers.get(name);
  if (!buffer) {
    load(c, name);
    return;
  }
  if (c.currentTime - (lastAt.get(name) ?? -1) < (GAPS[name] ?? MIN_GAP)) return;
  lastAt.set(name, c.currentTime);
  const gain = c.createGain();
  gain.gain.value = SOUNDS[name].volume * seGain();
  gain.connect(c.destination);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
    ringing -= 1;
    if (ringing === 0) soundDone();
  };
  ringing += 1;
  // 曲のない画面では Web Audio を止めているので、起こしてから鳴らす
  c.resume()
    .then(() => source.start())
    .catch(() => {
      ringing -= 1;
    });
}

/**
 * 押したときに鳴らす音。data-decide-se を付けた大事な決める操作は uiDecide。
 * 主のボタン（グラデーションのボタン。.btn のうち、すりガラスの .ghost と字だけの .text を除く）と、
 * data-tap-se を付けたもの（ホームの対戦・デッキ・カード一覧・ガチャ・お知らせ・メニュー・閉じる・キャラを変える、どの画面でも左上の戻るボタン）は uiTap
 */
export function tapSoundOf(target: EventTarget | null): SeName | null {
  if (!(target instanceof Element)) return null;
  if (target.closest("[data-decide-se]")) return "uiDecide";
  if (target.closest("[data-tap-se]")) return "uiTap";
  const button = target.closest(".btn");
  return button && !button.matches(".ghost, .text") ? "uiTap" : null;
}

/** 音を読んでおく（すでに読んだ音は読み直さない） */
function loadAll() {
  const c = soundOutput();
  if (c) for (const name of NAMES) load(c, name);
}

/** 最初の対戦に間に合うよう音を読んでおき、音の付いたものを押したら鳴らす */
export function watchSoundEffects() {
  loadAll();
  // 裏で開いたときや効果音が 0 のときは読めないので、押すたびに読み残しを読む（最初のキャラクターで鳴らないことがあった）
  window.addEventListener("pointerdown", loadAll, { capture: true, passive: true });
  document.addEventListener("click", (e) => {
    const sound = tapSoundOf(e.target);
    if (sound) playSe(sound);
  });
}
