import type { DeckId } from "@trends/cards";
import { type AttackTarget, effectiveCost, type GameEvent, legalTargets } from "@trends/game-core";
import { useState } from "react";
import { HoloCard } from "../cards/HoloCard";
import { MiniCard } from "../game/MiniCard";
import { CATALOG, CPU, DECK_INFO, ME, useGame } from "../game/store";

const SLOT_KEYS = ["left", "center", "right"] as const;
const nameOf = (id: string) => CATALOG[id]?.name ?? id;
const who = (p: string) => (p === ME ? "あなた" : "CPU");

function describe(e: GameEvent): string {
  switch (e.type) {
    case "played":
      return `${who(e.player)}：${nameOf(e.cardId)} を出した（話題力 ${e.cost}）`;
    case "searched":
      return e.added ? `山札から ${nameOf(e.added)} を手札に加えた` : "山札の上3枚に〈蒼空〉はなかった";
    case "battle":
      return `${nameOf(e.attacker)} → ${nameOf(e.defender)}（トラッシュ：${e.destroyed.map(nameOf).join("・") || "なし"}）`;
    case "leaderDamaged":
      return `${who(e.player)}のフォロワー -${e.amount}（残り ${e.lp}）`;
    case "leaderHealed":
      return `${who(e.player)}のフォロワー +${e.amount}（残り ${e.lp}）`;
    case "discarded":
      return `${who(e.player)}の手札の ${nameOf(e.cardId)} がトラッシュへ`;
    case "drew":
      return `${who(e.player)}が1枚引いた`;
    case "deckOut":
      return `${who(e.player)}の山札が切れた`;
    case "turnStarted":
      return `―― ${e.turn}ターン目：${who(e.player)}（話題力 ${e.mana}）――`;
    case "won":
      return `${who(e.player)}の勝ち`;
  }
}

export function Play() {
  const deck = useGame((s) => s.deck);
  return <section className="page play">{deck ? <Board /> : <DeckSelect />}</section>;
}

function DeckSelect() {
  const start = useGame((s) => s.start);
  return (
    <>
      <header className="page-head">
        <h1>CPU と対戦</h1>
        <p className="muted">
          デッキを選んでください。CPU はもう一方のデッキを使います。先攻・後攻はランダムです。
        </p>
      </header>
      <div className="decks">
        {(Object.keys(DECK_INFO) as DeckId[]).map((id) => (
          <button key={id} type="button" className={`deck-pick deck-${id}`} onClick={() => start(id)}>
            <strong>{DECK_INFO[id].name}</strong>
            <span>{DECK_INFO[id].text}</span>
          </button>
        ))}
      </div>
      <details className="rules">
        <summary>ルール（かんたん版）</summary>
        <ul>
          <li>相手のフォロワー（20000）を 0 にすれば勝ち。山札が引けなくなっても負け</li>
          <li>
            話題力は毎ターン 1 ずつ増え（最大 10）、ターンの始めに全回復。後攻は手札 +1
            枚、最初のターンだけ話題力 +1
          </li>
          <li>場は 3 枠。出したターンは攻撃できない（速攻を除く）</li>
          <li>
            カード同士はパワーの高い方が残る。同じなら両方トラッシュ。本体を攻撃するとパワー分フォロワーが減る
          </li>
          <li>ガードがいる間は、ガードしか攻撃できない</li>
        </ul>
      </details>
    </>
  );
}

function Board() {
  const { game, deck, log, error, selection, cpuBusy, select, play, attack, endTurn, start, quit } =
    useGame();
  const [peek, setPeek] = useState<string | null>(null);
  if (!game || !deck) return null;
  const me = game.players[ME];
  const foe = game.players[CPU];
  const myTurn = game.active === ME && !game.winner && !cpuBusy;
  const attacking = selection?.kind === "attacker";
  const targets = attacking ? legalTargets(game, ME, CATALOG) : [];
  const canHit = (t: AttackTarget) =>
    targets.some((x) => (x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot));
  const freeSlot = me.field.findIndex((u) => !u);
  const peekCard = peek ? CATALOG[peek] : null;

  const hint = game.winner
    ? ""
    : !myTurn
      ? "CPU のターンです…"
      : selection?.kind === "hand"
        ? "出す枠を選んでください（もう一度カードを押すと空いている枠に出します）"
        : attacking
          ? "攻撃先を選んでください（光っているところ）"
          : "手札を選んで場に出す／攻撃できるカードを選んで攻撃";

  return (
    <div className="arena">
      <div className="board">
        <PlayerBar
          side="foe"
          name="CPU"
          lp={foe.lp}
          mana={foe.mana}
          maxMana={foe.maxMana}
          hand={foe.hand.length}
          deck={foe.deck.length}
          active={game.active === CPU}
          targetable={attacking && canHit({ kind: "leader" })}
          onClick={() => attack({ kind: "leader" })}
        />
        <div className="row">
          {SLOT_KEYS.map((key, slot) => {
            const u = foe.field[slot];
            const card = u ? CATALOG[u.cardId] : null;
            if (!u || !card) return <div key={key} className="slot" />;
            const hit = attacking && canHit({ kind: "unit", slot });
            return (
              <MiniCard
                key={u.uid}
                card={card}
                className={`unit foe-unit enter ${hit ? "targetable" : ""}`}
                disabled={!hit}
                onClick={() => attack({ kind: "unit", slot })}
                onPeek={() => setPeek(card.id)}
              />
            );
          })}
        </div>
        <p className="hint" aria-live="polite">
          {hint}
        </p>
        <div className="row">
          {SLOT_KEYS.map((key, slot) => {
            const u = me.field[slot];
            const card = u ? CATALOG[u.cardId] : null;
            if (!u || !card) {
              const drop = myTurn && selection?.kind === "hand";
              return (
                <button
                  key={key}
                  type="button"
                  className={`slot ${drop ? "droppable" : ""}`}
                  disabled={!drop}
                  aria-label={`空き枠 ${slot + 1}`}
                  onClick={() => play(slot)}
                />
              );
            }
            const selected = attacking && selection.slot === slot;
            return (
              <MiniCard
                key={u.uid}
                card={card}
                className={`unit enter ${u.canAttack && myTurn ? "ready" : "tired"} ${selected ? "selected" : ""}`}
                disabled={!myTurn || !u.canAttack}
                onClick={() => select(selected ? null : { kind: "attacker", slot })}
                onPeek={() => setPeek(card.id)}
              >
                {u.canAttack && myTurn && <em className="mini-ready">攻撃できる</em>}
              </MiniCard>
            );
          })}
        </div>
        <PlayerBar
          side="me"
          name="あなた"
          lp={me.lp}
          mana={me.mana}
          maxMana={me.maxMana}
          hand={me.hand.length}
          deck={me.deck.length}
          active={game.active === ME}
        >
          <button type="button" className="btn" onClick={endTurn} disabled={!myTurn}>
            ターン終了
          </button>
        </PlayerBar>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="hand">
          {me.hand.map((id, i) => {
            const card = CATALOG[id];
            if (!card) return null;
            const cost = effectiveCost(game, ME, id, CATALOG);
            const playable = myTurn && cost <= me.mana && freeSlot >= 0;
            const selected = selection?.kind === "hand" && selection.index === i;
            return (
              <MiniCard
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが手札に複数あり得るので位置で区別する
                key={`${id}-${i}`}
                card={card}
                cost={cost}
                className={`in-hand ${playable ? "playable" : "short"} ${selected ? "selected" : ""}`}
                disabled={!myTurn}
                onClick={() => {
                  setPeek(id);
                  if (selected && freeSlot >= 0) play(freeSlot);
                  else select({ kind: "hand", index: i });
                }}
                onPeek={() => setPeek(id)}
              />
            );
          })}
        </div>
      </div>

      <aside className="side">
        <div className="peek">
          {peekCard ? (
            <HoloCard key={peekCard.id} card={peekCard} idle={false} />
          ) : (
            <p className="muted">カードに触れると詳細を表示します</p>
          )}
        </div>
        <ol className="log" aria-label="対戦の記録">
          {log
            .slice()
            .reverse()
            .map(({ id, e }) => (
              <li key={id} className={`ev-${e.type}`}>
                {describe(e)}
              </li>
            ))}
        </ol>
        <button type="button" className="btn ghost" onClick={quit}>
          デッキ選択に戻る
        </button>
      </aside>

      {game.winner && (
        <div className="result" role="dialog" aria-modal="true" aria-label="対戦結果">
          <div className={`result-card ${game.winner === ME ? "win" : "lose"}`}>
            <strong>{game.winner === ME ? "勝利！" : "敗北…"}</strong>
            <span>{game.turn} ターン目で決着</span>
            <div className="result-actions">
              <button type="button" className="btn" onClick={() => start(deck)}>
                もう一度
              </button>
              <button type="button" className="btn ghost" onClick={quit}>
                デッキを選び直す
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BarProps {
  side: "me" | "foe";
  name: string;
  lp: number;
  mana: number;
  maxMana: number;
  hand: number;
  deck: number;
  active: boolean;
  targetable?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

function PlayerBar({
  side,
  name,
  lp,
  mana,
  maxMana,
  hand,
  deck,
  active,
  targetable,
  onClick,
  children,
}: BarProps) {
  const pct = Math.max(0, Math.min(100, (lp / 20000) * 100));
  const pips = Array.from({ length: Math.max(maxMana, mana) }, (_, i) => i < mana);
  const body = (
    <>
      <span className="pb-name">
        {name}
        {active && <i className="turn-dot" title="この人のターン" />}
      </span>
      <span className="pb-lp">
        フォロワー <b key={lp}>{lp.toLocaleString()}</b>
        <span className="lp-bar">
          <span style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className="pb-mana" title={`話題力 ${mana} / ${maxMana}`}>
        話題力
        <span className="pips">
          {pips.map((on, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 話題力の玉は位置そのものが意味を持つ
            <i key={i} className={on ? "on" : ""} />
          ))}
        </span>
        <b>
          {mana}/{maxMana}
        </b>
      </span>
      <span className="pb-count">
        手札 {hand}・山札 {deck}
      </span>
    </>
  );
  return (
    <div className={`pbar ${side}`}>
      {onClick ? (
        <button
          type="button"
          className={`pb-main ${targetable ? "targetable" : ""}`}
          disabled={!targetable}
          onClick={onClick}
          aria-label={`${name}本体を攻撃`}
        >
          {body}
        </button>
      ) : (
        <div className="pb-main">{body}</div>
      )}
      {children}
    </div>
  );
}
