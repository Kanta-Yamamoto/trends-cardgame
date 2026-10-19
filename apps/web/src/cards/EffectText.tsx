import type { CardDef } from "@trends/cards";
import { Fragment } from "react";

const KEYWORDS = ["速攻", "ガード", "連撃", "凸", "注目", "闇堕ち", "ノリ"];

/** 効果文の〈種族〉とキーワードを強調する */
export function EffectText({ text }: { text: string }) {
  const parts = text.split(new RegExp(`(〈[^〉]+〉|${KEYWORDS.join("|")})`)).filter((p) => p !== "");
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
        p.startsWith("〈") || KEYWORDS.includes(p) ? (
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

export function cardNo(card: CardDef): string {
  return `${(card.number ?? "").replace("/", " / ")} · TRENDS`;
}
