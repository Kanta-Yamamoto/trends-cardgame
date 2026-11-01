import { DEFAULT_CONFIG, type GameState, TUTORIAL } from "@trends/game-core";
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

const { me, foe, character, spell, ace, guard, rival, omenSlot, rivalSlot, guardSlot } = TUTORIAL;
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
const END_TURN = ".end-turn";

/** 自分の場の、そのカードの枠 */
const slotOf = (g: GameState, id: string) => g.players[me].field.findIndex((u) => u?.cardId === id);

/**
 * チュートリアルの対戦の案内（10月27日）。
 * 11月1日：レンが破壊されるところから見せる（オーナー：「レンが前のターンに破壊されるところもしっかりと表現しておきたい」）。
 * レンで古参を攻撃して相打ち → 裏向きのカード → ターン終了 → 相手がガードを出す → キャラクターを出す → 呪文 →
 * 「あと 4 ダメージ足りない」→ さっきのレンを闇堕ち → プレイヤーへの攻撃 の順。
 * 1 つの操作を「カードを選ぶ」「出す場所・相手を選ぶ」の 2 つに分け、選んだかどうかで光らせる場所を変える。
 * 文は用語集（docs/glossary.md）の呼び名だけで書き、1 つの吹き出しは 2 行まで。**…** は強調、『…』はカードの名前（Rich.tsx）
 */
export const BATTLE_STEPS: readonly BattleStep[] = [
  {
    id: "board",
    next: "つぎへ",
    view: () => ({
      face: "open",
      text: "下があなた、上が相手。相手の**ライフ**を 0 にしたら勝ち！",
      shows: [foePlayer, myPlayer],
    }),
  },
  {
    id: "life",
    next: "つぎへ",
    view: () => ({
      face: "point",
      text: `ふつうライフは **${DEFAULT_CONFIG.startLp}**。今回は終わりぎわから始めるから、相手は**残り ${TUTORIAL.foeLp}**！`,
      shows: [foePlayer],
    }),
  },
  {
    id: "trade",
    done: (c) => !c.game.players[foe].field.some((u) => u?.cardId === rival),
    view: (c) =>
      c.attacker === omenSlot
        ? {
            face: "point",
            text: `${nm(rival)}を押して、攻撃！`,
            targets: [foeUnit(rivalSlot)],
            allow: [ally(omenSlot), CANCEL],
          }
        : {
            face: "point",
            text: `★5${nm(ace)}で、相手の${nm(rival)}を攻撃しよう！ ${nm(ace)}を押してね。`,
            targets: [ally(omenSlot)],
          },
  },
  {
    id: "traded",
    next: "つぎへ",
    view: () => ({
      face: "surprise",
      text: `${nm(rival)}を破壊！ …でも${nm(ace)}も、反撃で破壊されちゃった。`,
      shows: [omen],
    }),
  },
  {
    id: "omenBorn",
    next: "つぎへ",
    view: () => ({
      face: "open",
      text: "大丈夫！ ★5は破壊されても**裏向き**で残って、あとで**闇堕ち**して戻ってくるの。",
      shows: [omen],
    }),
  },
  {
    id: "endTurn",
    done: (c) => c.game.turn === TUTORIAL.finalTurn && c.game.active === me,
    view: () => ({
      face: "point",
      text: "破壊されたターンは、まだ闇堕ちできないよ。**ターン終了**を押そう！",
      targets: [END_TURN],
      shows: [omen],
    }),
  },
  {
    id: "guard",
    next: "つぎへ",
    view: () => ({
      face: "think",
      text: `相手は${nm(guard)}を出してきた。**ガード**持ちだから、先にこの子しか攻撃できないの…。`,
      shows: [foeUnit(guardSlot)],
    }),
  },
  {
    id: "play",
    done: (c) => slotOf(c.game, character) >= 0,
    view: (c) =>
      c.hand === character
        ? {
            face: "point",
            text: "光っている枠に出そう！",
            targets: [openSlots],
            allow: [handCard(character), CANCEL],
          }
        : {
            face: "point",
            text: `引いた**キャラクター**を出そう。${nm(character)}を押してね。`,
            targets: [handCard(character)],
          },
  },
  {
    id: "rush",
    next: "つぎへ",
    view: (c) => ({
      face: "open",
      text: "**速攻**持ちだから、出したターンにすぐ攻撃できるよ！",
      shows: [ally(slotOf(c.game, character))],
    }),
  },
  {
    id: "spell",
    done: (c) => !c.game.players[foe].field.some((u) => u?.cardId === guard),
    view: (c) =>
      c.hand === spell
        ? {
            face: "point",
            text: `${nm(guard)}に 3 ダメージ！`,
            targets: [foeUnit(guardSlot)],
            allow: [handCard(spell), CANCEL],
          }
        : {
            face: "point",
            text: `ガードは**呪文**で破壊しちゃおう！ ${nm(spell)}を押してね。`,
            targets: [handCard(spell)],
          },
  },
  {
    id: "short",
    next: "つぎへ",
    view: (c) => ({
      face: "think",
      text: `ガードは消えた！ でも${nm(character)}だけじゃ、あと **${c.game.players[foe].lp - (CATALOG[character]?.attack ?? 0)} ダメージ**足りない…。`,
      shows: [foePlayer],
    }),
  },
  {
    id: "omen",
    next: "つぎへ",
    view: () => ({
      face: "surprise",
      text: `そこで、さっきの${nm(ace)}！ 印が**炎**になったら、闇堕ちできるよ。`,
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
            text: `${nm(ace)}を押して、**闇堕ち**させよう！`,
            targets: [omen],
          },
  },
  {
    id: "darkForm",
    next: "つぎへ",
    view: () => ({
      face: "surprise",
      text: `${darkName}、復活！ 闇堕ちすると**攻撃力と体力が入れ替わる**よ。`,
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
            text: `**速攻**もあるから、すぐ攻撃できる！ ${darkName}を押して。`,
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
            text: `残り ${c.game.players[foe].lp}！ ${nm(character)}でとどめだ！`,
            targets: [ally(at)],
          };
    },
  },
];
