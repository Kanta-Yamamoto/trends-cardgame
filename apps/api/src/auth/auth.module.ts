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
      useFactory: async (db: Db) => ({ secret: await sessionSecret(db), signOptions: { expiresIn: "30d" } }),
    }),
  ],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
