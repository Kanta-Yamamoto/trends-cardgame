import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AppleVerifier, PURCHASE_VERIFIER } from "./apple";
import { PurchaseController } from "./purchase.controller";
import { PurchaseService } from "./purchase.service";

@Module({
  imports: [AuthModule],
  controllers: [PurchaseController],
  providers: [PurchaseService, { provide: PURCHASE_VERIFIER, useFactory: () => new AppleVerifier() }],
})
export class PurchaseModule {}
