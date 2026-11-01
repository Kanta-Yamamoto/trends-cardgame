import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CardsModule } from "./cards/cards.module";
import { DbModule } from "./db/db.module";
import { DecksModule } from "./decks/decks.module";
import { GachaModule } from "./gacha/gacha.module";
import { HealthController } from "./health.controller";
import { LogsModule } from "./logs/logs.module";
import { MatchesModule } from "./matches/matches.module";
import { PurchaseModule } from "./purchase/purchase.module";
import { RankingModule } from "./ranking/ranking.module";

@Module({
  imports: [
    DbModule,
    CardsModule,
    AuthModule,
    MatchesModule,
    DecksModule,
    RankingModule,
    LogsModule,
    GachaModule,
    PurchaseModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
