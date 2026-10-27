import type { Request } from "express";

/**
 * リンクのプレビュー（OGP）。LINE・X・Discord などにリンクを貼ったとき、絵と題名のカードが出るように、
 * 画面（index.html）の <head> に差し込む（web.ts）。絵の URL は絶対の形が要るので、開かれた場所（ホスト）から作る。
 * 招待リンク・対戦の部屋のリンクは、ロボットにも招待のクッキーなしで読める（security.ts）
 */

/** プレビューの絵（1200×630。apps/web/public/ogp.jpg） */
export const OGP_IMAGE = "/ogp.jpg";
/** 絵を差し替えたら上げる（LINE・X などが前の絵を覚えたままにしないよう、絵の URL に付ける） */
const OGP_IMAGE_VERSION = 2;

/** 説明文（10月27日。オーナーが挙げた売り：おしゃれな演出・わかりやすい操作・豊富なキャラクター。絵の文字は「多彩なギミックで戦う 本格カードゲーム」） */
const ABOUT = "おしゃれな演出・わかりやすい操作・豊富なキャラクター。多彩なギミックで戦う本格カードゲーム";

export interface Preview {
  title: string;
  description: string;
}

/** どのリンクか（対戦の部屋・招待・ふつう）で、題名と説明を変える */
export function previewFor(path: string, invited: boolean): Preview {
  if (/^\/online\/[^/]+\/?$/.test(path)) {
    return {
      title: "TRENDS のオンライン対戦に誘われました",
      description: "リンクを開いてデッキを選ぶと、すぐに対戦が始まります",
    };
  }
  if (invited) return { title: "TRENDS に招待されました", description: `${ABOUT}。リンクを開くと遊べます` };
  return { title: "TRENDS", description: ABOUT };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 開かれた場所（https://ホスト）。ホストの形がおかしいときは null（絵の URL を作らない） */
function originOf(req: Request): string | null {
  const host = req.headers.host ?? "";
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const https = req.secure || String(req.headers["x-forwarded-proto"] ?? "").startsWith("https");
  return `${https ? "https" : "http"}://${host}`;
}

/** <head> に入れるプレビューの meta */
export function ogpTags(req: Request, preview: Preview): string {
  const origin = originOf(req);
  const meta: [string, string][] = [
    ["og:type", "website"],
    ["og:site_name", "TRENDS"],
    ["og:locale", "ja_JP"],
    ["og:title", preview.title],
    ["og:description", preview.description],
  ];
  if (origin) {
    meta.push(
      ["og:image", `${origin}${OGP_IMAGE}?v=${OGP_IMAGE_VERSION}`],
      ["og:image:width", "1200"],
      ["og:image:height", "630"],
      ["og:image:alt", "TRENDS"],
    );
  }
  return [
    ...meta.map(([k, v]) => `<meta property="${k}" content="${esc(v)}" />`),
    '<meta name="twitter:card" content="summary_large_image" />',
  ].join("\n");
}

/** index.html にプレビューを差し込む */
export function withPreview(html: string, req: Request, invited: boolean): string {
  const tags = ogpTags(req, previewFor(req.path, invited));
  return html.includes("</head>") ? html.replace("</head>", `${tags}\n</head>`) : `${tags}\n${html}`;
}
