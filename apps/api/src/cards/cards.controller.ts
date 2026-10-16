import { Controller, Get, Param } from "@nestjs/common";
import { CardsService } from "./cards.service";

@Controller("cards")
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  findAll() {
    return this.cards.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.cards.findOne(id);
  }
}
