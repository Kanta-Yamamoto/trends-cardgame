import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { checkPlayerName } from "@trends/game-core";
import { eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { gemLogs, type UserRow, users } from "../db/schema";
import { WELCOME_GEMS } from "../gacha/gems";

/** クライアントに渡すユーザー情報 */
export interface PublicUser {
  id: string;
  name: string;
  picture: string | null;
  /** 本人がプレイヤー名を決めたか（false なら画面は初期登録だけを出す）。トークンから取り出したときは持たない */
  nameSet?: boolean;
}

/** トークンの中身 */
interface SessionPayload {
  sub: string;
  name: string;
}

export const authConfig = () => ({
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  /** Google を使わずに名前だけでログインできる（手元の開発とテスト用。本番では false） */
  devLogin: process.env.AUTH_DEV_LOGIN === "true",
});

export const toPublic = (u: UserRow): PublicUser => ({
  id: u.id,
  name: u.name,
  picture: u.picture,
  nameSet: u.nameSet,
});

/** 名前を決める前の仮の名前（Google の名前は本名のことが多いので、ランキングなどに出さない） */
const FIRST_NAME = "プレイヤー";

@Injectable()
export class AuthService {
  private google = new OAuth2Client();

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly jwt: JwtService,
  ) {}

  /** Google の ID トークンを確かめて、ユーザーを登録（または更新）する */
  async loginWithGoogle(credential: string) {
    const { googleClientId } = authConfig();
    if (!googleClientId) throw new ForbiddenException("Google ログインは設定されていません");
    let payload: { sub?: string; name?: string; picture?: string } | undefined;
    try {
      const ticket = await this.google.verifyIdToken({ idToken: credential, audience: googleClientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("Google のログイン情報を確認できませんでした");
    }
    if (!payload?.sub) throw new UnauthorizedException("Google のログイン情報を確認できませんでした");
    // 名前は本人が初期登録で決める。Google の名前では作らず、入り直しても上書きしない
    const [row] = await this.db
      .insert(users)
      .values({ sub: `google:${payload.sub}`, name: FIRST_NAME, picture: payload.picture ?? null })
      .onConflictDoUpdate({ target: users.sub, set: { picture: payload.picture ?? null } })
      .returning();
    if (!row) throw new Error("ユーザーを保存できませんでした");
    return this.session(row);
  }

  /** 開発用：名前だけでログインする */
  async loginForDev(name: string) {
    if (!authConfig().devLogin) throw new ForbiddenException("開発用ログインは使えません");
    const clean = name.trim().slice(0, 20);
    if (!clean) throw new UnauthorizedException("名前を入れてください");
    // 開発用は、入れた名前をそのままプレイヤー名にする（初期登録は通らない）
    const [row] = await this.db
      .insert(users)
      .values({ sub: `dev:${clean}`, name: clean, nameSet: true, picture: null })
      .onConflictDoUpdate({ target: users.sub, set: { name: clean, nameSet: true } })
      .returning();
    if (!row) throw new Error("ユーザーを保存できませんでした");
    return this.session(row);
  }

  /** そのユーザーの今の情報（名前を決めたか など）。消えたアカウントなら null */
  async profile(userId: string): Promise<PublicUser | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, userId));
    return row ? toPublic(row) : null;
  }

  /**
   * プレイヤー名を決める・変える。初めて決めたときは、無償のジェムを配る（welcomeGems で返す）。
   * 名前はトークンにも入っているので、新しいトークンを返す
   */
  async rename(userId: string, raw: string) {
    const check = checkPlayerName(raw);
    if (!check.ok) throw new BadRequestException(check.reason);
    let welcomeGems = 0;
    const row = await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
      if (!before) throw new UnauthorizedException("ログインしてください");
      const first = !before.nameSet;
      const [after] = await tx
        .update(users)
        .set({
          name: check.name,
          nameSet: true,
          ...(first ? { gemsFree: before.gemsFree + WELCOME_GEMS } : {}),
        })
        .where(eq(users.id, userId))
        .returning();
      if (first) {
        await tx.insert(gemLogs).values({ userId, free: WELCOME_GEMS, reason: "welcome" });
        welcomeGems = WELCOME_GEMS;
      }
      return after;
    });
    if (!row) throw new Error("名前を保存できませんでした");
    // welcomeGems：初めて決めたときに配ったジェム（画面の「ようこそ」で知らせる）
    return { ...(await this.session(row)), welcomeGems };
  }

  /** トークンからユーザーを取り出す。無効なら null */
  async verify(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    try {
      const p = await this.jwt.verifyAsync<SessionPayload>(token);
      return { id: p.sub, name: p.name, picture: null };
    } catch {
      return null;
    }
  }

  private async session(user: UserRow) {
    const token = await this.jwt.signAsync({ sub: user.id, name: user.name } satisfies SessionPayload);
    return { token, user: toPublic(user) };
  }
}
