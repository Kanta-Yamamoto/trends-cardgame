import Capacitor
import StoreKit

/// 買い切りのアプリ内課金（StoreKit 2）。画面からの呼び出しは src/purchase/store.ts。
/// 署名された購入の情報（jws）を画面に返し、サーバー（POST /me/purchase）が確かめて解放する
@objc(TrendsStorePlugin)
public class TrendsStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrendsStorePlugin"
    public let jsName = "TrendsStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "product", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "buy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    /// App Store Connect に作る商品の ID（apps/api/src/purchase/apple.ts の UNLOCK_PRODUCT と同じ）
    private let productId = "com.kakuremiino.trends.unlock"

    /// 端末の国の通貨で表した値段
    @objc func product(_ call: CAPPluginCall) {
        Task {
            do {
                if let product = try await Product.products(for: [productId]).first {
                    call.resolve(["price": product.displayPrice])
                } else {
                    call.resolve(["price": NSNull()])
                }
            } catch {
                call.reject("商品を読み込めませんでした")
            }
        }
    }

    /// 買う。やめたとき・保護者の承認待ちのときは jws が null
    @objc func buy(_ call: CAPPluginCall) {
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("商品を読み込めませんでした")
                    return
                }
                switch try await product.purchase() {
                case .success(let result):
                    guard case .verified(let transaction) = result else {
                        call.reject("購入を確かめられませんでした")
                        return
                    }
                    await transaction.finish()
                    call.resolve(["jws": result.jwsRepresentation])
                case .userCancelled, .pending:
                    call.resolve(["jws": NSNull()])
                @unknown default:
                    call.resolve(["jws": NSNull()])
                }
            } catch {
                call.reject("購入できませんでした")
            }
        }
    }

    /// 購入を復元する。買っていなければ jws が null
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            // サインインをやめたときも、端末が持っている購入は見る
            try? await AppStore.sync()
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result, transaction.productID == productId {
                    call.resolve(["jws": result.jwsRepresentation])
                    return
                }
            }
            call.resolve(["jws": NSNull()])
        }
    }
}

/// アプリの中の画面。買い切りのプラグインをここで登録する
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrendsStorePlugin())
    }
}
