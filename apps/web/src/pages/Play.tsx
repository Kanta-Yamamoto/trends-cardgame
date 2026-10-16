import type { DeckId } from "@trends/cards";
import { type AttackTarget, effectiveCost, type GameEvent, isGuarded, legalTargets } from "@trends/game-core";
import { useEffect, useState } from "react";
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
    case "battle": {
      const lost = e.destroyed.map(nameOf).join("・");
      return `${nameOf(e.attacker)} → ${nameOf(e.defender)}：${e.toDefender} ダメージ、反撃 ${e.toAttacker}${lost ? `（トラッシュ：${lost}）` : ""}`;
    }
    case "leaderDamaged":
      return `${who(e.player)}のマスターに ${e.amount} ダメージ（ライフ ${e.lp}）`;
    case "leaderHealed":
      return `${who(e.player)}のライフが ${e.amount} 回復（ライフ ${e.lp}）`;
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

/** 狭い画面ではカードを押したときに大きく表示するシートを出す */
function useNarrow() {
  const q = "(max-width: 999px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
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
          <li>相手のマスターのライフ（20）を 0 にすれば勝ち。山札が引けなくなっても負け</li>
          <li>
            話題力は毎ターン 1 ずつ増え（最大 10）、ターンの始めに全回復。後攻は手札 +1
            枚、最初のターンだけ話題力 +1
          </li>
          <li>アイコンは場に 3 体まで。出したターンは攻撃できない（速攻を除く）</li>
          <li>
            アイコン同士で戦うと、お互いの<b className="t-atk">攻撃力</b>の分だけ相手の
            <b className="t-hp">体力</b>が減る。体力が 0 になったアイコンはトラッシュへ。受けたダメージは残る
          </li>
          <li>マスターを攻撃すると、攻撃力の分だけライフが減る</li>
          <li>相手の場にガードがいる間は、マスターを攻撃できない（アイコンはどれでも攻撃できる）</li>
        </ul>
      </details>
    </>
  );
}

type Peek = { id: string; damage?: number; where: "hand" | "mine" | "foe"; index: number };

function Board() {
  const { game, deck, log, error, selection, cpuBusy, select, play, attack, endTurn, start, quit } =
    useGame();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [sheet, setSheet] = useState(false);
  const narrow = useNarrow();
  if (!game || !deck) return null;
  const me = game.players[ME];
  const foe = game.players[CPU];
  const myTurn = game.active === ME && !game.winner && !cpuBusy;
  const attacking = selection?.kind === "attacker";
  const targets = attacking ? legalTargets(game, ME, CATALOG) : [];
  const canHit = (t: AttackTarget) =>
    targets.some((x) => (x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot));
  const freeSlot = me.field.findIndex((u) => !u);
  const foeGuarded = isGuarded(game, CPU, CATALOG);
  const peekCard = peek ? CATALOG[peek.id] : null;
  const show = (p: Peek, openSheet: boolean) => {
    setPeek(p);
    if (openSheet && narrow) setSheet(true);
  };

  const hint = game.winner
    ? ""
    : !myTurn
      ? "CPU のターンです…"
      : selection?.kind === "hand"
        ? "出す枠を選んでください（もう一度カードを押すと空いている枠に出します）"
        : attacking
          ? foeGuarded
            ? "攻撃先を選んでください（ガードがいるのでマスターは攻撃できません）"
            : "攻撃先を選んでください（光っているところ）"
          : "手札を選んで場に出す／攻撃できるアイコンを選んで攻撃";

  // シートの中の操作（狭い画面用）
  const sheetAction = (() => {
    if (!peek || !myTurn) return null;
    if (peek.where === "hand") {
      const cost = effectiveCost(game, ME, peek.id, CATALOG);
      const ok = cost <= me.mana && freeSlot >= 0;
      return {
        label: ok ? "場に出す" : freeSlot < 0 ? "場がいっぱいです" : `話題力が足りません（必要 ${cost}）`,
        disabled: !ok,
        run: () => {
          select({ kind: "hand", index: peek.index });
          useGame.getState().play(freeSlot);
        },
      };
    }
    if (peek.where === "mine" && me.field[peek.index]?.canAttack) {
      return {
        label: "攻撃先を選ぶ",
        disabled: false,
        run: () => select({ kind: "attacker", slot: peek.index }),
      };
    }
    return null;
  })();

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
          guarded={foeGuarded}
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
                damage={u.damage}
                className={`unit foe-unit enter ${hit ? "targetable" : ""}`}
                onClick={() =>
                  hit
                    ? attack({ kind: "unit", slot })
                    : show({ id: card.id, damage: u.damage, where: "foe", index: slot }, true)
                }
                onPeek={() => setPeek({ id: card.id, damage: u.damage, where: "foe", index: slot })}
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
            const ready = u.canAttack && myTurn;
            const p: Peek = { id: card.id, damage: u.damage, where: "mine", index: slot };
            return (
              <MiniCard
                key={u.uid}
                card={card}
                damage={u.damage}
                className={`unit enter ${ready ? "ready" : "tired"} ${selected ? "selected" : ""}`}
                onClick={() => {
                  if (selected) return select(null);
                  if (ready && !narrow) {
                    setPeek(p);
                    return select({ kind: "attacker", slot });
                  }
                  show(p, true);
                }}
                onPeek={() => setPeek(p)}
              >
                {ready && <em className="mini-ready">攻撃できる</em>}
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
            const p: Peek = { id, where: "hand", index: i };
            return (
              <MiniCard
                // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが手札に複数あり得るので位置で区別する
                key={`${id}-${i}`}
                card={card}
                cost={cost}
                className={`in-hand ${playable ? "playable" : "short"} ${selected ? "selected" : ""}`}
                onClick={() => {
                  if (narrow) return show(p, true);
                  setPeek(p);
                  if (!myTurn) return;
                  if (selected && freeSlot >= 0) play(freeSlot);
                  else select({ kind: "hand", index: i });
                }}
                onPeek={() => setPeek(p)}
              />
            );
          })}
        </div>
      </div>

      <aside className="side">
        <div className="peek">
          {peekCard ? (
            <>
              <HoloCard key={peekCard.id} card={peekCard} idle={false} />
              {peek?.damage ? (
                <p className="peek-note">
                  ダメージ {peek.damage}／残りの体力 <b>{peekCard.hp - peek.damage}</b>
                </p>
              ) : null}
            </>
          ) : (
            <p className="muted">カードに触れると、ここに大きく表示します</p>
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

      {sheet && narrow && peekCard && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label={peekCard.name}>
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setSheet(false)} />
          <div className="sheet-body">
            <div className="sheet-card">
              <HoloCard key={peekCard.id} card={peekCard} />
            </div>
            {peek?.damage ? (
              <p className="peek-note">
                ダメージ {peek.damage}／残りの体力 <b>{peekCard.hp - peek.damage}</b>
              </p>
            ) : null}
            <div className="sheet-actions">
              {sheetAction && (
                <button
                  type="button"
                  className="btn"
                  disabled={sheetAction.disabled}
                  onClick={() => {
                    sheetAction.run();
                    setSheet(false);
                  }}
                >
                  {sheetAction.label}
                </button>
              )}
              <button type="button" className="btn ghost" onClick={() => setSheet(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

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
  /** 場にガードがいてマスターを攻撃できない */
  guarded?: boolean;
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
  guarded,
  targetable,
  onClick,
  children,
}: BarProps) {
  const pct = Math.max(0, Math.min(100, (lp / 20) * 100));
  const pips = Array.from({ length: Math.max(maxMana, mana) }, (_, i) => i < mana);
  const body = (
    <>
      <span className="pb-name">
        {name}のマスター
        {active && <i className="turn-dot" title="この人のターン" />}
        {guarded && <span className="pb-guard">ガードで守られている</span>}
      </span>
      <span className="pb-lp">
        ライフ <b key={lp}>{lp}</b>
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
          aria-label={`${name}のマスターを攻撃`}
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
