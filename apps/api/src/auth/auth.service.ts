import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { type UserRow, users } from "../db/schema";

/** クライアントに渡すユーザー情報 */
export interface PublicUser {
  id: string;
  name: string;
  picture: string | null;
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

export const toPublic = (u: UserRow): PublicUser => ({ id: u.id, name: u.name, picture: u.picture });

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
    const user = await this.upsert(
      `google:${payload.sub}`,
      payload.name ?? "プレイヤー",
      payload.picture ?? null,
    );
    return this.session(user);
  }

  /** 開発用：名前だけでログインする */
  async loginForDev(name: string) {
    if (!authConfig().devLogin) throw new ForbiddenException("開発用ログインは使えません");
    const clean = name.trim().slice(0, 20);
    if (!clean) throw new UnauthorizedException("名前を入れてください");
    const user = await this.upsert(`dev:${clean}`, clean, null);
    return this.session(user);
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

  private async upsert(sub: string, name: string, picture: string | null) {
    const [row] = await this.db
      .insert(users)
      .values({ sub, name, picture })
      .onConflictDoUpdate({ target: users.sub, set: { name, picture } })
      .returning();
    if (!row) throw new Error("ユーザーを保存できませんでした");
    return row;
  }

  private async session(user: UserRow) {
    const token = await this.jwt.signAsync({ sub: user.id, name: user.name } satisfies SessionPayload);
    return { token, user: toPublic(user) };
  }
}
