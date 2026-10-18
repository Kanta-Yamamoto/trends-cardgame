import type { GameState, PlayerId } from "@trends/game-core";
import { CATALOG, ME } from "./store";

interface Props {
  game: GameState;
  owner: PlayerId;
  /** 推しを出すのに今払うコスト（自分の推しだけ） */
  cost?: number;
  canPlay?: boolean;
  canDark?: boolean;
  selected?: "oshi" | "dark" | null;
  onPlay?: () => void;
  onDark?: () => void;
  onPeek: (id: string) => void;
}

const LABEL = {
  ready: "推し",
  field: "推し：場",
  fallen: "推し：倒れた",
  dark: "闇堕ち中",
  done: "推し：終わり",
} as const;

/**
 * 山札・オワコンの横に置く推し枠。推し（★5）が待っていて、話題力を払えばいつでも出せる。
 * 倒されたあとは1回だけ、押すと闇堕ちしてオワコンから戻ってこられる
 */
export function OshiBox({ game, owner, cost, canPlay, canDark, selected, onPlay, onDark, onPeek }: Props) {
  const p = game.players[owner];
  const id = p.oshi;
  const card = id ? CATALOG[id] : undefined;
  if (!card || !id) return null;
  const state = p.oshiState;
  const mine = owner === ME;
  const dark = state === "dark";
  const art = dark ? (card.dark?.art ?? card.art) : card.art;
  const waiting = mine && state === "fallen" && game.turn <= p.oshiFallenTurn;
  const label = mine && state === "fallen" ? (waiting ? "次のターン闇堕ち" : "闇堕ち") : LABEL[state];
  const act = canPlay ? onPlay : canDark ? onDark : undefined;
  return (
    <button
      type="button"
      className={`pile oshi-pile ${state} ${canPlay ? "playable" : ""} ${canDark ? "can-dark" : ""} ${selected ? "selected" : ""}`}
      data-pile={`oshi-${owner}`}
      onClick={() => (act ? act() : onPeek(id))}
      aria-label={
        canDark
          ? `推し ${card.name} を闇堕ちさせる`
          : canPlay
            ? `推し ${card.name} を出す（話題力 ${cost}）`
            : `推し ${card.name}（${LABEL[state]}）`
      }
    >
      <span className="oshi-face" style={art ? { backgroundImage: `url(${art})` } : undefined}>
        <i>{dark ? card.dark?.name : card.name}</i>
      </span>
      {state === "ready" && cost !== undefined && (
        <b className={`pile-count oshi-cost ${cost < card.cost ? "down" : ""}`}>{cost}</b>
      )}
      <small>{label}</small>
    </button>
  );
}
