import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

/** ログインのトークンに署名する鍵。本番では必ず SESSION_SECRET を設定する */
function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET が設定されていません");
  return "dev-only-secret";
}

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: sessionSecret(), signOptions: { expiresIn: "30d" } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
