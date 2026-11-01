import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";
import { APPLE_ROOT_CA_G3 } from "./apple-root-ca";

/** アプリの Bundle ID と、買い切りの商品 ID（App Store Connect に同じ ID で作る） */
export const BUNDLE_ID = "com.kakuremiino.trends";
export const UNLOCK_PRODUCT = "com.kakuremiino.trends.unlock";

/** App Store が署名した購入の中身のうち、使うところ */
export interface VerifiedPurchase {
  productId: string;
  originalTransactionId: string;
  environment: string;
  revoked: boolean;
}

/** 署名を確かめて中身を返す。確かめられなければ例外を投げる（テストでは差し替える） */
export interface PurchaseVerifier {
  verify(jws: string): Promise<VerifiedPurchase>;
}
export const PURCHASE_VERIFIER = Symbol("PURCHASE_VERIFIER");

/**
 * 本物の確かめ（Apple のライブラリ）。審査の人の購入は Sandbox で届くので、本番のサーバーでも両方を試す。
 * Production は APPLE_APP_ID（App Store Connect の Apple ID。数字）が要る。アプリを作るまでは Sandbox だけ
 */
export class AppleVerifier implements PurchaseVerifier {
  private verifiers = (() => {
    const roots = [Buffer.from(APPLE_ROOT_CA_G3, "base64")];
    const make = (env: Environment, appId?: number) =>
      new SignedDataVerifier(roots, false, env, BUNDLE_ID, appId);
    const appId = Number(process.env.APPLE_APP_ID) || undefined;
    return appId
      ? [make(Environment.PRODUCTION, appId), make(Environment.SANDBOX)]
      : [make(Environment.SANDBOX)];
  })();

  async verify(jws: string): Promise<VerifiedPurchase> {
    let last: unknown;
    for (const v of this.verifiers) {
      try {
        const p = await v.verifyAndDecodeTransaction(jws);
        if (!p.productId || !p.originalTransactionId) throw new Error("購入の中身が足りません");
        return {
          productId: p.productId,
          originalTransactionId: p.originalTransactionId,
          environment: String(p.environment ?? ""),
          revoked: p.revocationDate != null,
        };
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }
}
