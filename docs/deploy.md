# 公開（デプロイ）

友だちと試す規模の、いちばん安い構成。

```
ブラウザ ──> Cloud Run「trends-api」（API ＋ Web の画面 ＋ WebSocket）──> PostgreSQL（Neon の無料枠）
```

- 画面も API と同じサーバーで配る（`apps/api/src/web.ts`）。同じ場所なので CORS も要らない
- 使わないときは0台になる。少人数ならほぼ無料（Cloud Run の無料枠の範囲）
- main にマージすると、CI が通ったあと `.github/workflows/deploy.yml` が自動でデプロイする
- ログインのトークンに署名する鍵は、アプリが初回起動時に作って DB に保存する（人は扱わない）

## 最初の1回だけの準備

人がやること（画面での操作・アカウント）と、Claude がやること（コマンド）に分ける。

| 順 | だれ | やること |
|---|---|---|
| 1 | 人 | GCP プロジェクトを作り、請求先アカウントをつなぐ（個人開発用のアカウントで） |
| 2 | 人 | Neon（または Supabase）に登録して PostgreSQL を1つ作り、接続文字列を控える |
| 3 | 人 | この作業用に gcloud へログインする（`gcloud auth login --no-launch-browser` の URL を開いて許可） |
| 4 | Claude | Terraform で Cloud Run・Artifact Registry・Secret Manager・Workload Identity・予算アラートを作る |
| 5 | 人 | Secret Manager の `database-url` に、2 の接続文字列を「新しいバージョン」として入れる |
| 6 | Claude | GitHub の Variables（`GCP_PROJECT_ID` / `GCP_WIF_PROVIDER` / `GCP_DEPLOYER_SA`）を登録し、デプロイを流す |
| 7 | 人 | Google ログインの OAuth クライアント ID を作る（[online.md](online.md)「Google ログインの準備」。生成元は Cloud Run の URL） |
| 8 | Claude | クライアント ID を Cloud Run の `GOOGLE_CLIENT_ID` に入れる |

これで、Cloud Run の URL を友だちに送れば遊べる。

## ふだん

- main にマージ → CI → 自動デプロイ。結果は GitHub の Actions に出る
- 失敗したら、Actions のログと Cloud Run のログを見る。前のリビジョンに戻すのは Cloud Run の画面の「リビジョン」から
