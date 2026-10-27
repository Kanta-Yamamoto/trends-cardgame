import { setMusicOn, useMusicOn } from "./music";

/** 音楽を止める・流すボタン（曲の流れる画面に置く。設定は 1 つで、どの画面の曲にも効く） */
export function MusicToggle({ className }: { className: string }) {
  const on = useMusicOn();
  return (
    <button
      type="button"
      className={className}
      aria-label={on ? "音楽を止める" : "音楽を流す"}
      onClick={() => setMusicOn(!on)}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
        {on ? (
          <>
            <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
            <path d="M18.5 7a7 7 0 0 1 0 10" />
          </>
        ) : (
          <path d="M16 10l4 4M20 10l-4 4" />
        )}
      </svg>
    </button>
  );
}
