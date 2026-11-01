import "reflect-metadata";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller, Get, Module, Put } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APP_ORIGIN,
  clientIp,
  corsOrigins,
  INVITE_COOKIE,
  inviteForClient,
  type Limits,
  protect,
  RateLimiter,
} from "../src/security";
import { serveWeb } from "../src/web";

@Controller()
class FakeApi {
  @Get("cards") cards() {
    return [{ id: "c1" }];
  }
  @Get("health") health() {
    return { status: "ok" };
  }
  @Get("auth/config") config() {
    return { devLogin: false };
  }
  // AuthController の GET /auth/invite と同じ中身
  @Get("auth/invite") invite() {
    return inviteForClient();
  }
  @Put("me/decks") save() {
    return { ok: true };
  }
}

@Module({ controllers: [FakeApi] })
class FakeModule {}

// 公開前の守り（招待リンク・回数の制限・安全のヘッダー）。DB は使わない
describe("protect", () => {
  let app: NestExpressApplication;
  const dir = mkdtempSync(join(tmpdir(), "web-"));
  const limits: Limits = {
    all: new RateLimiter(1000, 60_000),
    write: new RateLimiter(3, 60_000),
    invite: new RateLimiter(3, 60_000),
  };
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.INVITE_CODE = "open-sesame";
    writeFileSync(join(dir, "index.html"), "<head><title>TRENDS</title></head><div id=root>");
    writeFileSync(join(dir, "app.js"), "//");
    writeFileSync(join(dir, "ogp.jpg"), "jpg");
    writeFileSync(join(dir, "privacy.html"), "<title>プライバシーポリシー</title>");
    writeFileSync(join(dir, "support.html"), "<title>サポート</title>");
    const mod = await Test.createTestingModule({ imports: [FakeModule] }).compile();
    app = mod.createNestApplication<NestExpressApplication>();
    protect(app, limits);
    serveWeb(app, dir);
    await app.init();
  });

  afterAll(async () => {
    delete process.env.INVITE_CODE;
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const cookieOf = (res: request.Response) =>
    String(res.headers["set-cookie"]?.[0] ?? "").split(";")[0] ?? "";

  it("招待されていない人には「準備中」の画面だけを出し、API も断る", async () => {
    const page = await http().get("/").set("Accept", "text/html");
    expect(page.status).toBe(403);
    expect(page.text).toContain("準備中");
    expect(page.text).not.toContain("id=root");
    expect(page.headers["cache-control"]).toBe("no-store");
    await http().get("/cards").expect(403);
    await http().get("/app.js").expect(403);
    await http().put("/me/decks").expect(403);
  });

  it("死活の確認・robots.txt・ログインの設定・プレビューの絵は、招待なしでも見られる", async () => {
    await http().get("/health").expect(200);
    await http().get("/auth/config").expect(200);
    await http().get("/ogp.jpg").expect(200);
    const robots = await http().get("/robots.txt").expect(200);
    // 検索エンジンは全部お断り。リンクのプレビューを作るロボット（X など）だけ通す
    expect(robots.text).toContain("User-agent: *\nDisallow: /");
    expect(robots.text).toContain("User-agent: Twitterbot\nAllow: /");
  });

  it("合言葉付きの URL で開くと、クッキーを置いてそのまま画面を返し、そのあとは全部使える", async () => {
    const res = await http().get("/online/AB12?invite=open-sesame").set("Accept", "text/html");
    // 開き直させない（クッキーを持ち越さないプレビューのロボットにも、画面とプレビューが届くように）
    expect(res.status).toBe(200);
    expect(res.text).toContain("id=root");
    expect(res.text).toContain('property="og:title" content="TRENDS のオンライン対戦に誘われました"');
    expect(res.headers["cache-control"]).toBe("no-store");
    const set = String(res.headers["set-cookie"]?.[0] ?? "");
    expect(set).toContain(`${INVITE_COOKIE}=`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    // クッキーには合言葉そのものを入れない
    expect(set).not.toContain("open-sesame");
    const cookie = cookieOf(res);
    const page = await http().get("/online").set("Accept", "text/html").set("Cookie", cookie);
    expect(page.status).toBe(200);
    expect(page.text).toContain("id=root");
    await http().get("/cards").set("Cookie", cookie).expect(200);
    await http().get("/app.js").set("Cookie", cookie).expect(200);
    // 招待済みの人は、部屋のリンクに付ける合言葉を受け取れる（招待されていない人は受け取れない）
    const inv = await http().get("/auth/invite").set("Cookie", cookie).expect(200);
    expect(inv.body.invite).toBe("open-sesame");
    await http().get("/auth/invite").expect(403);
  });

  it("招待リンクは、招待のプレビュー（題名・絵）を付けて返す", async () => {
    const res = await http()
      .get("/?invite=open-sesame")
      .set("Accept", "text/html")
      .set("Host", "trends.example")
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-For", "192.0.2.50");
    expect(res.status).toBe(200);
    expect(res.text).toContain('property="og:title" content="TRENDS に招待されました"');
    expect(res.text).toContain('property="og:image" content="https://trends.example/ogp.jpg?v=2"');
    expect(res.text).toContain('name="twitter:card" content="summary_large_image"');
    // 合言葉そのものは、プレビューにも書かない
    expect(res.text).not.toContain("open-sesame");
  });

  it("違う合言葉やクッキーは通さず、間違いが続くと断る", async () => {
    const ip = "203.0.113.9";
    const wrong = await http().get("/?invite=nope").set("X-Forwarded-For", ip).set("Accept", "text/html");
    expect(wrong.status).toBe(403);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
    await http().get("/cards").set("Cookie", `${INVITE_COOKIE}=forged`).expect(403);
    await http().get("/?invite=nope2").set("X-Forwarded-For", ip);
    await http().get("/?invite=nope3").set("X-Forwarded-For", ip);
    // 3回間違えたあとは、正しい合言葉でもしばらく断る（総当たりを止める）
    await http().get("/?invite=open-sesame").set("X-Forwarded-For", ip).expect(429);
  });

  it("iOS アプリからの呼び出しは、招待なしで通す", async () => {
    await http().get("/cards").set("Origin", "capacitor://localhost").expect(200);
    await http().get("/cards").set("Origin", "https://example.com").expect(403);
  });

  it("審査に要る公開のページは、招待なしでも見られる", async () => {
    await http().get("/privacy.html").expect(200);
    await http().get("/support.html").expect(200);
  });

  it("合言葉を変えると、前のクッキーは使えなくなる", async () => {
    const res = await http().get("/?invite=open-sesame");
    const cookie = cookieOf(res);
    process.env.INVITE_CODE = "new-word";
    try {
      await http().get("/cards").set("Cookie", cookie).expect(403);
    } finally {
      process.env.INVITE_CODE = "open-sesame";
    }
  });

  it("書き込みは回数を制限する", async () => {
    const cookie = cookieOf(await http().get("/?invite=open-sesame").set("X-Forwarded-For", "198.51.100.1"));
    const put = () => http().put("/me/decks").set("Cookie", cookie).set("X-Forwarded-For", "198.51.100.1");
    for (let i = 0; i < 3; i++) await put().expect(200);
    const res = await put();
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
  });

  it("安全のためのヘッダーと、検索エンジンに載せない指示を付ける", async () => {
    const res = await http().get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-robots-tag"]).toContain("noindex");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("合言葉が入っていなければ、守りは効かない（手元の開発やテスト）", async () => {
    delete process.env.INVITE_CODE;
    try {
      await http().get("/cards").expect(200);
    } finally {
      process.env.INVITE_CODE = "open-sesame";
    }
  });
});

describe("corsOrigins", () => {
  it("出どころを絞っていても、iOS アプリは許す", () => {
    expect(corsOrigins("https://a.example,https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
      APP_ORIGIN,
    ]);
  });

  it("絞っていなければ、全部許す", () => {
    expect(corsOrigins(undefined)).toBe(true);
    expect(corsOrigins("")).toBe(true);
  });
});

describe("clientIp", () => {
  it("X-Forwarded-For の最後（Cloud Run が足した値）を使う", () => {
    const req = { headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.5" }, socket: {} } as never;
    expect(clientIp(req)).toBe("203.0.113.5");
  });
});

describe("RateLimiter", () => {
  it("枠の時間が過ぎると、また数え直す", () => {
    let t = 0;
    const r = new RateLimiter(2, 1000, () => t);
    expect(r.take("a")).toBe(0);
    expect(r.take("a")).toBe(0);
    expect(r.take("a")).toBeGreaterThan(0);
    expect(r.take("b")).toBe(0);
    t = 1000;
    expect(r.take("a")).toBe(0);
  });
});
