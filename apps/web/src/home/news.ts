/**
 * ホーム画面のお知らせ。新しいものを上に足す（id は重ならない文字列。既読の印に使う）。
 * 画面の文字なので、用語集（docs/glossary.md）の呼び名だけを使う
 */
export interface NewsItem {
  id: string;
  /** 表示する日付（例 "10/26"） */
  date: string;
  tag: "更新" | "お知らせ";
  title: string;
}

export const NEWS: readonly NewsItem[] = [
  {
    id: "2026-10-27-music3",
    date: "10/27",
    tag: "更新",
    title: "デッキを選ぶ画面と、ガチャを引くあいだにも音楽が流れるようになりました",
  },
  {
    id: "2026-10-27-music2",
    date: "10/27",
    tag: "更新",
    title: "ガチャと対戦中にも音楽が流れるようになりました",
  },
  {
    id: "2026-10-27-invite",
    date: "10/27",
    tag: "更新",
    title: "メニューとマイページの「友だちを招待」から、友だちに送るリンクを出せるようになりました",
  },
  {
    id: "2026-10-27-music",
    date: "10/27",
    tag: "更新",
    title: "ホーム画面で音楽が流れるようになりました（右上のボタンで止められます）",
  },
  {
    id: "2026-10-27-gacha",
    date: "10/27",
    tag: "更新",
    title: "プレイヤー名を決められるようになり、マイページとガチャができました",
  },
  {
    id: "2026-10-27-finale",
    date: "10/27",
    tag: "更新",
    title: "勝ち負けが決まったとき、負けた側のライフのゲージが砕けてから結果が出るようになりました",
  },
  {
    id: "2026-10-26-resume",
    date: "10/26",
    tag: "更新",
    title: "オンライン対戦で通信が切れても、対戦に戻れるようになりました",
  },
  { id: "2026-10-26-home", date: "10/26", tag: "更新", title: "ホーム画面ができました" },
  { id: "2026-10-26-dark", date: "10/26", tag: "更新", title: "闇堕ちのしかたが変わりました" },
  {
    id: "2026-10-26-login",
    date: "10/26",
    tag: "更新",
    title: "Google アカウントでログインする形になりました",
  },
  {
    id: "2026-10-25-clock",
    date: "10/25",
    tag: "更新",
    title: "オンライン対戦の1ターンが60秒、持ち時間が10分になりました",
  },
  { id: "2026-10-25-open", date: "10/25", tag: "お知らせ", title: "11月1日に公開する予定です" },
];

const SEEN_KEY = "trends.newsSeen";

/** まだ見ていないお知らせの数（いちばん新しく見たものより上にある数） */
export function unseenCount(): number {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (!seen) return NEWS.length;
    const at = NEWS.findIndex((n) => n.id === seen);
    return at < 0 ? NEWS.length : at;
  } catch {
    return 0;
  }
}

/** お知らせを開いたら、すべて見たことにする */
export function markNewsSeen() {
  try {
    if (NEWS[0]) localStorage.setItem(SEEN_KEY, NEWS[0].id);
  } catch {
    // 保存できなくてもよい（次に開いたときも数が出るだけ）
  }
}
