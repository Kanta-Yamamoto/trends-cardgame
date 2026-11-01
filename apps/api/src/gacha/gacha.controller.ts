import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { GachaService } from "./gacha.service";

/** ガチャと持っているカード（11月1日からジェムをやめ、買い切りのあとに配るパックを開ける形に） */
@Controller()
@UseGuards(AuthGuard)
export class GachaController {
  constructor(private readonly gacha: GachaService) {}

  /** 買い切りを買ったか・今開けられるパックの数 */
  @Get("me/access")
  access(@Req() req: { user: PublicUser }) {
    return this.gacha.access(req.user.id);
  }

  /** 自分の持っているカード（ID ごとの枚数）。カード一覧の灰色・枚数と、デッキに入れられるカードの見分けに使う */
  @Get("me/cards")
  async cards(@Req() req: { user: PublicUser }) {
    return { cards: await this.gacha.collection(req.user.id) };
  }

  /** パックを開ける。出たカードと、開けたあとの access を返す */
  @Post("gacha/open")
  @HttpCode(200)
  open(@Req() req: { user: PublicUser }, @Body() body: { packs?: unknown }) {
    return this.gacha.open(req.user.id, body?.packs);
  }
}
