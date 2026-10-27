import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GachaController } from "./gacha.controller";
import { GachaService } from "./gacha.service";

@Module({
  imports: [AuthModule],
  controllers: [GachaController],
  providers: [GachaService],
})
export class GachaModule {}
