import { Module } from "@nestjs/common";
import { CardsModule } from "./cards/cards.module";
import { DbModule } from "./db/db.module";
import { HealthController } from "./health.controller";

@Module({ imports: [DbModule, CardsModule], controllers: [HealthController] })
export class AppModule {}
