import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { LogsService } from "./logs.service";

/**
 * CPU 対戦の記録。ログインは要らない（CPU 対戦はログインしなくても遊べる）。
 * 公開前は、招待リンクの守り（security.ts）の内側にある
 */
@Controller("logs")
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Post("cpu-games")
  add(@Body() body: unknown) {
    return this.logs.addCpuGame(body);
  }

  /** 取り出し（分析用）。after より後の記録を古い順に */
  @Get("cpu-games")
  list(@Query("after") after?: string, @Query("limit") limit?: string) {
    return this.logs.listCpuGames(after, limit);
  }
}
