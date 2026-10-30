/*
 * TRENDS のサービスワーカー（ホーム画面に追加したアプリを速く・電波が弱くても開けるようにする）
 * - 画面（HTML）：まずネットから取り、繋がらなければ前に保存したものを出す（更新がすぐ届く）。
 *   1 秒たっても返事が無いとき（眠っていたサーバーが起きるのを待つ間）も、前に保存したものを先に出す（起きるまでのローディングが出る）
 * - ビルドした JS・CSS（名前にハッシュ付き）：一度取ったら保存したものを使う
 * - カードの絵：保存したものをすぐ出し、裏でサーバーに確かめて新しいものに取り替える（ブラウザの HTTP キャッシュは使わない）
 * - API・ログイン・オンライン対戦（Socket.IO）：いつもネット（保存しない）
 * 中身を変えたら VERSION を上げる（古い保存は消える）。今ある絵を同じ名前で差し替えたときも上げる（すぐ届くように）
 */
const VERSION = "v11";
const PAGES = `trends-pages-${VERSION}`;
const BUILD = `trends-build-${VERSION}`;
const ART = `trends-art-${VERSION}`;
const FONTS = `trends-fonts-${VERSION}`;
const KEEP = [PAGES, BUILD, ART, FONTS];
const API_PREFIXES = ["/cards", "/health", "/auth", "/matches", "/me", "/rankings", "/logs", "/socket.io"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("trends-") && !KEEP.includes(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** 画面を待つ長さ。これを過ぎたら、前に保存した画面を先に出す */
const PAGE_WAIT_MS = 1000;

/**
 * 画面（HTML）：ネットを先に。ただし PAGE_WAIT_MS たっても返事が無ければ、前に保存した画面を先に出す
 * （眠っていたサーバーが起きるまで、白い画面ではなく、起きるまでのローディングを出すため）。
 * ネットの返事は、あとから届いても保存する（次に開いたときに使う）
 */
async function pageFirst(event, cacheName, fallbackUrl) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const net = fetch(request).then((res) => {
    if (res.ok) cache.put(fallbackUrl ?? request, res.clone());
    return res;
  });
  event.waitUntil(net.catch(() => {}));
  const saved = async () => (await cache.match(request)) ?? (fallbackUrl && (await cache.match(fallbackUrl)));
  const late = new Promise((r) => setTimeout(r, PAGE_WAIT_MS, "late"));
  try {
    const first = await Promise.race([net, late]);
    if (first !== "late") return first;
    return (await saved()) ?? (await net);
  } catch (err) {
    const hit = await saved();
    if (hit) return hit;
    throw err;
  }
}

/** 保存したものを先に。無ければネットから取って保存 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

/** 保存したものをすぐ出し、裏で取り替える */
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  // 裏で取りに行くときは、ブラウザの HTTP キャッシュを通さずサーバーに確かめる（差し替えた絵が古いまま残らないように）
  const fresh = fetch(event.request, { cache: "no-cache" })
    .then((res) => {
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Google のフォント
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (API_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return;

  if (request.mode === "navigate") {
    // 試作の HTML はそのまま。それ以外の画面は1つの index.html（SPA）
    const fallback = url.pathname.startsWith("/prototypes/") ? undefined : "/";
    event.respondWith(pageFirst(event, PAGES, fallback));
    return;
  }
  if (url.pathname.startsWith("/assets/cards/")) {
    event.respondWith(staleWhileRevalidate(event, ART));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, BUILD));
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event, PAGES));
  }
});
