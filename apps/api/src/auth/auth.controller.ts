import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
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

  /** 自分の今の情報（DB から。名前を決めたか・今の名前）。アカウントが消えていたらログインし直し */
  @Get("me")
  @UseGuards(AuthGuard)
  async me(@Req() req: { user: PublicUser }) {
    const user = await this.auth.profile(req.user.id);
    if (!user) throw new UnauthorizedException("ログインしてください");
    return user;
  }
}

/** プレイヤー名（初期登録・マイページ） */
@Controller("me")
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly auth: AuthService) {}

  /** 名前を決める・変える。新しいトークンとユーザーを返す */
  @Put("name")
  rename(@Req() req: { user: PublicUser }, @Body() body: { name?: unknown }) {
    if (typeof body?.name !== "string") throw new BadRequestException("名前を入れてください");
    return this.auth.rename(req.user.id, body.name);
  }
}
