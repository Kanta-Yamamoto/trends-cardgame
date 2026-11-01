import { registerPlugin } from "@capacitor/core";

/**
 * 買い切りのアプリ内課金（ios/App/App/TrendsStorePlugin.swift）。
 * jws は App Store が署名した購入の情報で、サーバーがこれを確かめて解放する。やめたとき・保留のときは null
 */
interface TrendsStore {
  /** 端末の国の通貨で表した値段（例「¥480」） */
  product(): Promise<{ price: string | null }>;
  buy(): Promise<{ jws: string | null }>;
  restore(): Promise<{ jws: string | null }>;
}

export const Store = registerPlugin<TrendsStore>("TrendsStore");
