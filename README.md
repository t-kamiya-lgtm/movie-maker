# Movie Maker

AI でキャラクターを作り、そのキャラクターでシーン動画を量産し、タイムラインで結合してナレーションを付ける動画生成アプリです。

| メニュー | できること |
| --- | --- |
| ① 画像（キャラクター） | AI で人物画像を生成（または手持ち画像をアップロード）して保存。**キャラクター名（フラグ）** とタグを付けられる |
| ② 動画（シーン素材） | キャラクターを選んでシーン画像を量産（1行 = 1シーン × 枚数）→ 選択して動画化。動画は**環境音のみ**。タグを付けて絞り込み表示 |
| ③ 結合（タイムライン） | 動画素材を選んでタイムラインに並べ、ドラッグで並べ替え・トリミングして 1 本に書き出し |
| ④ 音声（ナレーション） | Fish Audio のボイスを検索・試聴して選び、原稿から音声を生成。タイムライン上の位置を決めて ③ の動画に合成 |

## 出力サイズ

9:16（TikTok / Reels / Shorts）、16:9（YouTube / X）、1:1（正方形）、4:5（Instagram フィード）、3:4、2:3（Pinterest）、21:9。
`lib/aspect.ts` に追加すれば増やせます。結合時は「切り抜き（全面）」か「余白を付ける」を選べます。

## 対応 AI モデル（fal.ai 経由）

API キー 1 つ（`FAL_KEY`）で次のモデルを切り替えて使えます。

- **画像:** Nano Banana、Nano Banana Pro、Seedream 4.0、FLUX.1 [dev]
- **動画（画像→動画）:** Seedance 1.0 Pro / Lite、Kling 2.1 Master、Hailuo 02、Veo 3 Fast
- **環境音:** 音声を生成しない動画モデル（Seedance など）を使った場合は、生成後に **MMAudio v2** で環境音を自動で付けます（話し声・音楽は除外）。Veo 3 は環境音のみを指示して生成します。
- **ナレーション:** Fish Audio（`FISH_AUDIO_API_KEY`）

モデルは `lib/providers/catalog.ts` で管理しているので、fal.ai のモデルを追加するときはそこに 1 項目足すだけです。
API キーが未設定のときは「モック」モデル（グラデーション画像・ノイズ音・テスト音）で全機能を試せます。

## セットアップ

必要なもの: Node.js 20 以上、ffmpeg / ffprobe（PATH が通っていること）

```bash
npm install
```

```bash
cp .env.example .env
```

`.env` に `FAL_KEY` と `FISH_AUDIO_API_KEY` を設定します。

```bash
npm run dev
```

http://localhost:3000 を開きます。

## データの保存先

生成した画像・動画・音声とデータベース（`db.json`）は `storage/` に保存されます（`STORAGE_DIR` で変更可）。
`storage/` は git の管理対象外です。

## 構成

```
app/                 画面（Next.js App Router）と API ルート
  characters/        ① キャラクター
  scenes/            ② シーン素材
  editor/[id]/       ③ タイムライン
  voice/[id]/        ④ ナレーション
  api/               REST API（生成はバックグラウンドで実行、画面はポーリング）
lib/
  providers/         fal.ai・Fish Audio・モックの各プロバイダー、モデル一覧
  generate.ts        生成パイプライン（画像 → 動画 → 環境音 / 結合 / ナレーション合成）
  ffmpeg.ts          トリミング・リサイズ・結合・音声ミックス
  db.ts              JSON ファイル DB
components/          共通 UI（タイムライン、タグ、サイズ選択、ボイス選択）
```

※ 生成処理は Node サーバーのプロセス内で実行するため、`next dev` / `next start` などの常駐サーバーで動かす前提です（サーバーレス環境は想定していません）。
