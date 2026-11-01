import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { PublicUser } from "../auth/auth.service";
import { PurchaseService } from "./purchase.service";

/** 買い切り（iOS のアプリ内課金）。買ったとき・購入を復元したときに、アプリが購入の情報を送る */
@Controller("me")
@UseGuards(AuthGuard)
export class PurchaseController {
  constructor(private readonly purchase: PurchaseService) {}

  /** 新しいトークンとユーザーを返す（復元では、元のアカウントに入れ替わる） */
  @Post("purchase")
  @HttpCode(200)
  apply(@Req() req: { user: PublicUser }, @Body() body: { jws?: unknown }) {
    return this.purchase.apply(req.user.id, body?.jws);
  }
}
