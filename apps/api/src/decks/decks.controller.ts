import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { DecksService } from "./decks.service";

/** 自分で組んだデッキを、ログインしたアカウントに保存する（画面の /decks と道が重ならないよう /me の下に置く） */
@Controller("me/decks")
@UseGuards(AuthGuard)
export class DecksController {
  constructor(private readonly decks: DecksService) {}

  @Get()
  list(@Req() req: { user: PublicUser }) {
    return this.decks.list(req.user.id);
  }

  @Put()
  replace(@Req() req: { user: PublicUser }, @Body() body: unknown) {
    return this.decks.replace(req.user.id, body);
  }
}
