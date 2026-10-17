# オンライン対戦

友だちどうしで試す規模を前提にした、いちばん簡単な作り。広げるときの拡張は最後に書く。

## 流れ

1. Google でログインする（`POST /auth/google`）。API は Google の ID トークンを確かめ、ユーザーを `users` に登録して、自前のトークン（30日）を返す
2. 部屋を作る（`POST /matches`、デッキを選ぶ）。6文字の合言葉ができる
3. 合言葉か招待リンク（`/online/合言葉`）を友だちに送る。友だちがデッキを選んで入ると対戦が始まる
4. 操作は Socket.IO でサーバーに送り、サーバーが `applyAction` でルールを判定して、2人に結果を送る
5. 画面を閉じても、同じ部屋を開き直せば続きから遊べる（対戦の状態は `matches.state` に保存）

## 通信（Socket.IO）

接続するときに `auth.token` にログインのトークンを入れる。

| クライアント → サーバー | 内容 |
|---|---|
| `join` `{ code, deck? }` | 部屋に入る。2人目は `deck` が必要。すでに参加している人は再接続 |
| `action` `{ code, action }` | 操作（`play` / `cast` / `attack` / `endTurn`）。反則なら返事が `{ ok: false, error }` |
| `resign` `{ code }` | 降参 |

| サーバー → クライアント | 内容 |
|---|---|
| `match` | 部屋の様子（自分・相手の名前とデッキ、対戦の状態） |
| `update` | 1手分（操作・出来事・操作後の状態） |

## 見せる情報

- どちらの人にも、**自分が p1** になるように入れ替えて送る（画面は CPU 戦と同じ作りのまま使える）。`packages/game-core/src/view.ts`
- 相手の手札、両者の山札の中身、乱数の種は送らない（枚数だけ分かる）。相手が引いたカードの出来事も隠す
- ルールの判定はすべてサーバー。クライアントは見た目だけ

## 手元で試す

```sh
# apps/api/.env に AUTH_DEV_LOGIN=true を足すと、名前だけでログインできる
pnpm dev
# ブラウザを2つ（片方はシークレットウィンドウ）開いて http://localhost:5173/online
```

## Google ログインの準備（本番）

1. Google Cloud コンソール → 「API とサービス」→「OAuth 同意画面」を作る（外部・テスト中のままでよい。テストユーザーに遊ぶ人の Gmail を足す）
2. 「認証情報」→「OAuth クライアント ID」→ 種類は「ウェブ アプリケーション」。「承認済みの JavaScript 生成元」に Web の URL（例：`https://trends.example.com`、手元なら `http://localhost:5173`）を入れる
3. できたクライアント ID を API の `GOOGLE_CLIENT_ID` に入れる（Terraform の `google_client_id`）。画面は `/auth/config` から受け取るので、Web 側の設定は要らない
4. `SESSION_SECRET` に長いランダムな値を入れ、`AUTH_DEV_LOGIN` は入れない（false）

## 今の割り切りと、広げるとき

- 部屋の操作の順番待ちと WebSocket の部屋はサーバー1台のメモリにある → Cloud Run は最大1台。台数を増やすときは Socket.IO の Redis アダプターと、DB の行ロック（または楽観ロック）に替える
- 持ち時間・放置負けは無い（友だちどうしの想定）。必要になったらターンの制限時間をサーバーで持つ
- ランダムマッチ・戦績・フレンドは無い。`matches` に結果（`winner_id`）は残しているので、戦績はそこから作れる
