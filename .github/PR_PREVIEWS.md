# PRプレビュー

GitHub Pagesの公開元は **GitHub Actions**。独自ドメインは `watbox.net` を維持します。

- 本番: https://watbox.net/ （常にmain）
- PR: `https://watbox.net/pr-preview/pr-<番号>/`
- 同じリポジトリ内からmainに向けたPRが対象。forkからのPRは公開しません。
- PRの作成・更新・再開・クローズとmain更新で、本番と開いている全PRをまとめて再構築します。
- 公開成功後にPRコメントへURLと反映コミットを記載します。
- クローズ済みPRは次回公開から除外されます。マージ時も同様です。
- Actionsの「Publish site and PR previews」→「Run workflow」で再実行できます。

`pull_request_target`でmain側のワークフローとスクリプトだけを実行します。
PR内のビルドコマンドやActionsは実行せず、HTMLとassets/css/js/editor内の通常ファイルのみをコピーします。
公開物に.git/.github等を含めず、symlinkとsubmoduleも拒否します。追加のPATは不要です。
各プレビューにはnoindexを付与しますが、URLを知っている人は閲覧できます。

サイト内リンク・画像・fetchのパスは相対パスを維持してください。
新しい公開ディレクトリを追加する場合は `.github/scripts/build_pages.py` の `PUBLIC_DIRS` を更新してください。
本番とプレビューは同じドメインで配信されるため、秘密情報や本番専用認証を含むサイトには使用しないでください。
