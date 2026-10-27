import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { GachaService } from "./gacha.service";

/** ガチャとジェム・持っているカード（10月27日。ジェムを買うのは決済の準備ができてから、本物のガチャは GACHA_OPEN のときだけ） */
@Controller()
@UseGuards(AuthGuard)
export class GachaController {
  constructor(private readonly gacha: GachaService) {}

  /** 自分のジェム（有償・無償） */
  @Get("me/wallet")
  wallet(@Req() req: { user: PublicUser }) {
    return this.gacha.wallet(req.user.id);
  }

  /** 自分の持っているカード（ID ごとの枚数）。カード一覧の灰色・枚数と、レンタルデッキの見分けに使う */
  @Get("me/cards")
  async cards(@Req() req: { user: PublicUser }) {
    return { cards: await this.gacha.collection(req.user.id) };
  }

  /** パックを開ける（packs は 1 か 10）。出たカードと、使ったあとのジェムを返す */
  @Post("gacha/open")
  @HttpCode(200)
  open(@Req() req: { user: PublicUser }, @Body() body: { packs?: unknown }) {
    return this.gacha.open(req.user.id, body?.packs);
  }
}
