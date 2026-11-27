import type { IncomingMessage } from "node:http";
import {
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { hasInviteCookie } from "../security";
import { LogsService } from "./logs.service";

/**
 * 取り出しは、招待済みのクッキー（合言葉）を持つ人だけ。
 * 招待の守りはアプリの出どころ（capacitor://localhost）を通すが、Origin は名乗れば付けられるので、ここでは通さない
 */
@Injectable()
export class InviteCookieGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (hasInviteCookie(ctx.switchToHttp().getRequest<IncomingMessage>())) return true;
    throw new ForbiddenException("合言葉が要ります");
  }
}

/**
 * CPU 対戦の記録。送るにはログインが要る（記録は遊んだアカウントにひも付ける）。
 * 取り出し（分析用）はログインなしで、招待済みのクッキー（合言葉）を持つ人だけ（InviteCookieGuard）
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
  @UseGuards(InviteCookieGuard)
  list(@Query("after") after?: string, @Query("limit") limit?: string) {
    return this.logs.listCpuGames(after, limit);
  }
}
