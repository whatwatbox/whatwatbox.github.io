# 第3回clusterBINGO大会

ビルド不要の静的サイトです。`bingo/` 全体を既存サイトと一緒に GitHub Pages に配置すると、`https://watbox.net/bingo/` で公開できます。

- `index.html`: イベント紹介
- `prizes/index.html`: 景品投稿（商品情報補助・サムネイル編集・入力検証。受付は準備中）
- `sponsors/index.html`: 協賛募集（準備中）
- `style.css`: 全ページ共通デザイン、スマートフォン対応
- `main.js`: 写真の拡大表示
- `assets/`: ヘッダーイラスト、大会写真、ファビコン

開場日時は2026年12月27日（日）21:45、開始は22:00、所要時間は約1時間（予定・日本時間）。参加先は https://cluster.mu/e/ee3222d5-c56e-4518-b380-3e260763ce58 です。完成サムネイルは assets/event-thumbnail-v4.png を使用しています。景品・協賛の募集要項、フォームはまだありません。

写真は既存の `assets/works/clusterBINGO大会/アートボード3.png` と `アートボード4.jpg` を元に、配信用JPEGとして保存しました。日付・紹介文は同フォルダの `data.json` にある2024年12月30日の記録を参照しています。

ヘッダー `assets/hero.jpg` は組み込み image_gen で生成したイラストです（実際の大会写真ではありません）。使用プロンプト：

> Use case: ads-marketing. Asset type: wide Google Sites event header background, panoramic 3:1 landscape. Create a polished joyful flat 2D editorial illustration for a Japanese virtual-world BINGO community event. Warm pale butter yellow and cream background, dark navy, golden yellow, touches of teal and coral. Big playful numbered bingo balls at the left and right edges, a tilted bingo card toward right edge, ribbons, scattered small confetti and stars. Center 55 percent remains pale uncluttered negative space for a dark navy website title added separately. Crisp geometric flat shapes, screen print inspired slightly tactile paper finish, lively diagonals and charming graphic rhythm, sophisticated celebratory poster rather than generic corporate illustration. NO people, NO text or slogans, NO logos, NO 3D rendering, NO invented photographs. Bingo numbers on balls allowed. Decoration should survive cropping into a wide Google Sites banner.

元々Google Sitesのヘッダー用途で作成した画像を、こちらのページでも使用しています。

ローカル確認例（リポジトリ直下で実行）:

```sh
python -m http.server 8766 --bind 127.0.0.1
```

ブラウザーで `http://127.0.0.1:8766/bingo/` を開きます。既存サイトへのリンク確認のため、`bingo/` 単体ではなくリポジトリ直下を配信してください。
