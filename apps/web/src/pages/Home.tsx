import { CARDS, type CardDef } from "@trends/cards";
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ATTR_META } from "../cards/meta";
import { markNewsSeen, NEWS, unseenCount } from "../home/news";
import { InstallGuide, useCanInstall } from "../InstallButton";
import { api, useSession } from "../online/session";
import { dismissGuide, refreshApp } from "../pwa";
import "../styles/home.css";

/**
 * ホーム画面（10月26日。オーナーが UI 案の A（推しが主役・下に対戦ボタン）と配色の ①ソーダ を選んだ）。
 * 真ん中に★5 のキャラクターが立ち、ふわっと浮いて呼吸する。押すと跳ね、指の位置に合わせて少し傾く。
 * 下に「オンライン対戦」「CPUと対戦」の大きなボタンと、「デッキを組む」「カード一覧」「ガチャを回す」
 */

/** ホームに立てるキャラクター：切り抜きの絵がある★5（トークンは除く） */
const CHARAS = CARDS.filter((c) => c.rarity === 5 && c.subject && c.art && !c.token);
const CHARA_KEY = "trends.homeChara";
/** 初めてのときは推し属性のミレイ（王道の属性。docs/design-mainline.md） */
const FIRST_CHARA = "c13";

function loadChara(): string {
  try {
    return localStorage.getItem(CHARA_KEY) ?? FIRST_CHARA;
  } catch {
    return FIRST_CHARA;
  }
}
function saveChara(id: string) {
  try {
    localStorage.setItem(CHARA_KEY, id);
  } catch {
    // 保存できなくても、開いている間は選んだキャラクターのまま
  }
}

/** キャラクターの色（属性の色。ニュートラルは銀） */
function charaColor(card: CardDef) {
  const a = card.attributes[0];
  return a ? ATTR_META[a].color : "#9aa6ba";
}
/** #rrggbb に透明度を付ける */
function withAlpha(hex: string, alpha: number) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

interface MyRating {
  rating: number;
  games: number;
  wins: number;
}

/** アイコンの線画（24×24、線の色は文字の色） */
function Icon({ d, className }: { d: string[]; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.map((p) => (
        <path key={p} d={p} />
      ))}
    </svg>
  );
}
const I = {
  bell: ["M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  menu: ["M4 7h16M4 12h16M4 17h16"],
  chevron: ["M9 6l6 6-6 6"],
  close: ["M6 6l12 12M18 6L6 18"],
  swap: ["M7 7h12l-3-3", "M17 17H5l3 3"],
  cpu: [
    "M8.5 6h7A2.5 2.5 0 0 1 18 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 15.5v-7A2.5 2.5 0 0 1 8.5 6z",
    "M10 2.5V6M14 2.5V6M10 18v3.5M14 18v3.5M2.5 10H6M2.5 14H6M18 10h3.5M18 14h3.5",
    "M10 10h4v4h-4z",
  ],
  swords: [
    "M14.5 17.5L3 6V3h3l11.5 11.5",
    "M13 19l6-6M16 16l4 4M19 21l2-2",
    "M14.5 6.5L18 3h3v3l-3.5 3.5",
    "M5 14l4 4M7 17l-3 3M3 19l2 2",
  ],
  deck: [
    "M6 6h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z",
    "M8 3h10a2 2 0 0 1 2 2v13",
  ],
  cards: [
    "M4.5 3h4.5a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 9 13H4.5A1.5 1.5 0 0 1 3 11.5v-7A1.5 1.5 0 0 1 4.5 3z",
    "M15 3h4.5A1.5 1.5 0 0 1 21 4.5v7a1.5 1.5 0 0 1-1.5 1.5H15a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 15 3z",
    "M4.5 15.5h4.5a1.5 1.5 0 0 1 1.5 1.5v2.5A1.5 1.5 0 0 1 9 21H4.5A1.5 1.5 0 0 1 3 19.5V17a1.5 1.5 0 0 1 1.5-1.5z",
    "M15 15.5h4.5A1.5 1.5 0 0 1 21 17v2.5a1.5 1.5 0 0 1-1.5 1.5H15a1.5 1.5 0 0 1-1.5-1.5V17a1.5 1.5 0 0 1 1.5-1.5z",
  ],
  sparkle: [
    "M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z",
    "M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z",
  ],
  trophy: ["M8 4h8v5a4 4 0 0 1-8 0z", "M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"],
  phone: [
    "M8.5 2h7A2.5 2.5 0 0 1 18 4.5v15a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 19.5v-15A2.5 2.5 0 0 1 8.5 2z",
    "M12 7v7M9 11l3 3 3-3",
  ],
  refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
  logout: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 8l-4 4 4 4M6 12h10"],
};

export function Home() {
  const user = useSession((s) => s.user);
  const token = useSession((s) => s.token);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const canInstall = useCanInstall();

  const [charaId, setCharaId] = useState(loadChara);
  const chara = CHARAS.find((c) => c.id === charaId) ?? CHARAS[0];
  const [hop, setHop] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [sheet, setSheet] = useState<"news" | "menu" | null>(null);
  const [guide, setGuide] = useState(false);
  const [unseen, setUnseen] = useState(unseenCount);
  const [head, setHead] = useState(0);
  const [mine, setMine] = useState<MyRating | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    if (!token) return;
    api<MyRating>("/me/rating", {}, token)
      .then(setMine)
      .catch(() => {});
  }, [token]);
  // 上の帯のお知らせを、新しい順に少しずつ切り替える
  useEffect(() => {
    const t = setInterval(() => setHead((n) => n + 1), 4200);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  if (!chara) return null;
  const color = charaColor(chara);
  const headline = NEWS[head % Math.min(3, NEWS.length)];

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const next = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setTilt(next));
  };
  const nextChara = () => {
    const at = CHARAS.findIndex((c) => c.id === chara.id);
    const next = CHARAS[(at + 1) % CHARAS.length];
    if (!next) return;
    setCharaId(next.id);
    saveChara(next.id);
    setHop((n) => n + 1);
  };
  const openNews = () => {
    setSheet("news");
    markNewsSeen();
    setUnseen(0);
  };
  const hopCls = hop === 0 ? "" : hop % 2 ? "a" : "b";

  return (
    <div
      className="hm"
      style={{ "--chara": color, "--chara-soft": withAlpha(color, 0.3) } as CSSProperties}
      onPointerMove={onMove}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div className="hm-blob b1" aria-hidden="true" />
      <div className="hm-blob b2" aria-hidden="true" />
      <div
        className="hm-bg"
        style={{ transform: `translate(${-tilt.x * 18}px, ${-tilt.y * 12}px)` }}
        aria-hidden="true"
      >
        <img key={chara.id} src={chara.art} alt="" />
      </div>
      <div className="hm-veil" aria-hidden="true" />
      <div className="hm-dots" aria-hidden="true" />

      <header className="hm-top">
        <Link to="/me" className="hm-plate hm-glass" aria-label="マイページ">
          <span className="hm-avatar" aria-hidden="true">
            {user ? Array.from(user.name)[0] : "?"}
          </span>
          <span className="hm-plate-text">
            <span className="hm-pname">{user?.name ?? ""}</span>
            <span className="hm-prate">
              レート<b>{mine?.rating ?? "—"}</b>
            </span>
          </span>
        </Link>
        <span className="hm-top-actions">
          <button type="button" className="hm-icon-btn hm-glass" aria-label="お知らせ" onClick={openNews}>
            <Icon d={I.bell} />
            {unseen > 0 && <span className="hm-badge">{unseen}</span>}
          </button>
          <button
            type="button"
            className="hm-icon-btn hm-glass"
            aria-label="メニュー"
            onClick={() => setSheet("menu")}
          >
            <Icon d={I.menu} />
          </button>
        </span>
      </header>

      {headline && (
        <button type="button" className="hm-news hm-glass" onClick={openNews}>
          <span className={`hm-tag ${headline.tag === "更新" ? "up" : "info"}`}>{headline.tag}</span>
          <span key={head} className="hm-news-text">
            {headline.title}
          </span>
          <Icon d={I.chevron} className="hm-news-go" />
        </button>
      )}

      <div className="hm-stage-wrap">
        <div className="hm-rays" aria-hidden="true" />
        <div
          className="hm-mark"
          style={{ transform: `translate(${-tilt.x * 30}px, ${-tilt.y * 8}px)` }}
          aria-hidden="true"
        >
          TRENDS
        </div>
        <div className="hm-ring" aria-hidden="true" />
        <div className="hm-disc" aria-hidden="true" />
        <div className="hm-bubbles" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 動きだけの飾りなので順番で十分
            <i key={i} />
          ))}
        </div>
        <button
          type="button"
          className="hm-stage"
          aria-label={`${chara.name}に触れる`}
          onClick={() => setHop((n) => n + 1)}
        >
          <span
            className="hm-tilt"
            style={{
              transform: `rotateY(${tilt.x * 10}deg) rotateX(${-tilt.y * 6}deg) translateX(${tilt.x * 10}px)`,
            }}
          >
            <span className={`hm-hop ${hopCls}`}>
              <span className="hm-float">
                <span key={chara.id} className="hm-chara">
                  <img src={chara.subject} alt="" />
                  <span
                    className="hm-shine"
                    style={{ maskImage: `url(${chara.subject})`, WebkitMaskImage: `url(${chara.subject})` }}
                  />
                </span>
              </span>
            </span>
          </span>
          <span className={`hm-burst ${hopCls}`} aria-hidden="true">
            <b />
            {Array.from({ length: 9 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 動きだけの飾りなので順番で十分
              <i key={i} style={{ "--a": `${i * 40}deg` } as CSSProperties} />
            ))}
          </span>
        </button>
        <div className="hm-name hm-glass">
          <span className="hm-star">★5</span>
          <span key={chara.id} className="hm-name-text">
            {chara.name}
          </span>
        </div>
        <button type="button" className="hm-swap hm-glass" onClick={nextChara}>
          <Icon d={I.swap} />
          キャラを変える
        </button>
      </div>

      <nav className="hm-dock" aria-label="メニュー">
        <div className="hm-battle">
          <Link to="/play" className="hm-bb cpu">
            <span className="hm-bb-ic">
              <Icon d={I.cpu} />
            </span>
            <span className="hm-bb-sub">ひとりで練習</span>
            <span className="hm-bb-label">CPUと対戦</span>
          </Link>
          <Link to="/online" className="hm-bb online">
            <span className="hm-sheen" aria-hidden="true" />
            <span className="hm-bb-ic">
              <Icon d={I.swords} />
            </span>
            <span className="hm-bb-sub">ランダムマッチ・友だちと</span>
            <span className="hm-bb-label">オンライン対戦</span>
          </Link>
        </div>
        <div className="hm-tiles">
          <Link to="/decks" className="hm-tile">
            <span className="hm-tile-ic pri">
              <Icon d={I.deck} />
            </span>
            デッキを組む
          </Link>
          <Link to="/cards" className="hm-tile">
            <span className="hm-tile-ic sub">
              <Icon d={I.cards} />
            </span>
            カード一覧
          </Link>
          <Link to="/gacha" className="hm-tile gacha">
            <span className="hm-tile-ic acc">
              <Icon d={I.sparkle} />
            </span>
            ガチャを回す
          </Link>
        </div>
      </nav>

      {sheet && (
        <div
          className="hm-sheet-wrap"
          role="dialog"
          aria-modal="true"
          aria-label={sheet === "news" ? "お知らせ" : "メニュー"}
        >
          <button type="button" className="hm-sheet-bg" aria-label="閉じる" onClick={() => setSheet(null)} />
          <section className="hm-sheet">
            <div className="hm-grip" aria-hidden="true" />
            <div className="hm-sheet-head">
              <h2>{sheet === "news" ? "お知らせ" : "メニュー"}</h2>
              <button
                type="button"
                className="hm-icon-btn hm-glass"
                aria-label="閉じる"
                onClick={() => setSheet(null)}
              >
                <Icon d={I.close} />
              </button>
            </div>
            {sheet === "news" ? (
              <ul className="hm-news-list">
                {NEWS.map((n) => (
                  <li key={n.id}>
                    <span className="hm-news-meta">
                      {n.date}
                      <span className={`hm-tag ${n.tag === "更新" ? "up" : "info"}`}>{n.tag}</span>
                    </span>
                    <span className="hm-news-title">{n.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hm-menu">
                <button type="button" onClick={() => navigate("/ranking")}>
                  <Icon d={I.trophy} />
                  ランキング
                </button>
                {canInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      setSheet(null);
                      setGuide(true);
                    }}
                  >
                    <Icon d={I.phone} />
                    アプリとして入れる
                  </button>
                )}
                <button
                  type="button"
                  title="保存しているアプリのファイルを消して、最新の版を読み直します（デッキやログインは消えません）"
                  onClick={() => void refreshApp()}
                >
                  <Icon d={I.refresh} />
                  最新にする
                </button>
                <button type="button" className="dim" onClick={logout}>
                  <Icon d={I.logout} />
                  ログアウト
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {guide && (
        <InstallGuide
          onClose={(forever) => {
            if (forever) dismissGuide(true);
            setGuide(false);
          }}
        />
      )}
    </div>
  );
}
