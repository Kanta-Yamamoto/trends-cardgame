import { CARDS } from "@trends/cards";
import type { cards } from "./schema";

/** packages/cards の定義を DB の行に変換する */
export function cardRows(): (typeof cards.$inferInsert)[] {
  return CARDS.map((c) => ({
    id: c.id,
    name: c.name,
    epithet: c.epithet,
    type: c.type,
    rarity: c.rarity,
    cost: c.cost,
    attack: c.attack ?? null,
    hp: c.hp ?? null,
    attributes: c.attributes,
    kaiwai: c.kaiwai,
    keywords: c.keywords,
    effects: c.effects,
    target: c.target ?? null,
    targetKaiwai: c.targetKaiwai ?? null,
    effect: c.effect,
    flavor: c.flavor,
    number: c.number ?? null,
    serial: c.serial ?? null,
    art: c.art ?? null,
    subject: c.subject ?? null,
    original: c.original ?? null,
    dark: c.dark ?? null,
    token: c.token ?? false,
  }));
}
