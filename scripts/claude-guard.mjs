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

  if (/^git\s+push\b/.test(cmd) && /(\s|:)(refs\/heads\/)?main(\s|$)/.test(cmd)) {
    block(
      "main には push しない。dev → main の PR を作り、GitHub の CI が通ったらマージする（gh pr create --base main --head dev。docs/working-agreement.md）",
    );
  }

  if (/^gh\s+pr\s+create\b/.test(cmd)) {
    const base = cmd.match(/(?:--base|-B)[\s=]+(\S+)/)?.[1];
    const head = cmd.match(/(?:--head|-H)[\s=]+(\S+)/)?.[1] ?? currentBranch();
    if (base !== "main" || head !== "dev") {
      block(
        "PR は dev → main だけ（--base main --head dev）。作業は手元で pnpm verify を通して dev に入れる（docs/working-agreement.md）",
      );
    }
  }

  // マージは、GitHub の CI がすべて通った PR だけ（gh pr checks は、落ちた・終わっていないものがあると 0 以外で終わる）
  if (/^gh\s+pr\s+merge\b/.test(cmd)) {
    const pr = cmd.replace(/^gh\s+pr\s+merge\b/, "").match(/(?:^|\s)(\d+|https:\/\/\S+)(?=\s|$)/)?.[1];
    try {
      execFileSync("gh", ["pr", "checks", ...(pr ? [pr] : [])], { cwd: input.cwd, stdio: "pipe" });
    } catch {
      block(
        "CI が通っていない（落ちた・まだ終わっていない）PR はマージしない。gh pr checks --watch で終わるのを待ち、落ちたら直してから",
      );
    }
  }

}
