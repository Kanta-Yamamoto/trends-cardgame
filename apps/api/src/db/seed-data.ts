import { CARDS } from "@trends/cards";
import type { cards } from "./schema";

/** packages/cards の定義を DB の行に変換する */
export function cardRows(): (typeof cards.$inferInsert)[] {
  return CARDS.map((c) => ({
    id: c.id,
    name: c.name,
    epithet: c.epithet,
    rarity: c.rarity,
    cost: c.cost,
    power: c.power,
    tribe: c.tribe,
    keywords: c.keywords ?? [],
    effect: c.effect,
    flavor: c.flavor,
    number: c.number ?? null,
    serial: c.serial ?? null,
    art: c.art ?? null,
    subject: c.subject ?? null,
    theme: c.theme,
  }));
}
