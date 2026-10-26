import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { LogsService } from "./logs.service";

/**
 * CPU 対戦の記録。送るにはログインが要る（記録は遊んだアカウントにひも付ける）。
 * 取り出し（分析用）はログインなしで、公開前は招待リンクの守り（security.ts）の内側にある
 */
@Controller("logs")
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Post("cpu-games")
  @UseGuards(AuthGuard)
  add(@Req() req: { user: PublicUser }, @Body() body: unknown) {
    return this.logs.addCpuGame(req.user.id, body);
  }

  /** 取り出し（分析用）。after より後の記録を古い順に */
  @Get("cpu-games")
  list(@Query("after") after?: string, @Query("limit") limit?: string) {
    return this.logs.listCpuGames(after, limit);
  }
}
