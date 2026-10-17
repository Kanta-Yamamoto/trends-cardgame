# 公開（デプロイ）

友だちと試す規模の、いちばん安い構成。

```
ブラウザ ──> Cloud Run「trends-api」（API ＋ Web の画面 ＋ WebSocket）──> PostgreSQL（Neon の無料枠）
```

- 画面も API と同じサーバーで配る（`apps/api/src/web.ts`）。同じ場所なので CORS も要らない
- 使わないときは0台になる。少人数ならほぼ無料（Cloud Run の無料枠の範囲）
- GCP の変更は GitHub Actions が Terraform で行う（`.github/workflows/infra.yml`）。鍵ファイルは使わない。設定（プロジェクト ID・番号・クライアント ID。どれも秘密ではない）は `infra/gcp.env`
- main にマージすると、CI が通ったあと `.github/workflows/deploy.yml` が自動でデプロイする
- ログインのトークンに署名する鍵は、アプリが初回起動時に作って DB に保存する（人は扱わない）

## 最初の1回だけの準備

パスワードや接続文字列など秘密の値は、人が自分の画面で入れる。Claude は受け取らない。

| 順 | だれ | やること |
|---|---|---|
| 1 | 人 | GCP プロジェクトを作り、請求先アカウントをつなぐ（個人開発用のアカウントで） |
| 2 | 人 | Neon に登録して PostgreSQL を1つ作り、接続文字列をコピーしておく |
| 3 | 人 | GCP の画面右上の Cloud Shell で `infra/bootstrap.sh` の中身を貼って実行する。途中で 2 の接続文字列を聞かれるので貼る（画面には出ない）。最後に出る `PROJECT_NUMBER=…` を Claude に伝える |
| 4 | 人 | 「お支払い」→「予算とアラート」で、月の予算（例：3,000円）とメールの通知を作る |
| 5 | Claude | `infra/gcp.env` にプロジェクト番号を書いて main にマージ。Infra（Terraform）→ Deploy が自動で流れる |
| 6 | 人 | ✅ Google ログインの OAuth クライアント ID を作る（[online.md](online.md)「Google ログインの準備」。生成元は Cloud Run の URL） |
| 7 | Claude | ✅ `infra/gcp.env` にクライアント ID を書いて main にマージ（Infra が流れ直す） |

これで、Cloud Run の URL を友だちに送れば遊べる。

## ふだん

- main にマージ → CI → 自動デプロイ。`infra/terraform` を変えたときは Infra も自動で動く。結果は GitHub の Actions に出る
- 失敗したら、Actions のログと Cloud Run のログを見る。前のリビジョンに戻すのは Cloud Run の画面の「リビジョン」から
