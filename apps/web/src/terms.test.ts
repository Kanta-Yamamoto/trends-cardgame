import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROPER_NAMES, sourceTermViolations } from "@trends/cards";
import { describe, expect, it } from "vitest";

/** パッケージの src（テストはパッケージのフォルダで動く） */
const ROOT = join(process.cwd(), "src");

/** ROOT の下の .ts・.tsx（テストを除く） */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("画面に出る文字は用語集に沿う（docs/glossary.md）", () => {
  // 全ファイルを読むので、手元のマシンが混んでいると 5 秒を超える
  it("使わない呼び名を使っていない（コメントとカード名の中は除く）", () => {
    const found = sources(ROOT).flatMap((f) =>
      sourceTermViolations(readFileSync(f, "utf8"), PROPER_NAMES).map(
        (v) => `${f}:${v.line} 「${v.word}」→「${v.use}」 ${v.text}`,
      ),
    );
    expect(found).toEqual([]);
  }, 30_000);
});
