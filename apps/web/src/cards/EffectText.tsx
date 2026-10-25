import type { CardDef } from "@trends/cards";
import { Fragment } from "react";
import { HELP, HELP_TERMS, TOKEN_CARDS, useHelp } from "../help/help";

const SPLIT = new RegExp(`(〈[^〉]+〉|${HELP_TERMS.join("|")})`);

/**
 * 効果文の〈界隈〉とキーワード・状態の語・トークンの名前を強調する。
 * キーワードなどは押すと解説の小窓が開き、トークンの名前はそのカードの効果が開く
 * （カード自体がボタンのことがあるので、押しても親には伝えない）
 */
export function EffectText({ text }: { text: string }) {
  const openTerm = useHelp((s) => s.open);
  const openToken = useHelp((s) => s.openToken);
  const open = (p: string) => {
    const token = TOKEN_CARDS[p];
    if (token) openToken(token);
    else openTerm(p);
  };
  const parts = text.split(SPLIT).filter((p) => p !== "");
  // 文字位置をキーにする（同じ文が並んでも重ならない）
  let offset = 0;
  const pieces = parts.map((p) => {
    const at = offset;
    offset += p.length;
    return { p, at };
  });
  return (
    <>
      {pieces.map(({ p, at }) =>
        HELP[p] || TOKEN_CARDS[p] ? (
          // biome-ignore lint/a11y/useSemanticElements: カードの枠自体がボタンなので、ボタンを入れ子にできない
          <span
            className="kw kw-help"
            key={at}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              open(p);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                open(p);
              }
            }}
          >
            {p}
          </span>
        ) : p.startsWith("〈") ? (
          <span className="kw" key={at}>
            {p}
          </span>
        ) : (
          <Fragment key={at}>{p}</Fragment>
        ),
      )}
    </>
  );
}

/** 押すと解説が開く語の札（場のカードのキーワードや、状態）。term は解説の見出し、見た目の文字は children */
export function HelpTerm({
  term,
  className = "",
  children,
}: {
  term: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const open = useHelp((s) => s.open);
  if (!HELP[term]) return <span className={className}>{children ?? term}</span>;
  return (
    // biome-ignore lint/a11y/useSemanticElements: カードの枠自体がボタンなので、ボタンを入れ子にできない
    <span
      className={`${className} kw-help`}
      role="button"
      tabIndex={0}
      aria-label={`${term} の説明を見る`}
      onClick={(e) => {
        e.stopPropagation();
        open(term);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          open(term);
        }
      }}
    >
      {children ?? term}
    </span>
  );
}

/** ★5 の「闇堕ち」の札。押すと闇堕ちの仕組みと、このカードの闇堕ちの姿を見せる */
export function DarkTag({ card, className = "dark-tag" }: { card: CardDef; className?: string }) {
  const open = useHelp((s) => s.open);
  if (!card.dark) return null;
  return (
    // biome-ignore lint/a11y/useSemanticElements: カードの枠自体がボタンなので、ボタンを入れ子にできない
    <span
      className={`${className} kw-help`}
      role="button"
      tabIndex={0}
      aria-label="闇堕ちの説明を見る"
      onClick={(e) => {
        e.stopPropagation();
        open("闇堕ち", card);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          open("闇堕ち", card);
        }
      }}
    >
      闇堕ち
    </span>
  );
}
