import type { UserRow } from "../db/schema";

/**
 * 買わなくても全部使えるアカウント（11月1日）。Web の友だち（Google）と開発用。
 * 売るのはアプリだけで、Web は友だち用に招待制のまま残す
 */
export const isOpenAccount = (sub: string) => sub.startsWith("google:") || sub.startsWith("dev:");

/** デッキを組む・パックを開ける・カードの解放が使えるか */
export const isUnlocked = (u: Pick<UserRow, "sub" | "unlocked">) => u.unlocked || isOpenAccount(u.sub);
