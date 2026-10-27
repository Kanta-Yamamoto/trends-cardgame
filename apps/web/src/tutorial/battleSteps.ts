import { type GameState, TUTORIAL } from "@trends/game-core";
import { CATALOG } from "../game/store";
import type { Face } from "./Guide";

/** 案内が見る、いまの盤面と画面の様子 */
export interface Ctx {
  game: GameState;
  /** 選んでいる手札のカードの ID・攻撃するキャラクターの枠 */
  hand: string | null;
  attacker: number | null;
  /** 裏向きのカードの説明の小窓（闇堕ちさせる）が開いているか */
  omenOpen: boolean;
}

export interface StepView {
  face: Face;
  text: string;
  /** 光らせて押させる場所 */
  targets?: string[];
  /** 光らせるだけの場所 */
  shows?: string[];
  /** 光らせずに押せる場所 */
  allow?: string[];
}

export interface BattleStep {
  id: string;
  view: (c: Ctx) => StepView;
  /** 説明だけの場面：吹き出しのボタンの文字（押すと次へ） */
  next?: string;
  /** この形になったら次へ（演出を見せ終えてから見る） */
  done?: (c: Ctx) => boolean;
}

const { me, foe, character, spell, ace, guard, omenSlot, guardSlot } = TUTORIAL;
/** カードの名前（『』で囲む） */
const nm = (id: string) => `『${CATALOG[id]?.name ?? id}』`;
const darkName = `『${CATALOG[ace]?.dark?.name ?? ""}』`;

/** 画面の場所（Play.tsx の目印） */
const handCard = (id: string) => `.hand [data-card="${id}"]`;
const openSlots = 'button[data-drop^="slot:"]:not(:disabled)';
const ally = (slot: number) => `[data-drop="ally:${slot}"]`;
const foeUnit = (slot: number) => `[data-drop="foe:${slot}"]`;
const foePlayer = `[data-master="${foe}"]`;
const myPlayer = `[data-master="${me}"]`;
const omen = `[data-slot="${me}:${omenSlot}"]`;
const CANCEL = ".hand-cancel";

/** 自分の場の、そのカードの枠 */
const slotOf = (g: GameState, id: string) => g.players[me].field.findIndex((u) => u?.cardId === id);

/**
 * チュートリアルの対戦の案内（10月27日）。キャラクターを出す → 呪文 → 闇堕ち → プレイヤーへの攻撃 の順。
 * 1 つの操作を「カードを選ぶ」「出す場所・相手を選ぶ」の 2 つに分け、選んだかどうかで光らせる場所を変える。
 * 文は用語集（docs/glossary.md）の呼び名だけで書く
 */
export const BATTLE_STEPS: readonly BattleStep[] = [
  {
    id: "board",
    next: "つぎへ",
    view: () => ({
      face: "open",
      text: `ここが対戦の画面。下があなた、上が相手だよ。相手のライフは残り ${TUTORIAL.foeLp}。0 にしたら勝ち！`,
      shows: [foePlayer, myPlayer],
    }),
  },
  {
    id: "play",
    done: (c) => slotOf(c.game, character) >= 0,
    view: (c) =>
      c.hand === character
        ? {
            face: "point",
            text: "光っている枠を押すと、そこに出せるよ。",
            targets: [openSlots],
            allow: [handCard(character), CANCEL],
          }
        : {
            face: "point",
            text: `まずはキャラクターを出そう。手札の${nm(character)}を押してね。`,
            targets: [handCard(character)],
          },
  },
  {
    id: "rush",
    next: "つぎへ",
    view: (c) => ({
      face: "open",
      text: "出せた！ キャラクターはふつう、出した次のターンから攻撃できる。でも速攻を持つキャラクターは、出したターンから攻撃できるの。",
      shows: [ally(slotOf(c.game, character))],
    }),
  },
  {
    id: "guard",
    next: "つぎへ",
    view: () => ({
      face: "think",
      text: `でも、相手の${nm(guard)}はガードを持っている。ガードがいる間は、ガードしか攻撃できないの…。`,
      shows: [foeUnit(guardSlot)],
    }),
  },
  {
    id: "spell",
    done: (c) => !c.game.players[foe].field.some((u) => u?.cardId === guard),
    view: (c) =>
      c.hand === spell
        ? {
            face: "point",
            text: `相手の${nm(guard)}を押すと、3ダメージ！`,
            targets: [foeUnit(guardSlot)],
            allow: [handCard(spell), CANCEL],
          }
        : {
            face: "point",
            text: `呪文で破壊しちゃおう。手札の${nm(spell)}を押してね。呪文は、使うと効果が出て墓地へ行くカードだよ。`,
            targets: [handCard(spell)],
          },
  },
  {
    id: "omen",
    next: "つぎへ",
    view: () => ({
      face: "surprise",
      text: `やったね！ 次は闇堕ち。紫に光っているのは、前のターンに破壊された★5${nm(ace)}の裏向きのカードだよ。`,
      shows: [omen],
    }),
  },
  {
    id: "darkFall",
    done: (c) => !!c.game.players[me].field[omenSlot]?.dark,
    view: (c) =>
      c.omenOpen
        ? {
            face: "point",
            text: "『闇堕ちさせる』を押して！",
            targets: [".dkc-go"],
            shows: [".dark-confirm .end-confirm-body"],
            allow: [".dark-confirm"],
          }
        : {
            face: "point",
            text: "闇堕ちを持つ★5は、破壊されても裏向きで残るの。自分のターンに押すと、闇堕ちの姿で出せるよ。押してみて！",
            targets: [omen],
          },
  },
  {
    id: "darkForm",
    next: "つぎへ",
    view: () => ({
      face: "surprise",
      text: `${darkName}、登場！ 闇堕ちの姿も速攻を持っているから、このターンから相手のプレイヤーを攻撃できるよ。`,
      shows: [ally(omenSlot)],
    }),
  },
  {
    id: "attack1",
    done: (c) => c.game.players[foe].lp < TUTORIAL.foeLp,
    view: (c) =>
      c.attacker === omenSlot
        ? {
            face: "point",
            text: "相手のプレイヤーを押して、攻撃！",
            targets: [foePlayer],
            allow: [ally(omenSlot), CANCEL],
          }
        : {
            face: "point",
            text: `相手のプレイヤーを攻撃しよう。${darkName}を押してね。`,
            targets: [ally(omenSlot)],
          },
  },
  {
    id: "attack2",
    done: (c) => c.game.winner === me,
    view: (c) => {
      const at = slotOf(c.game, character);
      return c.attacker === at
        ? {
            face: "point",
            text: "相手のプレイヤーを押して、とどめ！",
            targets: [foePlayer],
            allow: [ally(at), CANCEL],
          }
        : {
            face: "cheer",
            text: `相手のライフは残り ${c.game.players[foe].lp}！ ${nm(character)}でとどめを刺そう。`,
            targets: [ally(at)],
          };
    },
  },
];
