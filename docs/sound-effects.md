# 効果音（SE）の一覧とプロンプト

効果音を作るための注文書（10月31日）。上から順に作ると、少ない数で多くの場面が埋まる。

## 入っている音

組み込みは `apps/web/src/sound/se.ts`、音のファイルは `apps/web/src/sound/se/`。大きさは、音のボタンの下に開く小さな窓で、音楽と別に変える（[working-agreement.md](working-agreement.md)「画面の音楽」）。

| 音 | 鳴る所 | 元の音から直したこと |
|---|---|---|
| S1 `landing`（着地） | キャラクター・トークンが場に着地するとき。暫定で全員同じ音（オーナー：「クリーチャーの着地の時の音は暫定でこれにしておいて」）。音の頭の衝撃が着地に重なるよう、★で変わる溜めに合わせて鳴らし始める（`LANDING_HIT`）。特別な登場の演出で出るキャラクターでは鳴らない | 頭の 0.12 秒を切り、長さ 2.1 秒、最後を 0.5 秒で消した |
| S4・S5 `attack`（攻撃） | 攻撃がキャラクター・プレイヤーに当たるとき（オーナー：「相手のキャラクターへの攻撃、相手のプレイヤーへの攻撃はこれで」）。溜めのあとの「ドン」が当たる瞬間に重なるよう、当たる 0.16 秒前に鳴らし始める（`attackSound`） | 長さ 0.38 秒に切った。「ドン」が低いので、低い音から倍音を作って足した |
| `attack_light`（軽い攻撃） | 攻撃力 2 以下のキャラクターの攻撃すべて（オーナー：「攻撃力が2以下のやつの攻撃は、この音にして、すべて」）。攻撃力 3 以上は `attack`。音の山が当たる瞬間に重なるよう、当たる 0.175 秒前に鳴らし始める（`attackSound`） | 頭の 0.03 秒を切り、長さ 0.42 秒、最後を 0.1 秒で消した。高い音なので、音量は `attack` より下げた |
| A5 `spell`（呪文） | 呪文を使って、カードが真ん中に出るとき。自分も相手も同じ音（オーナー：「呪文で相手にダメージを与えるとか何かしら呪文を使った時にこの音にしてみて」） | 長さ 3 秒を 1.5 秒に切って、最後を 0.4 秒で消した |
| B5 `arbiter`（『調停者』の剣） | 『調停者』の突きが当たるとき。対象が複数なら 1 体ごと（オーナー：「調停者の剣の音は、これの合わせ技にして」）。音の山が当たる瞬間に重なるよう、当たる 0.15 秒前に鳴らし始める（`ARBITER_HIT`） | 刀を抜く音（高音）と一撃の音（低音）を、山をそろえて 1 つに重ねた。長さ 0.95 秒、最後を 0.25 秒で消した |
| A6 `spell_hit`（呪文のダメージ） | 呪文のダメージがキャラクター・プレイヤーに当たるとき（オーナー：「これ呪文で相手にダメージ与える時の基本の音」）。相手が使った呪文でも鳴らす。カードの効果のダメージでは鳴らさない | 頭の 0.38 秒の静かな部分を切り、長さ 0.62 秒、最後を 0.2 秒で消した |
| S6 `vanish`（消える） | 破壊されたキャラクターが黒く溶けて消えるとき（オーナー：「破壊ではなく、破壊した後の消えるモーションにしましょう」）。【破壊されたとき】の抜け殻が消えるときも同じ | 長さ 3 秒を 1.6 秒に切り（消える動きに合わせた）、最後を 0.5 秒で消した |
| A1 `stat_up`（強化） | 攻撃力・体力が上がるときすべて（オーナー：「呪文による強化や罰による強化など、すべてにおいてスタッツが強化されるときには、この音を」。「罰」はバズと読んだ）。カードの効果・呪文・突進の強化・バズ・便乗で鳴らす。下がるときは鳴らさない。味方全体の強化は 0.25 秒あけて、重ねない | 長さ 2 秒を 0.9 秒に切り、最後を 0.3 秒で消した |
| `turn_change`（ターンの入れ替わり） | ターンが入れ替わって帯が出るとき。自分も相手も同じ音（オーナー：「相手の時もこっちの時も両方ともこの音にまず変えておいてください」）。対戦の最初の帯では鳴らさない | 風のスウッシュの音。長さ 1.6 秒のまま、最後を 0.3 秒で消した |
| H1 `ui_tap`（ボタン） | 主のボタン（`.btn`）を押したとき。すりガラス（`.ghost`）・字だけ（`.text`）のボタンでは鳴らない。ホームは、CPUと対戦・オンライン対戦・デッキを組む・カード一覧・ガチャを回す・お知らせ・メニュー・閉じる（×）・キャラを変える（オーナーの指定。`data-tap-se` を付ける。オーナー：「一旦ここまでやってみるか」）。どの画面でも左上の戻るボタン（上の帯・デッキの編集・盤面の「戻る」「ロビーへ」） | 頭の無音を切り、長さ 0.06 秒 |
| H3 `ui_decide`（決める） | 大事な決める操作だけ（オーナー：「大事な決める操作だけに使おう」）。デッキを決めて対戦を始める・部屋を作る、もう一度、デッキの保存、パックを開ける。`data-decide-se` を付ける。ターン終了は基本の音のまま（回数が多いため） | シャンという高い音なので、長さ 0.15 秒にして、音量は基本の音より下げた |

音のファイルは、1 チャンネルの短い WAV のまま持つ（MP3 は頭に無音が入り、着地とずれる）。

## 優先度の決め方

CPU どうしの自動対戦 147 試合（7 デッキの総当たり × 3）で、出来事の回数を数えた。CPU は `planTurn`。人が遊ぶと回数は変わるので、目安として見る。

| 順 | 何か | 数 | 理由 |
|---|---|---|---|
| S | 1 試合に何度も鳴る音 | 10 | これだけで、対戦中に鳴る回数の約 8 割が埋まる |
| A | 対戦の見せ場 | 20 | 回数は少ないが、気持ちよさと分かりやすさを決める |
| P | パックを開ける | 8 | 課金の形が変わっても、この演出は残す前提 |
| B | カード専用の演出・その他 | 13 | 仕上げ。なくても遊べる |
| H | 画面のボタンの音 | 2 | 主のボタンの音（H1）は入れた。戻す音（H2）は作らない |

## 音を付ける場所

すべてのボタンには付けない。ゲームの手ごたえがある所だけに付ける（Claude の案。オーナー：「確実に判断がつきやすいところから作っていこうか」）。押した所は、音がなくても光の円で分かる。

- **付ける**：対戦の操作（カードを置く・攻撃する・呪文を使う）、ゲームが進むボタン（対戦開始・ターン終了・パックを開ける）、押せないときの合図
- **付けない**：ホームと左上の戻るボタン以外の画面の移動・閉じる、絞り込み・切り替え、設定・メニュー

## 共通の決まり（Claude の案）

今までの配色・演出の決まりに合わせた、音の方向。

- **画面の音**：①ソーダの配色に合わせて、透明なガラス・水の泡。金属や電子音にしない
- **対戦の音**：カードの紙の音を芯に、光の音を少し足す。盤面の曲の上で聞こえるよう、中音をはっきりさせる
- **破壊**：黒で消えるので、明るく光らせない。低く沈んで消える
- **闇堕ち**：紫と黒。低く、重く、不穏に
- **魂**：白とミント。澄んだ音にして、闇堕ちと分ける
- **当たり**：金色のファンファーレにしない。白い光が広がる音にする
- **言葉を入れない**：声・歌・文字の読み上げは入れない。ミナモの案内も声なし
- **iPhone のスピーカーで聞こえるように**：低い音だけに頼らない
- **高い音を刺さらせない**（オーナー：「ボタンの音が高い音が刺さる気がします」「もうちょっと柔らかい音の方がいい」）。硬い素材より、やわらかい素材の音にする。音色は良くて高音だけ刺さるときは、Claude がその帯域を抑える

長さは目安。長めにできても、Claude が切って、音量と一緒にそろえる。

### プロンプトの使い方

- 使う道具は ElevenLabs（オーナーの決定）。長さは 0.5 秒、プロンプトの反映度（Prompt Influence）は高め、ループはオフ
- 無料プランで作った音は製品に使えない。採用する音は課金している間に作る
- 各音の 1 行目が日本語、その下が英語。まず英語を貼る
- 英語が 2 文以上の詳しいプロンプトは、そのまま貼る。短いプロンプトは、末尾に次を足す

```
効果音のみ。音楽なし、声なし。短く切れよく、残響は少なめ。
```

```
Sound effect only. No music, no voice. Short, clean ending, minimal reverb.
```

## S：最初に作る 10 個

### S1. キャラクターを召喚する `summon`

1 試合に約 17 回。カードを置く音ではなく、キャラクターを召喚する音（オーナー：「カードを出すっていうようなその手触り感のカードの音じゃなくて、やっぱりキャラクターを召喚してる感が強い」「一番耳触りが良くて、違和感のない音が欲しい」）。着地モーションに合わせて、溜めのあとにドンと落ちる（オーナー：「着地モーションとして捉えた方がいい」「着地するときにいきなりドンじゃない」「うわードンみたいな」）。

いま入っている音の注文（ElevenLabs は長い文が途中で切れるので、短く書く）：

- `Magical energy quickly rising for 0.25 seconds, then one soft low thump. Mobile game summon sound. Short, clean, no melody, no voice, no music.`
  （オーナーが選んだ音の注文は、この形の案のどれか）

前の案（長くて魔法すぎると言われた）：

1. 光が集まって着地する（本命）
   - `Character summon sound for a polished mobile card game. A soft airy whoosh of gathering light rises for a quarter of a second, then lands on a warm, rounded low-mid impact with a gentle shimmer that fades quickly. Magical but understated, comfortable to hear hundreds of times. No harsh high frequencies, no metallic ring, no melody. One-shot, clean, short tail. Sound effect only, no music, no voice.`
2. 空気がふくらんで現れる
   - `Character summon sound for a polished mobile card game. A soft burst of air, as if something materializes out of nowhere: a round, warm whoomp that swells quickly and settles with a breath of fading air. Light and natural, comfortable to hear hundreds of times. No harsh high frequencies, no metallic ring, no melody. One-shot, clean, short tail. Sound effect only, no music, no voice.`
3. やわらかい鐘が一度ひらく
   - `Character summon sound for a polished mobile card game. A gentle magical appearance: one warm, soft mallet bell tone with a puff of air, blooming once and fading within half a second. Calm, clear and pleasant, comfortable to hear hundreds of times. No harsh high frequencies, no metallic ring, no melody. One-shot, clean, short tail. Sound effect only, no music, no voice.`

前の案（カードを置く音。いま入っている音）：

1. 厚手のカードを木のテーブルに置く、やわらかく芯のある音（本命）
   - `Single card placement sound for a polished mobile card game. A thick trading card placed firmly onto a wooden table: a soft, satisfying, low-mid snap with a quick attack and a short natural decay. Solid and tactile, comfortable to hear hundreds of times. No harsh high frequencies, no metallic ring. One-shot, dry, close-mic. Sound effect only, no music, no voice.`
2. 厚手のカードを布のマットに置く、こもった音
   - `Single card placement sound for a polished mobile card game. A stiff card dropped onto a padded playmat: a muted, cushioned thud with a light paper flick and a very short decay. Gentle and tactile, comfortable to hear hundreds of times. No harsh high frequencies, no metallic ring. One-shot, dry, close-mic. Sound effect only, no music, no voice.`
3. カードを置いたあとに、薄い光の余韻が残る音
   - `Single card placement sound for a polished mobile card game. A card landing on a game board: a soft low-mid thud followed by a very faint, warm shimmer that fades within half a second. Clean and satisfying, comfortable to hear hundreds of times. No harsh high frequencies, no metallic ring. One-shot, dry, close-mic. Sound effect only, no music, no voice.`

### S2. カードを引く `card_draw`

1 試合に約 21 回。0.2 秒。

1. 山札の一番上からカードをスッと滑らせて抜く音
   - `A card sliding smoothly off the top of a deck`
2. 紙がこすれて軽くめくれる、さらりとした音
   - `Paper brushing and lightly lifting, a silky whisper`
3. 手元へ素早く飛んでくるカードの、短い風切り音
   - `A card flying quickly into the hand, a short airy swish`

### S3. 攻撃で飛び出す `attack_swing`

1 試合に約 23 回。0.2 秒。

1. カードが相手へ一直線に飛ぶ、鋭い風切り音
   - `A card lunging straight at the enemy, a sharp whoosh`
2. 力を溜めてから放たれる、短く低い空気のうなり
   - `A brief low air rush released after a tiny wind-up`
3. 刃を振り抜いたような、速くて細い音
   - `A fast thin slash of air, like a blade swung through`

### S4. キャラクターに当たる `hit_unit`

1 試合に約 16 回（攻撃と効果のダメージ）。0.2 秒。

1. カードとカードがぶつかる、乾いた強い衝撃
   - `Two stiff cards colliding, a dry and punchy impact`
2. 硬いものを打ち抜いた瞬間の、詰まった一撃
   - `A compact strike at the instant something hard is punched through`
3. 重い衝撃に細かな破片が混じる、キレのある打撃音
   - `A heavy hit with fine debris, sharp and snappy`

### S5. プレイヤーに当たる `hit_player`

1 試合に約 13 回。0.3 秒。S4 より重く、痛そうに。

1. 体の芯に響く、ずしんと重い一撃
   - `A deep heavy blow felt in the core of the body`
2. ガラスの板を強く叩いて、ひびが入りかける衝撃
   - `A hard strike on a glass panel, almost cracking it`
3. 大きな太鼓を一度叩いたような、低く広がる打撃
   - `One beat on a large drum, a low impact that spreads out`

### S6. 破壊される `destroy`

1 試合に約 17 回。0.5 秒。黒く溶けて消える。

1. 燃えかすが黒く崩れて、風に消えていく音
   - `Charred ash crumbling and vanishing in the wind`
2. 紙が一瞬で燃え尽きて、低く沈んでいく音
   - `Paper burning out in an instant, sinking into a low fade`
3. 闇に吸い込まれるように、すっと音が落ちていく消滅音
   - `A vanishing sound falling away, as if sucked into darkness`

### S7. 自分のターンが来る `turn_mine`

1 試合に約 9 回。0.6 秒。短くて、前向きに。

1. 澄んだ鐘が一度鳴る、明るく軽い合図
   - `A clear bell struck once, a bright and light signal`
2. 水面に光が走るような、きらめく上向きの音
   - `Light racing across water, a sparkling upward sweep`
3. ガラスの音が二つ、上へ跳ねる短い合図
   - `Two glass notes hopping upward, a short cue`

### S8. ターン終了 `turn_end`

1 試合に約 9 回。0.3 秒。

1. 木の札をコトンと裏返す、落ち着いた音
   - `A wooden tile flipped over with a calm knock`
2. 砂時計を置いた、静かで小さな区切りの音
   - `An hourglass set down, a quiet small full stop`
3. ガラスの音が一つ、下へ降りて終わる合図
   - `A single glass note stepping down to finish`

### S9. 手札のカードを持ち上げる `card_lift`

手札に触るたび。0.1 秒。

1. カードを指でつまみ上げる、ごく軽い紙の音
   - `A card pinched and lifted by fingers, a very light paper sound`
2. 紙がふわっと浮き上がる、息のような音
   - `Paper floating upward, a sound like a soft breath`
3. カードの端が指をはじく、小さな音
   - `A card edge flicking off a finger, a tiny sound`

### S10. 出せない・押せない `ui_ng`

コストが足りないときなど。0.2 秒。うるさくしない。

1. ガラスを爪で二度、低めに軽く叩く音
   - `A fingernail tapping glass twice, low and light`
2. 空気が詰まるような、短くこもった音
   - `A short muffled sound, like air being blocked`

## A：対戦の見せ場 20 個

### A1. 強化 `buff`

約 7 回。0.4 秒。カードのまわりだけの小さな演出なので、控えめに。

1. 小さな光が一瞬で満ちる、上向きのきらめき
   - `A small glow filling in an instant, a rising sparkle`
2. 温かい息が吹き込まれて、力が宿る短い音
   - `A warm breath blown in, power settling, short`

### A2. 光の玉が飛ぶ `summon_orb`

約 6 回。0.4 秒。

1. 小さな光の玉が弧を描いて飛ぶ、やわらかい音
   - `A small orb of light flying in an arc, soft`
2. 水滴が糸を引いて空中を走るような音
   - `A water drop trailing a thread through the air`

### A3. 効果で枠に置かれる `summon_land`

約 6 回。0.3 秒。

1. 光が一点に集まって、ポンと形になる音
   - `Light gathering to one point and popping into form`
2. 澄んだ音が広がって、カードが現れる短い音
   - `A clear tone blooming as a card appears, short`

### A4. バズ `buzz`

1 試合に 2 回まで。0.8 秒。プレイヤーの技。

1. 電気が一気に駆け上がり、空気が弾ける音
   - `Electricity surging upward, the air bursting`
2. 大勢の熱気が一瞬で爆発したような、上向きの衝撃
   - `The heat of a crowd exploding in an instant, an upward blast`

### A5. 呪文を唱える `spell_cast`

約 4 回。0.5 秒。

1. 空気がふわっと張りつめて、光が放たれる音
   - `The air tensing softly as light is released`
2. 紙の札が燃え上がって、力が飛び立つ音
   - `A paper charm flaring up, power taking flight`

### A6. 呪文が当たる `spell_hit`

約 4 回。0.3 秒。

1. 光の塊が当たって、はじける音
   - `A mass of light striking and bursting`
2. 細かな光の粒が散らばる、明るい衝撃
   - `Fine particles of light scattering, a bright impact`

### A7. 裏向きになる `dark_flip`

約 2 回。0.6 秒。闇堕ちを待つ状態へ。

1. カードが重く裏返り、低く不穏な音が残る
   - `A card flipping heavily, a low uneasy tone lingering`
2. 砂が落ち始める、かすかで不吉な音
   - `Sand beginning to fall, faint and ominous`

### A8. 闇堕ち `dark_fall`

約 2 回。1.5 秒。対戦で一番の山場。溜め → 解放 → 衝撃 → 余韻。

1. 深い闇が渦を巻いて膨らみ、一気に叩きつけられる音
   - `Deep darkness swirling and swelling, then slamming down all at once`
2. 地の底から低いうなりが上がり、重い衝撃のあとに冷たい余韻が残る
   - `A low rumble rising from under the earth, a heavy impact, then a cold afterglow`

### A9. 砂時計が炎に変わる `omen_flame`

約 2 回。1 秒。闇堕ちできるようになった合図。

1. 砂時計がくるりと回り、小さな炎がふっと灯る音
   - `An hourglass spinning once, then a small flame softly lighting`
2. 静かな回転音のあと、火種が息を吹き返す音
   - `A quiet rotation, then an ember breathing back to life`

### A10. 回復 `heal`

約 1 回。0.6 秒。

1. 澄んだ水が満ちていく、やさしい音
   - `Clear water gently rising, a tender sound`
2. やわらかな霧が広がる、透明で静かなきらめき
   - `Soft mist spreading, a clear and quiet shimmer`

### A11. 晒し状態 `status_expose`

約 1.5 回。0.4 秒。

1. 炎がパチッとはぜて、まとわりつく音
   - `A flame crackling and clinging`
2. 守りが一気にはがれる、ざらついた音
   - `Protection stripped away at once, a rough sound`

### A12. 眠り状態 `status_sleep`

約 1 回。0.5 秒。

1. まぶたが落ちるように、ゆっくり下がる丸い音
   - `A round tone drifting slowly down, like eyelids closing`
2. やわらかい綿に包まれて、音が遠のいていく
   - `Wrapped in soft cotton, the sound fading away`

### A13. 守りで止める `shield_block`

金の「0」が出るとき。0.3 秒。

1. 硬い膜が一撃をはじき返す、高く張りのある音
   - `A hard film deflecting a blow, high and taut`
2. 厚いガラスの盾に当たって、キンと跳ね返る音
   - `A hit bouncing off a thick glass shield with a clean ring`

### A14. 魂が抜け出る `death_soul`

【破壊されたとき】。1 秒。白とミント。闇堕ちと分ける。

1. 光の粒が立ちのぼり、一つにまとまって飛んでいく、澄んだ音
   - `Particles of light rising, merging into one, then flying away, pure and clear`
2. 細い鈴の音が集まって、息を吸うように縮み、すっと放たれる
   - `Thin chimes gathering, shrinking like an inhale, then released`

### A15. 対戦開始 `battle_start`

1 試合に 1 回。1.2 秒。VS の演出。

1. 重い扉が閉まるような低音に、二つの力がぶつかる
   - `A low tone like a heavy door shutting, two forces colliding`
2. 張りつめた静けさを、一撃で断ち切る音
   - `Taut silence cut in two by a single strike`

### A16. ひびが入る `life_crack`

決着。0.5 秒。ひびは 3 段で広がる。

1. 厚いガラスにピシッと亀裂が走る音が、三度続く
   - `Thick glass cracking three times in a row, sharp`
2. 氷が張りつめて割れ始める、高く鋭い音
   - `Ice under tension starting to split, high and sharp`

### A17. 砕ける `life_shatter`

決着。1 秒。

1. 大きなガラスの板が砕け散る音が、途中からゆっくり引き延ばされる
   - `A large glass panel shattering, the sound stretching into slow motion`
2. 破片が空中で止まるように、音が薄くなって遠のく
   - `Shards seeming to freeze midair, the sound thinning and receding`

### A18. 破片がぶつかる `shard_hit`

決着。0.5 秒。画面へぶつかる最後の一撃。

1. 破片が迫ってきて、すぐ目の前でぶつかる、鋭い衝撃
   - `A shard rushing in and striking right in front of you, a sharp impact`
2. 風切り音が高まって、一瞬で途切れる
   - `A rising whoosh cut off in an instant`

### A19. 勝利 `win`

結果の画面。2 秒。ファンファーレにしない。

1. 白い光が満ちて、澄んだ音が重なって広がる
   - `White light filling the air, clear tones layering and expanding`
2. 高い鈴の音が空へ舞い上がる、晴れやかな余韻
   - `High chimes soaring upward, a bright lingering feeling`

### A20. 敗北 `lose`

結果の画面。2 秒。

1. 色が抜けていくように、低い音が静かに沈む
   - `A low tone sinking quietly, as if color were draining away`
2. 遠くの鐘が一度鳴り、冷たい静けさが残る
   - `A distant bell tolling once, leaving a cold silence`

## P：パックを開ける 8 個

### P1. 裂く `pack_tear`

なぞっている間。1 秒。指の動きに合わせて音量を変える。

1. 銀色のアルミの袋を、ゆっくり横に裂いていく音
   - `A silver foil pack slowly being torn sideways`
2. 薄いフィルムが少しずつ破れる、細かい音
   - `Thin film ripping bit by bit, fine and detailed`

### P2. 裂けきる `pack_open`

0.3 秒。

1. アルミの切れ端が一気に外れる、軽快な音
   - `A foil strip ripping free all at once, lively`
2. 袋の口がパッと開いて、中の空気が抜ける音
   - `A pack mouth popping open, air escaping`

### P3. カードがせり上がる `card_rise`

1 秒。

1. カードの束が袋の中をゆっくり滑り上がる音
   - `A stack of cards sliding slowly up inside a foil pack`
2. アルミが静かにこすれて、期待が高まる音
   - `Foil softly rubbing, anticipation building`

### P4. めくる `card_flip`

1 パックに 5 回。0.2 秒。

1. カードを手早く裏返す、乾いた音
   - `A card flipped quickly, a dry sound`
2. 厚紙がしなって、パシッと返る音
   - `Stiff card bending and snapping over`

### P5. 当たりの前兆 `rare_tell`

1.5 秒。カードのまわりから光が漏れる。

1. 低く震える空気が、だんだん高まっていく音
   - `Low trembling air gradually rising`
2. 隙間から光が漏れ出す、張りつめた音
   - `Light leaking through a crack, taut and tense`

### P6. 白い光が画面を覆う `rare_white`

1.5 秒。金色の音にしない。

1. 白い光が一気に広がって、すべてを包む音
   - `White light expanding all at once, enveloping everything`
2. 澄んだ高音が満ちて、ふっと音が消える
   - `Pure high tones filling the air, then suddenly gone`

### P7. ★5 が出る `star5_reveal`

2 秒。一番のごほうび。

1. 静けさのあと、ガラスの音が大きく開いて、光の粒が降る
   - `After silence, glass tones opening wide, particles of light raining down`
2. 深い響きの上に、澄んだ鐘がいくつも重なって広がる
   - `Clear bells layering and spreading over a deep resonance`

### P8. ★5 のカードが縮む `star5_shrink`

0.8 秒。

1. 光がすっと一点に吸い込まれて収まる音
   - `Light drawn smoothly into one point and settling`
2. 大きな響きが小さくなり、カチッと収まる音
   - `A large resonance shrinking and clicking into place`

## B：カード専用の演出・その他 13 個

### B1. 神の降臨 `god_descent`

2 秒。

1. 天から太い光の柱が降りる、荘厳で低い響き
   - `A thick pillar of light descending from the sky, solemn and deep`
2. 空が裂けて、圧倒的な存在が降り立つ音
   - `The sky splitting as an overwhelming presence lands`

### B2. ライブの演出 `idol_live`

2 秒。アイドル・ミナモ。歌は入れない。

1. スポットライトが点く音と、遠くの歓声
   - `Spotlights switching on, a distant cheering crowd`
2. 会場の空気が一気に沸き上がる、明るい音
   - `The air of a venue lifting all at once, bright`

### B3. コラ画像を貼る `collage_paste`

0.6 秒。

1. 紙をベタッと貼り付けて、はさみで切る音
   - `Paper slapped on with paste, then snipped by scissors`
2. シールを勢いよく貼る、乾いた音
   - `A sticker pressed on with force, dry`

### B4. クサハミの奇襲 `kusahami_ambush`

1 秒。

1. 草むらが揺れて、何かが飛び出す音
   - `Tall grass rustling, then something bursting out`
2. 茂みの奥から迫る、低く速い足音
   - `Low fast footsteps approaching from deep in the bushes`

### B5. 『調停者』の突き `arbiter_thrust`

1 秒。光線 → 時が止まる → 衝撃の輪。

1. 細い光線が空気を貫き、音が一瞬止まって、遅れて衝撃が来る
   - `A thin beam piercing the air, sound frozen for a moment, then a delayed shockwave`
2. 鋭く高い一閃のあと、無音をはさんで低い衝撃が広がる
   - `A sharp high flash, a beat of silence, then a low impact spreading out`

### B6. 『演出家』の登場 `director`

1.5 秒。

1. 劇場の幕が重く開く音と、遠くのざわめき
   - `Heavy theater curtains opening, distant murmurs`
2. 舞台を照らす光が、順に点いていく音
   - `Stage lights turning on one by one`

### B7. 『フィクサー』の差し出し `fixer`

1 秒。

1. 重い札を机の上で滑らせる、静かで不穏な音
   - `A heavy card slid across a desk, quiet and unsettling`
2. 低い音が近づいて、取引が成立したように止まる
   - `A low tone approaching and stopping dead, as if a deal were struck`

### B8. 墓地から戻る `revive`

1 秒。血だまりの演出。

1. 粘りのある液体の底から、何かが這い上がる音
   - `Something crawling up from the bottom of a thick liquid`
2. 水たまりが波打って、低い鼓動が一度鳴る
   - `A pool rippling, one low heartbeat`

### B9. 手札に戻る `bounce`

0.3 秒。

1. カードが軽く弾かれて、手元へ戻る音
   - `A card lightly flicked back to the hand`
2. 空気がふわっと逆向きに流れる音
   - `Air softly flowing in reverse`

### B10. 沈黙状態 `status_silence`

0.5 秒。

1. 周囲の音がふっと消えて、耳が詰まるような音
   - `Surrounding sound suddenly dropping out, ears feeling blocked`
2. 文字に線が引かれて、消されていく音
   - `A pen striking a line through text`

### B11. 対戦相手が見つかった `match_found`

0.8 秒。

1. 離れていた二つの光が出会う、高まる音
   - `Two distant lights meeting, a rising sound`
2. 澄んだ音が二度重なる、はっきりした合図
   - `Two clear notes overlapping, a distinct cue`

### B12. 持ち時間が少ない `time_warn`

0.3 秒。焦らせすぎない。

1. 時計の秒針が、少し速く刻む音
   - `A clock's second hand ticking a little faster`
2. 水滴が一定の間隔で落ちる、緊張した音
   - `Water dripping at a steady interval, tense`

### B13. ちびミナモの案内 `tutorial_talk`

文を出すとき。0.2 秒。声は入れない。

1. 小さな泡がぽこぽこと二つ弾ける、かわいい音
   - `Two tiny bubbles popping in a row, cute`
2. 木琴を軽く二度叩く、やさしい音
   - `A xylophone softly tapped twice, gentle`

## H：画面のボタンの音

高音が刺さらない案。H1 はオーナーが作った音を入れた。作り直すときは次の案から。

### H1. ボタンを押す `ui_tap`

0.1 秒。

1. 木琴を毛糸のばちで叩く、温かく丸い音（本命）
   - `Single UI button tap sound for a polished mobile game. One soft marimba note struck with a felt mallet: a warm, round, low-mid tone with a gentle attack and a short natural decay. Mellow and cushioned, comfortable to hear hundreds of times. No harsh high frequencies, no sharp click. One-shot, dry, close-mic. Sound effect only, no music, no voice.`
2. 水のしずくが落ちる、ぽとんとした音
   - `Single UI button tap sound for a polished mobile game. One soft water droplet falling into a calm pool: a rounded, low-mid "plop" with a gentle attack and a very short watery tail. Smooth and soothing, comfortable to hear hundreds of times. No harsh high frequencies, no sharp click. One-shot, dry, close-mic. Sound effect only, no music, no voice.`
3. やわらかいボタンを押す、控えめな音
   - `Single UI button tap sound for a polished mobile game. A soft rubber button gently pressed by a fingertip: a muted, cushioned, low-mid thump with a gentle attack and an immediate decay. Quiet and tactile, comfortable to hear hundreds of times. No harsh high frequencies, no sharp click. One-shot, dry, close-mic. Sound effect only, no music, no voice.`

### H2. 戻す・閉じる `ui_back`

0.1 秒。H1 より低く、控えめに。

1. 泡がすっと水に戻る、下向きのやわらかい音
   - `A bubble slipping back into water, a soft downward sound`
2. 小さな玉が転がって止まる、控えめな音
   - `A small bead rolling to a stop, understated`
