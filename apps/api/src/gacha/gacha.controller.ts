import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { GachaService } from "./gacha.service";

/** ガチャとジェム（10月27日。ジェムを買うのは、決済の準備ができてから） */
@Controller()
@UseGuards(AuthGuard)
export class GachaController {
  constructor(private readonly gacha: GachaService) {}

  /** 自分のジェム（有償・無償） */
  @Get("me/wallet")
  wallet(@Req() req: { user: PublicUser }) {
    return this.gacha.wallet(req.user.id);
  }

  /** パックを開ける（packs は 1 か 10）。出たカードと、使ったあとのジェムを返す */
  @Post("gacha/open")
  @HttpCode(200)
  open(@Req() req: { user: PublicUser }, @Body() body: { packs?: unknown }) {
    return this.gacha.open(req.user.id, body?.packs);
  }
}
