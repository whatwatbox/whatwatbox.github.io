# 景品一覧

URL: /bingo_3/catalog/

画像受付GASの doGet?action=publicCatalog から、公開専用データだけを取得します。直近1分のスナップショットを再利用し、期限後の最初のアクセスでシートから再生成します。ページ読み込み時・タブ復帰時・手動更新時に取得し、閲覧中も1分ごとに更新確認します。アクセスがない間は処理を実行しません。

対象は投稿状態「有効」の回答のみ。差替済み・重複・要確認・空欄は掲載しません。回答シートの「一覧公開」に「非公開」と入力すると次回更新で除外します。受取コードの有効化とは独立です。

公開項目: 景品名、賞名、ショップ名、提供者名、カテゴリ、対応形式、単品/パック、公開BOOTH商品URL、パック内商品名、投稿済みサムネイル。メール、ギフトURL、受取コード、修正ID、内部情報、連絡先、参考価格は公開しません。

保存先フォルダと回答シートの共有は制限付きのままです。GAS configurePrizeCatalog を一度実行して一覧公開列を追加します。緊急非公開は一覧公開=非公開に変更後 refreshPrizeCatalog を実行してください。

同梱 catalog-service.gs は画像受付GASへの組み込み元です。スタンドアロン公開はしません。

検証: node --test bingo_3/catalog/catalog.test.mjs

## 接続状態
画像受付GAS バージョン9（2026-11-05）へ更新デプロイ済み。configurePrizeCatalog により回答シートへ「一覧公開」列を追加済みです。GET action=publicCatalog の正常応答を確認し、catalog-config.json の enabled=true で接続しています。公開対象0件の場合も正常な空の一覧を表示します。

## 公開画像の静的配信（2026-11-06）
閲覧ページは publicCatalogInfo で画像URLだけを取得します。画像本体は https://watbox.net/bingo_3/catalog/media/ のJPEGです。初期表示は同じ公開先の public-catalog.json を先に読み、最新の景品情報をGASで確認します。

GitHub ActionsのPagesワークフローが5分ごと（実行遅延あり）に従来の公開API publicCatalog から公開専用データを取得し、公開項目を再検証して静的画像と一覧スナップショットを生成します。非公開Driveへの認証情報やGitHubトークンをGASに渡しません。元フォルダの共有設定は変更しません。画像URLは公開用IDと画像内容のハッシュのみで構成し、ギフトURL・修正ID・メールは出力しません。

新規・差し替え画像は同期とPages公開が終わるまで「画像を反映中です」と表示されます。非公開にした画像は次回の正常な同期・公開で配信対象から外れます。ただし閲覧者による保存やブラウザー/CDNのキャッシュまでは取り消せません。緊急時はシートの一覧公開を非公開に変更し refreshPrizeCatalog を実行後、Pagesワークフローを手動実行します。

画像内容が変わらなければ同じURLを使い、ブラウザーのキャッシュを利用します。定期実行時に公開内容の変更がない場合は再デプロイを省略します。
検証: python -m unittest discover -s .github/scripts -p test_publish_prize_catalog.py
