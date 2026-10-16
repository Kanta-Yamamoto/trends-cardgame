import { CARDS } from "@trends/cards";
import { effectiveCost, type GameEvent } from "@trends/game-core";
import { HoloCard } from "../cards/HoloCard";
import { CATALOG, TOKENS, useGame } from "../game/store";

const cardById = Object.fromEntries(CARDS.map((c) => [c.id, c]));
const SLOT_KEYS = ["left", "center", "right"] as const;
const nameOf = (id: string) => cardById[id]?.name ?? TOKENS[id]?.name ?? id;

function describe(e: GameEvent): string {
  const who = (p: string) => (p === "p1" ? "あなた" : "相手");
  switch (e.type) {
    case "played":
      return `${who(e.player)}：${nameOf(e.cardId)} を出した（コスト ${e.cost}）`;
    case "searched":
      return e.added ? `山札から ${nameOf(e.added)} を手札に加えた` : "山札の上3枚に〈蒼空〉はなかった";
    case "battle":
      return `${nameOf(e.attacker)} が ${nameOf(e.defender)} に攻撃（破壊：${e.destroyed.map(nameOf).join("・") || "なし"}）`;
    case "leaderDamaged":
      return `${who(e.player)}のフォロワー -${e.amount}（残り ${e.lp}）`;
    case "discarded":
      return `${who(e.player)}の手札 ${nameOf(e.cardId)} がトラッシュへ`;
    case "drew":
      return `${who(e.player)}が1枚引いた`;
    case "turnStarted":
      return `―― ${who(e.player)}のターン（${e.turn}）――`;
    case "won":
      return `${who(e.player)}の勝ち！`;
  }
}

/** game-core のルールをそのまま触れる確認用の対戦画面（演出は最小限） */
export function Play() {
  const { game, log, error, selection, select, play, attack, endTurn, reset } = useGame();
  const me = game.players.p1;
  const foe = game.players.p2;
  const myTurn = game.active === "p1" && !game.winner;

  return (
    <section className="page play">
      <header className="page-head">
        <h1>ルール確認用の対戦</h1>
        <p className="muted">
          手札を選んで空いた枠を押すと場に出ます。攻撃できるカードを押してから、相手のカードか「相手」を押すと攻撃します。
        </p>
      </header>

      <div className="board">
        <button
          type="button"
          className={`leader foe ${selection?.kind === "attacker" ? "targetable" : ""}`}
          onClick={() => attack({ kind: "leader" })}
          disabled={selection?.kind !== "attacker"}
        >
          相手　フォロワー <b>{foe.lp}</b>　手札 {foe.hand.length}
        </button>
        <div className="row">
          {SLOT_KEYS.map((key, slot) => {
            const u = foe.field[slot];
            return (
              <button
                type="button"
                key={key}
                className={`slot ${u ? "filled foe-unit" : ""} ${selection?.kind === "attacker" && u ? "targetable" : ""}`}
                disabled={!(selection?.kind === "attacker" && u)}
                onClick={() => attack({ kind: "unit", slot })}
              >
                {u && (
                  <>
                    <strong>{nameOf(u.cardId)}</strong>
                    <span>{CATALOG[u.cardId]?.power}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div className="row">
          {SLOT_KEYS.map((key, slot) => {
            const u = me.field[slot];
            return (
              <button
                type="button"
                key={key}
                className={`slot ${u ? "filled" : ""} ${selection?.kind === "hand" && !u ? "droppable" : ""} ${
                  selection?.kind === "attacker" && selection.slot === slot ? "selected" : ""
                }`}
                disabled={!myTurn}
                onClick={() => (u ? u.canAttack && select({ kind: "attacker", slot }) : play(slot))}
              >
                {u && (
                  <>
                    <strong>{nameOf(u.cardId)}</strong>
                    <span>{CATALOG[u.cardId]?.power}</span>
                    {u.canAttack && <em>攻撃できる</em>}
                  </>
                )}
              </button>
            );
          })}
        </div>
        <div className="me-bar">
          <span>
            あなた　フォロワー <b>{me.lp}</b>
          </span>
          <span>
            話題力 <b>{me.mana}</b> / 12
          </span>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={reset}>
            最初から
          </button>
          <button type="button" className="btn" onClick={endTurn} disabled={!myTurn}>
            ターン終了
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {game.winner && <p className="win">{game.winner === "p1" ? "勝利！" : "敗北…"}</p>}
        <div className="hand">
          {me.hand.map((id, i) => {
            const card = cardById[id];
            if (!card) return null;
            const cost = effectiveCost(game, "p1", id, CATALOG);
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが手札に複数あり得るので位置で区別する
                key={`${id}-${i}`}
                className={`hand-card ${selection?.kind === "hand" && selection.index === i ? "selected" : ""}`}
              >
                <HoloCard
                  card={card}
                  idle={false}
                  onClick={() => myTurn && select({ kind: "hand", index: i })}
                />
                <span className={`cost-tag ${cost > me.mana ? "short" : ""}`}>コスト {cost}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ol className="log" aria-label="対戦の記録">
        {log
          .slice()
          .reverse()
          .map(({ id, e }) => (
            <li key={id}>{describe(e)}</li>
          ))}
      </ol>
    </section>
  );
}
