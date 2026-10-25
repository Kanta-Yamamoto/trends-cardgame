// Claude Code のフック（.claude/settings.json の PreToolUse）。シェルのコマンドを実行する前に、決まりに反するものを止める。
// 決まりは docs/working-agreement.md「開発の回し方」。止めると、理由が Claude に返る（終了コード 2）
import { execFileSync } from "node:child_process";

const input = JSON.parse(
  await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data || "{}"));
  }),
);
const command = input.tool_input?.command ?? "";

function block(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}

function currentBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: input.cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

// && ; | で区切った 1 つずつのコマンドで見る
for (const part of command.split(/&&|\|\||;|\||\n/)) {
  const cmd = part.trim();

  if (/^git\s+(push|commit)\b/.test(cmd) && /\s--no-verify(\s|$)/.test(cmd)) {
    block(
      "git のフックを飛ばす --no-verify は使わない。pnpm verify を通してから push する（docs/working-agreement.md）",
    );
  }

  if (
    /^git\s+push\b/.test(cmd) &&
    /(\s|:)main(\s|$)/.test(cmd) &&
    /\s(-f|--force|--force-with-lease)(\s|=|$)|\s\+/.test(cmd)
  ) {
    block("main への強制の push はしない。main には dev を早送りで入れる（git push origin dev:main）");
  }

  if (/^gh\s+pr\s+create\b/.test(cmd)) {
    const base = cmd.match(/(?:--base|-B)[\s=]+(\S+)/)?.[1];
    const head = cmd.match(/(?:--head|-H)[\s=]+(\S+)/)?.[1] ?? currentBranch();
    if (base !== "main" || head !== "dev") {
      block(
        "PR は作らない。手元で pnpm verify を通して dev に入れ、出すときは git push origin dev:main（docs/working-agreement.md）。どうしても PR にするときは dev → main（--base main --head dev）だけ",
      );
    }
  }

  if (/^gh\s+workflow\s+run\s+(ci|ci\.yml)(\s|$)/i.test(cmd)) {
    block("CI を GitHub で回すと Actions の分数を使う。確かめは手元の pnpm verify で行う");
  }
}
