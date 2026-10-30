import { randomBytes } from "node:crypto";
import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { appSettings } from "../db/schema";
import { AuthController, ProfileController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

/**
 * ログインのトークンに署名する鍵。
 * SESSION_SECRET があればそれを使い、無ければ初回起動時に作って DB に保存する（人が鍵を扱わなくてよい）。
 */
async function sessionSecret(db: Db) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const key = "session_secret";
  await db
    .insert(appSettings)
    .values({ key, value: randomBytes(48).toString("base64url") })
    .onConflictDoNothing();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  if (!row) throw new Error("ログインの鍵を用意できませんでした");
  return row.value;
}

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [DB],
      // 鍵は最初に使うとき（ログインを確かめる・作るとき）に読む。起動時に読むと、眠っている DB が起きるまで
      // サーバーが画面を返せず、白い画面が長くなるため（main.ts）。読めなかったら、次に使うときに読み直す
      useFactory: (db: Db) => {
        let secret: Promise<string> | null = null;
        return {
          secretOrKeyProvider: () => {
            secret ??= sessionSecret(db).catch((e) => {
              secret = null;
              throw e;
            });
            return secret;
          },
          signOptions: { expiresIn: "30d" },
        };
      },
    }),
  ],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
