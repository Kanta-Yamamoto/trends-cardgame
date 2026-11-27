import type { ReactNode } from "react";

/**
 * 案内の文の強調（10月31日の友人の声「チュートリアルの文章の強調表示」）。
 * **…** は大事な言葉（色を付けて太く）、『…』はカードの名前（太く）。それ以外はそのまま
 */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|『[^』]+』/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push(text.slice(at, m.index));
    out.push(
      m[1] ? (
        <b key={m.index} className="tut-em">
          {m[1]}
        </b>
      ) : (
        <b key={m.index} className="tut-cn">
          {m[0]}
        </b>
      ),
    );
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}
