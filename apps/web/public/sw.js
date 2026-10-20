/*
 * TRENDS のサービスワーカー（ホーム画面に追加したアプリを速く・電波が弱くても開けるようにする）
 * - 画面（HTML）：まずネットから取り、繋がらなければ前に保存したものを出す（更新がすぐ届く）
 * - ビルドした JS・CSS（名前にハッシュ付き）：一度取ったら保存したものを使う
 * - カードの絵：保存したものをすぐ出し、裏で新しいものに取り替える
 * - API・ログイン・オンライン対戦（Socket.IO）：いつもネット（保存しない）
 * 中身を変えたら VERSION を上げる（古い保存は消える）
 */
const VERSION = "v1";
const PAGES = `trends-pages-${VERSION}`;
const BUILD = `trends-build-${VERSION}`;
const ART = `trends-art-${VERSION}`;
const FONTS = `trends-fonts-${VERSION}`;
const KEEP = [PAGES, BUILD, ART, FONTS];
const API_PREFIXES = ["/cards", "/health", "/auth", "/matches", "/me", "/socket.io"];

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

/** ネットを先に。ダメなら保存したもの */
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackUrl ?? request, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(request)) ?? (fallbackUrl && (await cache.match(fallbackUrl)));
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
  const fresh = fetch(event.request)
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
    event.respondWith(networkFirst(request, PAGES, fallback));
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
