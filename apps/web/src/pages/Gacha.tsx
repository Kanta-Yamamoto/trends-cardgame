import { Link } from "react-router";

/** ガチャ（まだ無い。ホームの入口だけ先に置き、押すとこの画面） */
export function Gacha() {
  return (
    <section className="page gacha">
      <header className="page-head">
        <h1>ガチャを回す</h1>
      </header>
      <div className="online-card gacha-soon">
        <svg
          className="gacha-soon-ic"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z" />
          <path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
        </svg>
        <h2>準備中</h2>
        <p className="muted">ガチャは、いま作っています。</p>
        <Link to="/" className="btn">
          ホームへ戻る
        </Link>
      </div>
    </section>
  );
}
