import { seGain, soundOutput } from "./music";
import ACE_ENTRY from "./se/ace_entry.wav";
import ARBITER from "./se/arbiter.wav";
import ATTACK from "./se/attack.wav";
import ATTACK_LIGHT from "./se/attack_light.wav";
import DARK_FALL from "./se/dark_fall.wav";
import DARK_OMEN from "./se/dark_omen.wav";
import DARK_SUMMON from "./se/dark_summon.wav";
import FINISH from "./se/finish.wav";
import FIXER_CHARGE from "./se/fixer_charge.wav";
import FIXER_STRIKE from "./se/fixer_hit.wav";
import GOD_ENTRY from "./se/god_entry.wav";
import LANDING from "./se/landing.wav";
import OMEN_UNLOCK from "./se/omen_unlock.wav";
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

/**
 * 音と音量（ファイルそのままの大きさを 1）。ファイルは短いので、WAV のまま持つ（MP3 は頭に無音が入り、着地とずれる）。
 * 11月2日：実測で演出の音だけ攻撃より 10dB ほど大きかったので下げた。瞬時のラウドネスで、攻撃・着地は -24 くらい、演出は -19 までにそろえる
 */
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
  arbiter: { url: ARBITER, volume: 0.65 },
  /** 呪文のダメージがキャラクター・プレイヤーに当たるとき（オーナー：「これ呪文で相手にダメージ与える時の基本の音」） */
  spellHit: { url: SPELL_HIT, volume: 0.7 },
  /** 決着で、破片がこちらへ飛んでくるとき。勝ちも負けも同じ音（オーナー：「お互い勝った時負けた時の破片に合わせて」） */
  finish: { url: FINISH, volume: 0.6 },
  /** 『フィクサー』の黒い閃光の溜め。演出の始まりに鳴らす（オーナー：「二個目の音源を先に流した後、間髪入れず撃ち抜くところで一個目の音を流す」） */
  fixerCharge: { url: FIXER_CHARGE, volume: 0.4 },
  /** 『フィクサー』の黒い閃光が撃ち抜く瞬間 */
  fixerHit: { url: FIXER_STRIKE, volume: 0.5 },
  /** 闇堕ちを持つキャラクターが破壊されて、裏向きのカードと砂時計が残るとき（オーナー：「破壊されたのにカードが消えないで砂時計が残る場面のやつ」） */
  darkOmen: { url: DARK_OMEN, volume: 0.6 },
  /** 砂時計が回って炎に変わり、闇堕ちできるようになるとき（オーナー：「砂時計の回転と解除のやつ」） */
  omenUnlock: { url: OMEN_UNLOCK, volume: 0.6 },
  /** 闇堕ちの文字とモーダルが出るとき（オーナー：「これが実際に闇落ちモーダルのところで鳴らすやつ」） */
  darkFall: { url: DARK_FALL, volume: 0.7 },
  /** 闇堕ちの姿が盤面に戻るとき（オーナー：「これ闇落ちから登場の」） */
  darkSummon: { url: DARK_SUMMON, volume: 0.7 },
  /** 神以外の★5 の特殊な登場の演出で、キャラクターが現れる瞬間（オーナー：「前のやつが、神以外の星5」） */
  aceEntry: { url: ACE_ENTRY, volume: 0.55 },
  /** 神の降臨の衝撃の瞬間（オーナー：「後者が、神」） */
  godEntry: { url: GOD_ENTRY, volume: 0.7 },
  /** 攻撃力・体力が上がるとき（オーナー：「これとりあえずスタッツ上昇時の音」） */
  statUp: { url: STAT_UP, volume: 0.4 },
  /** ターンが入れ替わって、ターンの帯が出るとき。自分も相手も同じ音（オーナー：「相手の時もこっちの時も両方ともこの音にまず変えておいてください」） */
  turnChange: { url: TURN_CHANGE, volume: 0.6 },
  /** 主のボタンと、音の付いたボタン（ホーム・戻るボタン）を押したとき */
  uiTap: { url: UI_TAP, volume: 0.52 },
  /** 大事な決める操作（デッキを決めて対戦を始める・もう一度・デッキを保存・パックを開ける）。高い音なので、基本の音より小さく */
  uiDecide: { url: UI_DECIDE, volume: 0.42 },
};
export type SeName = keyof typeof SOUNDS;
const NAMES = Object.keys(SOUNDS) as SeName[];

/** arbiter の音の頭から山までの秒数。突きが当たるこの秒数前に鳴らし始める */
export const ARBITER_HIT = 0.15;

/** finish の音の頭から山までの秒数。破片がぶつかるこの秒数前に鳴らし始める */
export const FINISH_HIT = 1.055;

/** fixerHit の音の頭から衝撃までの秒数。撃ち抜くこの秒数前に鳴らし始める */
export const FIXER_HIT = 0.05;

/** darkFall の音の頭から山までの秒数。「闇堕ち」の字を叩きつけるこの秒数前に鳴らし始める */
export const DARK_FALL_HIT = 0.56;

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
  const output = soundOutput();
  if (!output) return;
  const { ctx: c, out } = output;
  const buffer = buffers.get(name);
  if (!buffer) {
    load(c, name);
    return;
  }
  if (c.currentTime - (lastAt.get(name) ?? -1) < (GAPS[name] ?? MIN_GAP)) return;
  lastAt.set(name, c.currentTime);
  const gain = c.createGain();
  gain.gain.value = SOUNDS[name].volume * seGain();
  gain.connect(out);
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start();
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
  const output = soundOutput();
  if (output) for (const name of NAMES) load(output.ctx, name);
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
