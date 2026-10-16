export type Rarity = "UR" | "SEC" | "SP" | "SR" | "R" | "C";
export type Theme = "light" | "crimson" | "water";
export type Keyword = "速攻";

/** カード1枚の定義。ゲームのルールと表示の両方がここを参照する */
export interface CardDef {
  id: string;
  name: string;
  epithet: string;
  rarity: Rarity;
  cost: number;
  power: number;
  tribe: string;
  keywords?: Keyword[];
  effect: string;
  flavor: string;
  number?: string;
  serial?: string;
  /** web の public からのパス */
  art: string;
  subject: string;
  /** 印刷用の元画像（リポジトリ直下からのパス） */
  original: string;
  theme: Theme;
}
