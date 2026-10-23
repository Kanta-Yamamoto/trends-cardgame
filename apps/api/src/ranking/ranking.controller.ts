import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { RankingService } from "./ranking.service";

@Controller()
@UseGuards(AuthGuard)
export class RankingController {
  constructor(private readonly ranking: RankingService) {}

  /** ランキング（10 分ごとの集計）と、自分の順位 */
  @Get("rankings")
  board(@Req() req: { user: PublicUser }) {
    return this.ranking.board(req.user.id);
  }

  /** 自分の今のレーティング */
  @Get("me/rating")
  rating(@Req() req: { user: PublicUser }) {
    return this.ranking.ratingOf(req.user.id);
  }
}
