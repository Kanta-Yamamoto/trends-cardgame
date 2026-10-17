/** デモ用の構築済みデッキ（25枚、同じカードは3枚まで） */
const build = (spec: Record<string, number>): string[] =>
  Object.entries(spec).flatMap(([id, n]) => Array.from({ length: n }, () => id));

export const DECKS = {
  /** 炎上×草：数で押して、同じ相手を叩き続ける */
  flame: build({ f1: 3, f2: 3, f3: 3, f4: 2, f5: 2, c2: 2, k2: 2, k1: 3, k3: 2, k4: 1, k5: 2 }),
  /** メロい×癒し：推しを育てて、守って、癒やす */
  idol: build({ i1: 2, m3: 3, m2: 3, i2: 3, i3: 2, m4: 2, m5: 2, i4: 2, c3: 2, m1: 2, i5: 1, i6: 1 }),
  /** 神×癒し：情報で相手を崩し、守りながら引き続ける */
  expert: build({ g1: 3, g2: 3, g3: 2, g4: 2, c1: 2, i1: 2, i3: 2, i2: 3, i4: 2, m4: 2, f4: 2 }),
};
export type DeckId = keyof typeof DECKS;
