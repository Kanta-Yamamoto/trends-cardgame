import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CardsModule } from "./cards/cards.module";
import { DbModule } from "./db/db.module";
import { DecksModule } from "./decks/decks.module";
import { HealthController } from "./health.controller";
import { MatchesModule } from "./matches/matches.module";
import { RankingModule } from "./ranking/ranking.module";

@Module({
  imports: [DbModule, CardsModule, AuthModule, MatchesModule, DecksModule, RankingModule],
  controllers: [HealthController],
})
export class AppModule {}
