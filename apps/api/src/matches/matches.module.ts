import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MatchesController } from "./matches.controller";
import { MatchesGateway } from "./matches.gateway";
import { MatchesService } from "./matches.service";

@Module({
  imports: [AuthModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchesGateway],
  exports: [MatchesGateway],
})
export class MatchesModule {}
