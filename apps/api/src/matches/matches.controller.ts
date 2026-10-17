import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { MatchesService } from "./matches.service";

@Controller("matches")
@UseGuards(AuthGuard)
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /** 部屋を作る。返した合言葉を相手に伝えて入ってもらう */
  @Post()
  create(@Req() req: { user: PublicUser }, @Body() body: { deck?: string }) {
    return this.matches.create(req.user.id, body?.deck);
  }

  /** 部屋の様子（だれが入っているか） */
  @Get(":code")
  async get(@Param("code") code: string) {
    return this.matches.info(await this.matches.find(code));
  }
}
