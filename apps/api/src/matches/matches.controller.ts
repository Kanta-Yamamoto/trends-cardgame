import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { MatchesGateway } from "./matches.gateway";
import { MatchesService } from "./matches.service";

@Controller()
@UseGuards(AuthGuard)
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly gateway: MatchesGateway,
  ) {}

  /** 部屋を作る。返した合言葉を相手に伝えて入ってもらう */
  @Post("matches")
  create(@Req() req: { user: PublicUser }, @Body() body: { deck?: string }) {
    return this.matches.create(req.user.id, body?.deck);
  }

  /**
   * 自分の決着していない対戦（通信が切れても、ここから同じ部屋に戻る）。無ければ match は null。
   * closesIn は、2 人とも抜けているときの、対戦を閉じるまでの残り（ミリ秒。だれかつないでいれば null）
   */
  @Get("me/match")
  current(@Req() req: { user: PublicUser }) {
    return this.gateway.resumable(req.user.id);
  }

  /** 部屋の様子（だれが入っているか） */
  @Get("matches/:code")
  async get(@Param("code") code: string) {
    return this.matches.info(await this.matches.find(code));
  }
}
