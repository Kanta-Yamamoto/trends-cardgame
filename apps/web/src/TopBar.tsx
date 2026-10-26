import { Link } from "react-router";

/** ホーム以外の画面の上の帯：左にホームへ戻るボタン、右にロゴ */
export function TopBar() {
  return (
    <div className="topbar">
      <Link to="/" className="topbar-back">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        ホーム
      </Link>
      <span className="topbar-brand" aria-hidden="true">
        TRENDS
      </span>
    </div>
  );
}
