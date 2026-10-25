会話が要約されました。要約で抜けやすい決まり（くわしくは docs/working-agreement.md。続ける前に読み直す）：
- 返事・コミット・PR はすべて日本語。結論から短く。決めてほしいことは 1 つに絞る
- 画面・効果文・docs の用語は docs/glossary.md の呼び名だけ。効果文は docs/card-text.md の文の型。カードにフレーバー・肩書きは載せない
- ゲームのルールは packages/game-core にだけ書き、テストを付ける
- 確かめは手元の pnpm verify（先に pnpm db:up）。通った版だけ dev に push できる（git のフック）
- 本番に出すときは dev → main の PR を作り、GitHub の CI が通ったらマージする（main への push はフックが止める）。オーナーや友人が対戦中なら出さない
- オーナーの指示と Claude の案を混ぜない。ボタンの文をオーナーの言葉として記録しない
- 新しい演出は、入れる前に動くモックで見せる
