import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "./auth.guard";
import { AuthService, authConfig, type PublicUser } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 画面がログインボタンを出すための設定（クライアント ID は公開してよい値） */
  @Get("config")
  config() {
    return authConfig();
  }

  @Post("google")
  google(@Body() body: { credential?: string }) {
    if (!body?.credential) throw new BadRequestException("credential がありません");
    return this.auth.loginWithGoogle(body.credential);
  }

  @Post("dev")
  dev(@Body() body: { name?: string }) {
    return this.auth.loginForDev(body?.name ?? "");
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: { user: PublicUser }) {
    return req.user;
  }
}
