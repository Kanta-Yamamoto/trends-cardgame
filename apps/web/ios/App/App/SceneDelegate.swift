import UIKit

/// iOS 27 の SDK で作るアプリは UIScene が必須で、無いと起動した瞬間に落ちる（Apple の TN3187）。
/// 窓は Info.plist の UISceneStoryboardFile（Main）から作られるので、ここでは持つだけでよい
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
}
