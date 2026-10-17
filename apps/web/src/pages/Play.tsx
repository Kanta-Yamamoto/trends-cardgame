import type { CardDef, DeckId } from "@trends/cards";
import {
  type AttackTarget,
  type CastTarget,
  canUnitAttack,
  castTargets,
  effectiveCost,
  type GameEvent,
  type GameState,
  legalTargets,
  type PlayerId,
  SLOTS,
  type Unit,
  type UnitView,
  viewUnit,
} from "@trends/game-core";
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AttrChips } from "../cards/AttrChips";
import { HoloCard } from "../cards/HoloCard";
import { ATTR_META } from "../cards/meta";
import { CardZoom } from "../game/CardZoom";
import { animateAttack, animateDraw, flipCard, popDamage, popMaster } from "../game/fx";
import { MiniCard } from "../game/MiniCard";
import { CATALOG, CPU, DECK_INFO, ME, setPresenter, useGame } from "../game/store";

const SLOT_KEYS = Array.from({ length: SLOTS }, (_, i) => `slot-${i}`);
const nameOf = (id: string) => CATALOG[id]?.name ?? id;
const who = (p: string) => (p === ME ? "あなた" : useGame.getState().foeName);

function describe(e: GameEvent): string {
  switch (e.type) {
    case "played":
      return `${who(e.player)}：${nameOf(e.cardId)} を出した（話題力 ${e.cost}）`;
    case "cast":
      return `${who(e.player)}：${nameOf(e.cardId)} を投稿（話題力 ${e.cost}）`;
    case "summoned":
      return `${who(e.player)}の場に ${nameOf(e.cardId)} が出た`;
    case "battle": {
      const lost = e.destroyed.map(nameOf).join("・");
      return `${nameOf(e.attacker)} → ${nameOf(e.defender)}：${e.toDefender} ダメージ、反撃 ${e.toAttacker}${lost ? `（オワコン：${lost}）` : ""}`;
    }
    case "damaged":
      return `${nameOf(e.cardId)} に ${e.amount} ダメージ`;
    case "destroyed":
      return `${who(e.player)}の ${nameOf(e.cardId)} がオワコンになった`;
    case "darkFall":
      return `${who(e.player)}の ${nameOf(e.cardId)} が闇堕ちした！`;
    case "restored":
      return `${who(e.player)}の ${nameOf(e.cardId)} が表に戻った`;
    case "status":
      return `${nameOf(e.cardId)}：${e.status}`;
    case "buffed":
      return `${nameOf(e.cardId)} の攻撃力${e.attack >= 0 ? "+" : ""}${e.attack}${e.hp ? `・体力+${e.hp}` : ""}`;
    case "healed":
      return `${nameOf(e.cardId)} の体力が ${e.amount} 回復`;
    case "leaderDamaged":
      return `${who(e.player)}のマスターに ${e.amount} ダメージ（ライフ ${e.lp}）`;
    case "leaderHealed":
      return `${who(e.player)}のライフが ${e.amount} 回復（ライフ ${e.lp}）`;
    case "drew":
      return `${who(e.player)}が1枚引いた`;
    case "deckOut":
      return `${who(e.player)}の山札が切れた`;
    case "turnStarted":
      return `―― ${e.turn}ターン目：${who(e.player)}（話題力 ${e.mana}）――`;
    case "stolen":
      return `${who(e.player)}が ${nameOf(e.cardId)} を奪った（推し変）`;
    case "extraTurn":
      return `${who(e.player)}は、このあともう一度ターンを行う`;
    case "resigned":
      return `${who(e.player)}が降参した`;
    case "won":
      return `${who(e.player)}の勝ち`;
  }
}

/** 画面は 960×540（スマホの横画面と同じ 16:9）で作り、ウィンドウに合わせて拡大・縮小する */
const STAGE_W = 960;
const STAGE_H = 540;
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const on = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return scale;
}

export function Play() {
  const deck = useGame((s) => s.deck);
  return <section className="page play">{deck ? <Board /> : <DeckSelect />}</section>;
}

const DECK_ATTRS: Record<DeckId, CardDef["attributes"]> = {
  flame: ["炎上", "草"],
  idol: ["メロい", "癒し"],
  expert: ["神", "癒し"],
  ronpa: ["炎上", "神"],
  dance: ["草", "メロい"],
};

function DeckSelect() {
  const start = useGame((s) => s.start);
  return (
    <>
      <header className="page-head">
        <h1>CPU と対戦</h1>
        <p className="muted">
          デッキを選んでください。CPU はほかのデッキから1つを使います。先攻・後攻はランダムです。
        </p>
      </header>
      <DeckGrid onPick={start} />
      <details className="rules">
        <summary>ルール（かんたん版）</summary>
        <ul>
          <li>相手のマスターのライフ（20）を 0 にすれば勝ち。山札が引けなくなっても負け</li>
          <li>
            話題力は毎ターン 1 ずつ増え（最大 10）、ターンの始めに全回復。後攻は手札 +1
            枚、最初のターンだけ話題力 +1
          </li>
          <li>
            アイコンは場に 5 体まで出せる。出したターンは攻撃できない（速攻を除く）。投稿は使い切りの効果
          </li>
          <li>
            アイコン同士で戦うと、お互いの<b className="t-atk">攻撃力</b>の分だけ相手の
            <b className="t-hp">体力</b>
            が減る。体力が 0 になったアイコンはオワコンへ。受けたダメージは残る
          </li>
          <li>相手の場にガードがいる間は、ガード（と晒し者）しか攻撃できない</li>
          <li>闇堕ちを持つアイコンは、一度倒されると裏返って、強い闇の姿で場に残る</li>
        </ul>
      </details>
    </>
  );
}

/** デッキを選ぶボタンの並び（CPU 戦とオンライン対戦で共通） */
export function DeckGrid({ onPick }: { onPick: (deck: DeckId) => void }) {
  return (
    <div className="decks">
      {(Object.keys(DECK_INFO) as DeckId[]).map((id) => {
        const [a, b] = DECK_ATTRS[id].map((x) => ATTR_META[x]);
        return (
          <button
            key={id}
            type="button"
            className="deck-pick"
            style={{
              background: `linear-gradient(125deg, ${a?.color}, ${a?.deep} 50%, ${b?.deep} 50%, ${b?.color})`,
            }}
            onClick={() => onPick(id)}
          >
            <span className="deck-attrs">{DECK_ATTRS[id].join(" × ")}</span>
            <strong>{DECK_INFO[id].name}</strong>
            <span>{DECK_INFO[id].text}</span>
          </button>
        );
      })}
    </div>
  );
}

type Peek = { id: string; view?: UnitView; where: "hand" | "mine" | "foe" | "trash"; index: number };

/** 対戦の画面。CPU 戦とオンライン対戦で共通（onQuit を渡すと「戻る」でそれを呼ぶ） */
export function Board({ onQuit }: { onQuit?: () => void } = {}) {
  const {
    game,
    deck,
    log,
    error,
    selection,
    cpuBusy,
    animating,
    select,
    play,
    cast,
    attack,
    endTurn,
    start,
    quit: quitGame,
    mode,
    foeName,
    resign,
  } = useGame();
  const online = mode === "online";
  const quit = () => {
    quitGame();
    onQuit?.();
  };
  const [resignAsk, setResignAsk] = useState(false);
  /** 相手が出した・使ったカードを大きく見せる */
  const [reveal, setReveal] = useState<{ id: number; cardId: string; kind: "play" | "cast" } | null>(null);
  /** 手札が多いときに、全部を大きく並べて見る */
  const [handOpen, setHandOpen] = useState(false);
  const [peek, setPeek] = useState<Peek | null>(null);
  /** 画面いっぱいに大きく見ているカード（スマホで効果を読むため） */
  const [zoom, setZoom] = useState<Peek | null>(null);
  const [banner, setBanner] = useState<{ id: number; mine: boolean; turn: number } | null>(null);
  const [trashView, setTrashView] = useState<PlayerId | null>(null);
  const seen = useRef(0);
  const scale = useStageScale();

  // 攻撃の演出を store に登録する（演出が終わってから state を進める）
  useEffect(() => {
    setPresenter({
      beforeAttack: (g, a) => animateAttack(g, a.player, a.from, a.target, CATALOG),
      turnIntro: 1100,
      revealFoe: (g, cardId, a) =>
        new Promise<void>((resolve) => {
          setReveal({ id: Date.now(), cardId, kind: a.type });
          // 対象がある投稿は、狙われたアイコンを光らせる（相手から見た enemy＝こちらのアイコン）
          const t = a.type === "cast" ? a.target : undefined;
          const uid = t ? g.players[t.side === "enemy" ? ME : CPU].field[t.slot]?.uid : undefined;
          const el = uid ? document.querySelector(`[data-uid="${uid}"]`) : null;
          el?.classList.add("fx-targeted");
          setTimeout(() => {
            setReveal(null);
            el?.classList.remove("fx-targeted");
            resolve();
          }, 1300);
        }),
    });
    return () => setPresenter(null);
  }, []);

  // 新しい出来事に合わせて演出を出す（ターン開始のバナー・ドロー・効果の数字・闇堕ち）
  useLayoutEffect(() => {
    const last = log.at(-1)?.id ?? 0;
    if (last < seen.current) seen.current = 0; // 新しい対戦
    const fresh = log.filter((l) => l.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = last;
    const g = useGame.getState().game;
    const uidAt = (p: PlayerId, slot: number) => g?.players[p].field[slot]?.uid;
    let t = 0;
    for (const { id, e } of fresh) {
      if (e.type === "turnStarted") {
        setBanner({ id, mine: e.player === ME, turn: e.turn });
        t += 950;
      } else if (e.type === "drew") {
        void animateDraw(e.player, t);
        t += 180;
      } else if (e.type === "leaderHealed") {
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `+${amount}`, "heal"), t);
      } else if (e.type === "leaderDamaged" && !fresh.some((l) => l.e.type === "battle")) {
        const { player, amount } = e;
        setTimeout(() => popMaster(player, `-${amount}`, "dmg"), t);
      } else if (e.type === "damaged") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => popDamage(uid, e.amount), t);
      } else if (e.type === "darkFall" || e.type === "restored") {
        const uid = uidAt(e.player, e.slot);
        if (uid) setTimeout(() => flipCard(uid, e.type === "darkFall" ? "dark" : "restore"), t + 80);
      }
    }
  }, [log]);

  if (!game || !deck) return null;
  const me = game.players[ME];
  const foe = game.players[CPU];
  const myTurn = game.active === ME && !game.winner && !cpuBusy && !animating;
  const attacking = selection?.kind === "attacker";
  const selectedCard = selection?.kind === "hand" ? CATALOG[me.hand[selection.index] ?? ""] : undefined;
  const postSelected = selectedCard?.type === "post";
  const castOptions: CastTarget[] =
    postSelected && selection?.kind === "hand"
      ? castTargets(game, ME, me.hand[selection.index] as string, CATALOG)
      : [];
  const canCastOn = (side: "enemy" | "ally", slot: number) =>
    castOptions.some((t) => t.side === side && t.slot === slot);
  const targets = attacking ? legalTargets(game, ME, CATALOG) : [];
  const canHit = (t: AttackTarget) =>
    targets.some((x) => (x.kind === "leader" ? t.kind === "leader" : t.kind === "unit" && t.slot === x.slot));
  const freeSlot = me.field.findIndex((u) => !u);
  const foeGuarded = foe.field.some((u) => u && viewUnit(game, CPU, u, CATALOG).guard);
  const peekCard = peek ? CATALOG[peek.id] : null;
  const hint = game.winner
    ? ""
    : game.active === CPU
      ? online
        ? `${foeName}のターンです`
        : "CPU が考えています…"
      : !myTurn
        ? ""
        : postSelected
          ? selectedCard?.target
            ? "使う相手を選んでください（光っているアイコン）"
            : "もう一度カードを押すと投稿します"
          : selection?.kind === "hand"
            ? "出す枠を選んでください（もう一度カードを押すと空いている枠に出します）"
            : attacking
              ? foeGuarded
                ? "攻撃先を選んでください（ガードがいるので、ガードと晒し者しか攻撃できません）"
                : "攻撃先を選んでください（光っているところ）"
              : "手札を選んで場に出す・投稿する／攻撃できるアイコンを選んで攻撃（長押しでカードを拡大）";

  const unitCard = (owner: PlayerId, slot: number, u: Unit) => {
    const card = CATALOG[u.cardId] as CardDef;
    const view = viewUnit(game, owner, u, CATALOG);
    const where = owner === ME ? "mine" : "foe";
    const p: Peek = { id: card.id, view, where, index: slot };
    if (owner === CPU) {
      const hit = attacking && canHit({ kind: "unit", slot });
      const castable = canCastOn("enemy", slot);
      return (
        <MiniCard
          key={u.uid}
          uid={u.uid}
          card={card}
          view={view}
          className={`unit foe-unit enter ${hit || castable ? "targetable" : ""}`}
          onClick={() =>
            castable ? cast({ side: "enemy", slot }) : hit ? attack({ kind: "unit", slot }) : setPeek(p)
          }
          onPeek={() => setPeek(p)}
          onLongPress={() => setZoom(p)}
        />
      );
    }
    const selected = attacking && selection.slot === slot;
    const ready = myTurn && canUnitAttack(game, u);
    const castable = canCastOn("ally", slot);
    return (
      <MiniCard
        key={u.uid}
        uid={u.uid}
        card={card}
        view={view}
        className={`unit enter ${ready ? "ready" : "tired"} ${selected ? "selected" : ""} ${castable ? "targetable ally" : ""}`}
        onClick={() => {
          if (castable) return cast({ side: "ally", slot });
          if (selected) return select(null);
          setPeek(p);
          if (ready) select({ kind: "attacker", slot });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      >
        {ready && <em className="mini-ready">{u.attacksLeft > 1 ? "2回攻撃" : "攻撃できる"}</em>}
      </MiniCard>
    );
  };

  const handCard = (id: string, i: number, inSheet = false) => {
    const card = CATALOG[id];
    if (!card) return null;
    const cost = effectiveCost(game, ME, id, CATALOG);
    const usable =
      myTurn &&
      cost <= me.mana &&
      (card.type === "icon" ? freeSlot >= 0 : !card.target || castTargets(game, ME, id, CATALOG).length > 0);
    const selected = selection?.kind === "hand" && selection.index === i;
    const p: Peek = { id, where: "hand", index: i };
    return (
      <MiniCard
        key={`${id}-${i}`}
        inHand
        card={card}
        cost={cost}
        className={`in-hand ${usable ? "playable" : "short"} ${selected ? "selected" : ""}`}
        onClick={() => {
          setPeek(p);
          if (!myTurn) return;
          if (inSheet) setHandOpen(false);
          if (selected && card.type === "post" && !card.target) return cast();
          if (selected && card.type === "icon" && freeSlot >= 0) return play(freeSlot);
          select(selected ? null : { kind: "hand", index: i });
        }}
        onPeek={() => setPeek(p)}
        onLongPress={() => setZoom(p)}
      />
    );
  };

  return (
    <div className="play-full">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="stage-grid">
          <div className="col-left">
            <PlayerBar
              side="foe"
              name={foeName}
              lp={foe.lp}
              mana={foe.mana}
              maxMana={foe.maxMana}
              hand={foe.hand.length}
              active={game.active === CPU}
              guarded={foeGuarded}
              targetable={attacking && canHit({ kind: "leader" })}
              onClick={() => attack({ kind: "leader" })}
              piles={
                <Piles
                  owner={CPU}
                  deck={foe.deck.length}
                  trash={foe.trash}
                  onTrash={() => setTrashView(CPU)}
                />
              }
            />
            {!game.winner && (
              <span className={`turn-pill ${game.active === ME ? "mine" : "foe"}`}>
                {game.active === ME ? "あなたのターン" : "相手のターン"}
              </span>
            )}
            <PlayerBar
              side="me"
              name="あなた"
              lp={me.lp}
              mana={me.mana}
              maxMana={me.maxMana}
              hand={me.hand.length}
              active={game.active === ME}
              piles={
                <Piles owner={ME} deck={me.deck.length} trash={me.trash} onTrash={() => setTrashView(ME)} />
              }
            />
          </div>

          <div className={`col-center board turn-${game.active === ME ? "me" : "foe"}`}>
            <div className="row">
              {SLOT_KEYS.map((key, slot) => {
                const u = foe.field[slot];
                return u ? (
                  unitCard(CPU, slot, u)
                ) : (
                  <div key={key} className={`slot ${slot === 2 ? "center" : ""}`} />
                );
              })}
            </div>
            <p
              className={`hint ${error ? "is-error" : ""}`}
              aria-live="polite"
              role={error ? "alert" : undefined}
            >
              {error ?? hint}
            </p>
            <div className="row">
              {SLOT_KEYS.map((key, slot) => {
                const u = me.field[slot];
                if (u) return unitCard(ME, slot, u);
                const drop = myTurn && selection?.kind === "hand" && !postSelected;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`slot ${slot === 2 ? "center" : ""} ${drop ? "droppable" : ""}`}
                    disabled={!drop}
                    aria-label={`空き枠 ${slot + 1}${slot === 2 ? "（センター）" : ""}`}
                    onClick={() => play(slot)}
                  />
                );
              })}
            </div>
            <div className="hand" data-hand={ME} style={{ "--n": me.hand.length } as CSSProperties}>
              {me.hand.map((id, i) => handCard(id, i))}
            </div>
            {me.hand.length >= 7 && (
              <button type="button" className="hand-more" onClick={() => setHandOpen(true)}>
                手札 {me.hand.length}枚を広げる
              </button>
            )}
          </div>

          <div className="col-right">
            <div className="peek">
              {peekCard ? (
                <PeekCard key={peekCard.id} card={peekCard} view={peek?.view} onOpen={() => setZoom(peek)} />
              ) : (
                <p className="muted">カードを押すと、ここに表示します。長押しで画面いっぱいに拡大</p>
              )}
            </div>
            <button
              type="button"
              className={`btn end-turn ${myTurn ? "now" : ""}`}
              onClick={endTurn}
              disabled={!myTurn}
            >
              ターン終了
            </button>
            <details className="log-box">
              <summary>対戦の記録</summary>
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
            </details>
            {online && !game.winner && (
              <button
                type="button"
                className={`btn ghost resign ${resignAsk ? "ask" : ""}`}
                onClick={() => (resignAsk ? resign() : setResignAsk(true))}
                onBlur={() => setResignAsk(false)}
              >
                {resignAsk ? "本当に降参する" : "降参"}
              </button>
            )}
            <button type="button" className="btn ghost quit" onClick={quit}>
              {online ? "ロビーに戻る" : "デッキ選択に戻る"}
            </button>
          </div>
        </div>
      </div>
      <p className="rotate-hint">スマホは横向きにすると大きく遊べます</p>

      {banner && (
        <div
          key={banner.id}
          className={`turn-banner ${banner.mine ? "mine" : "foe"}`}
          aria-hidden="true"
          onAnimationEnd={(e) => e.target === e.currentTarget && setBanner(null)}
        >
          <div className="tb-band">
            <small>TURN {banner.turn}</small>
            <strong>{banner.mine ? "あなたのターン" : "相手のターン"}</strong>
          </div>
        </div>
      )}

      {reveal && CATALOG[reveal.cardId] && (
        <div key={reveal.id} className="foe-reveal" aria-live="polite">
          <span className="fr-label">
            {foeName}が{reveal.kind === "play" ? "出した" : "投稿した"}
          </span>
          <div className="fr-card">
            <HoloCard card={CATALOG[reveal.cardId] as CardDef} idle={false} />
          </div>
        </div>
      )}

      {handOpen && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="手札">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setHandOpen(false)} />
          <div className="sheet-body hand-sheet">
            <h2>手札（{me.hand.length}枚）</h2>
            <div className="hand-grid">{me.hand.map((id, i) => handCard(id, i, true))}</div>
            <button type="button" className="btn ghost" onClick={() => setHandOpen(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {zoom && CATALOG[zoom.id] && (
        <CardZoom card={CATALOG[zoom.id] as CardDef} view={zoom.view} onClose={() => setZoom(null)} />
      )}

      {trashView && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="オワコン">
          <button type="button" className="sheet-bg" aria-label="閉じる" onClick={() => setTrashView(null)} />
          <div className="sheet-body trash-list">
            <h2>
              {trashView === ME ? "あなた" : foeName}のオワコン（{game.players[trashView].trash.length}枚）
            </h2>
            <div className="trash-grid">
              {game.players[trashView].trash.map((id, i) => {
                const c = CATALOG[id];
                if (!c) return null;
                return (
                  <MiniCard
                    // biome-ignore lint/suspicious/noArrayIndexKey: 同じカードが複数あり得るので位置で区別する
                    key={`${id}-${i}`}
                    card={c}
                    className="in-trash"
                    onClick={() => setZoom({ id, where: "trash", index: i })}
                  />
                );
              })}
            </div>
            <button type="button" className="btn ghost" onClick={() => setTrashView(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {game.winner && (
        <Result game={game} onAgain={online ? undefined : () => start(deck)} onQuit={quit} online={online} />
      )}
    </div>
  );
}

/** 大きく表示するカード。場のアイコンなら今の状態（闇堕ち・ダメージ・強化）も添える */
function PeekCard({ card, view, onOpen }: { card: CardDef; view?: UnitView; onOpen: () => void }) {
  const dark = view?.unit.dark && card.dark;
  return (
    <>
      {/* 押すと画面いっぱいに拡大して、効果を大きな文字で読める */}
      <div className={dark ? "peek-dark" : undefined}>
        <HoloCard card={card} interactive idle={false} onClick={onOpen} />
      </div>
      <button type="button" className="btn ghost peek-zoom" onClick={onOpen}>
        大きく見る
      </button>
      {view && (
        <div className="peek-note">
          {dark && <b className="peek-darkname">闇堕ち：{card.dark?.name}</b>}
          <span>
            攻撃 <b className="t-atk">{view.attack}</b>・体力 <b className="t-hp">{view.hp}</b>/{view.maxHp}
          </span>
          {view.keywords.length > 0 && <span>{view.keywords.join("・")}</span>}
          {view.exposed && <span>晒し者（ガードを無視して攻撃される）</span>}
          {view.asleep && <span>眠っている（このターンは攻撃できない）</span>}
          {view.unit.silenced && <span>訂正済み（キーワードと効果が消えている）</span>}
        </div>
      )}
      {!view && card.dark && <p className="peek-note">闇堕ちの姿は、裏返るまで分からない</p>}
      {!view && (
        <div className="peek-chips">
          <AttrChips card={card} />
        </div>
      )}
    </>
  );
}

function Result({
  game,
  onAgain,
  onQuit,
  online,
}: {
  game: GameState;
  onAgain?: () => void;
  onQuit: () => void;
  online: boolean;
}) {
  return (
    <div className="result" role="dialog" aria-modal="true" aria-label="対戦結果">
      <div className={`result-card ${game.winner === ME ? "win" : "lose"}`}>
        <strong>{game.winner === ME ? "勝利！" : "敗北…"}</strong>
        <span>{game.turn} ターン目で決着</span>
        <div className="result-actions">
          {onAgain && (
            <button type="button" className="btn" onClick={onAgain}>
              もう一度
            </button>
          )}
          <button type="button" className={onAgain ? "btn ghost" : "btn"} onClick={onQuit}>
            {online ? "ロビーに戻る" : "デッキを選び直す"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 山札（裏向きの束）とオワコン（いちばん上のカード）。オワコンを押すと一覧を出す */
function Piles({
  owner,
  deck,
  trash,
  onTrash,
}: {
  owner: PlayerId;
  deck: number;
  trash: string[];
  onTrash: () => void;
}) {
  const top = trash.at(-1);
  const topCard = top ? CATALOG[top] : null;
  return (
    <div className="piles">
      <div className="pile" data-pile={`deck-${owner}`} title={`山札 ${deck}枚`}>
        <span className={`cardback depth-${Math.min(3, Math.ceil(deck / 5))} ${deck === 0 ? "empty" : ""}`} />
        <b className="pile-count">{deck}</b>
        <small>山札</small>
      </div>
      <button
        type="button"
        className="pile"
        data-pile={`trash-${owner}`}
        onClick={onTrash}
        disabled={trash.length === 0}
        aria-label={`オワコン ${trash.length}枚を見る`}
      >
        {topCard ? (
          <span
            className="trash-top"
            style={
              topCard.art
                ? { backgroundImage: `url(${topCard.art})` }
                : { background: ATTR_META[topCard.attributes[0] ?? "草"].deep }
            }
          >
            <i>{topCard.name}</i>
          </span>
        ) : (
          <span className="trash-empty" />
        )}
        <b className="pile-count">{trash.length}</b>
        <small>オワコン</small>
      </button>
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
  active: boolean;
  /** 場にガードがいてマスターを攻撃できない */
  guarded?: boolean;
  targetable?: boolean;
  onClick?: () => void;
  piles: React.ReactNode;
  children?: React.ReactNode;
}

function PlayerBar({
  side,
  name,
  lp,
  mana,
  maxMana,
  hand,
  active,
  guarded,
  targetable,
  onClick,
  piles,
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
        <span data-hand={side === "me" ? undefined : CPU}>手札 {hand}</span>
      </span>
    </>
  );
  return (
    <div className={`pbar ${side}`}>
      {onClick ? (
        <button
          type="button"
          data-master={side === "me" ? ME : CPU}
          className={`pb-main ${active ? "active" : ""} ${targetable ? "targetable" : ""}`}
          disabled={!targetable}
          onClick={onClick}
          aria-label={`${name}のマスターを攻撃`}
        >
          {body}
        </button>
      ) : (
        <div className={`pb-main ${active ? "active" : ""}`} data-master={side === "me" ? ME : CPU}>
          {body}
        </div>
      )}
      {piles}
      {children}
    </div>
  );
}
