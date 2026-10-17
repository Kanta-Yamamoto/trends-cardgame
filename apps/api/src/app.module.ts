import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { CardsModule } from "./cards/cards.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";
import { MatchesModule } from "./matches/matches.module";

@Module({ imports: [DbModule, CardsModule, AuthModule, MatchesModule], controllers: [HealthController] })
export class AppModule {}
