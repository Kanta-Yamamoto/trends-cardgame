import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AuthService, type PublicUser } from "./auth.service";

/** Authorization: Bearer <token> を確かめ、req.user にユーザーを入れる */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request & { user?: PublicUser }>();
    const header = req.headers.authorization ?? "";
    const user = await this.auth.verify(header.startsWith("Bearer ") ? header.slice(7) : undefined);
    if (!user) throw new UnauthorizedException("ログインしてください");
    req.user = user;
    return true;
  }
}
