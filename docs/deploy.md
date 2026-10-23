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

## 公開前の守り（10月23日）

まだ周知していない（11/1 リリース予定）あいだの守り。新しいライブラリは使っていない（`apps/api/src/security.ts`）。

| 守り | 中身 |
|---|---|
| 招待リンク | 合言葉の付いた URL（`https://…run.app/?invite=合言葉`）で一度開いた端末だけが使える。開くと端末に「招待済み」のクッキー（合言葉のハッシュ。1年）を置き、URL から合言葉を消して開き直す。招待されていない人には「準備中」の画面だけを出し、API とオンライン対戦（Socket.IO）も断る。友だちを足すたびにインフラを変える必要は無い |
| 回数の制限 | 同じ IP から 1 分に 1,200 回まで（全部）・書き込みは 1 分に 60 回まで。合言葉の間違いは 10 分に 10 回まで（総当たり止め） |
| 応答ヘッダー | nosniff・よそのページへの埋め込み禁止・Referrer の絞り・HSTS・カメラ等の不使用・`X-Robots-Tag: noindex` |
| 検索に載せない | `robots.txt`（全部お断り）・`<meta name="robots" content="noindex">` |
| 対戦中は出さない | `/health` の `liveMatches`（いま人がつないでいる、決着していないオンライン対戦の数）が 0 になるまで、Deploy が最長 30 分待つ。30 分で終わらなければ出さずに失敗にする（Actions の Deploy を手で動かし直す） |
| 依存の乗っ取り対策 | 公開されて 3 日たっていない npm の版は入れない（`pnpm-workspace.yaml` の `minimumReleaseAge`）。インストール時のスクリプトは決めたものだけ（`onlyBuiltDependencies`）。GitHub Actions は版の名前ではなくコミットで固定 |
| デプロイの権限 | GitHub からの権限の借り入れは main の実行だけ。デプロイ用のアカウントは `run.developer`（入れ替えはできるが、公開範囲は変えられない） |

招待なしでも開ける道は `/health`・`/robots.txt`・`/auth/config` だけ（デプロイの確認に使う）。招待済みの人は `/auth/invite` で合言葉を受け取れ、オンライン対戦の部屋のリンクには合言葉が付く（まだ招待されていない友だちにも、部屋のリンク1つで送れる）。

### 招待リンク（オーナーが操作する）

合言葉は Secret Manager の `invite-code`。最初の値は Terraform が作る（32 文字の英数字）。Claude は値を見ない・受け取らない。

- **リンクを作る**：GCP の画面右上の Cloud Shell で

  ```sh
  echo "https://trends-api-523738975867.asia-northeast1.run.app/?invite=$(gcloud secrets versions access latest --secret=invite-code --project=trends-cardgame)"
  ```

  出た URL を友だちに送る（または Secret Manager の画面 → `invite-code` → 版の「︙」→「シークレットの値を表示」で合言葉を見て、URL の `?invite=` のあとに付ける）
- **合言葉を変える**（リンクが広まりすぎたとき）：Cloud Shell で

  ```sh
  openssl rand -hex 16 | tr -d '\n' | gcloud secrets versions add invite-code --data-file=- --project=trends-cardgame
  gcloud run services update trends-api --region=asia-northeast1 --project=trends-cardgame --update-labels=invite-rotated=$(date +%s)
  ```

  2 行目で新しいリビジョンになり、新しい合言葉が効く。前のリンクと、前のリンクで開いた端末のクッキーは、まとめて使えなくなる（もう一度新しいリンクを送る）
- ホーム画面に追加したアプリ（とくに iPhone）は、Safari とクッキーが別のことがある。「準備中」の画面の入力欄に、リンクの `invite=` のあとの文字を入れれば開ける
- **公開するとき**は、Cloud Run の環境変数 `INVITE_CODE` を外せば（Terraform の env を消す）守りは効かなくなる。robots・noindex も外す

### GitHub

- 非公開リポジトリの main の保護（ブランチ保護・ルールセット）は GitHub Free では使えない（GitHub Pro が要る）。代わりに、本番に出せるのは「main で CI が通った版」だけで、GCP の権限を借りられるのも main の実行だけにしてある
- いちばん大事なのは、オーナーの GitHub アカウントの 2 段階認証（パスキーなど）。オーナーが GitHub の Settings → Password and authentication で確かめる
