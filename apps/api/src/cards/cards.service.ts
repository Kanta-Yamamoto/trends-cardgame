import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB } from "../db/db.module";
import { cards } from "../db/schema";

@Injectable()
export class CardsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  findAll() {
    return this.db.select().from(cards).orderBy(asc(cards.id));
  }

  async findOne(id: string) {
    const [card] = await this.db.select().from(cards).where(eq(cards.id, id));
    if (!card) throw new NotFoundException(`card ${id} not found`);
    return card;
  }
}
