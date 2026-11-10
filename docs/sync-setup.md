# 非公開GitHub保存の設定

アプリ本体: https://github.com/totoro0419/schoolmanager （公開）

学校のPDFはこのリポジトリへ入れません。未接続時は端末内保存のみです。同期APIの実装は `server/worker.ts`。GitHub Pagesに秘密鍵を置く処理はありません。

## 必要な準備

1. GitHubに `print-library-data` を **Private**・README付きで作成する。既存データのあるリポジトリも、他のファイルを消さずに利用できます。
2. このリポジトリだけを対象とするfine-grained tokenを作成する。権限は Metadata: read / Contents: read and write。トークンをアプリの公開リポジトリ・PDF・画面へ貼り付けない。
3. 既存のCloudflare Freeアカウントを使い、`server` ディレクトリで `npx wrangler deploy`。料金が発生するプラン・有料機能を有効にしない。外部アカウントの作成・プラン契約は自動では行いません。
4. `DATA_REPO` は `totoro0419/print-library-data`、`ALLOWED_ORIGIN` はフロントエンドの正確なoriginに設定する。GitHub Pagesなら `https://totoro0419.github.io`。Sitesで利用する場合はそのURLのorigin。
5. `npx wrangler secret put GITHUB_TOKEN` でトークンをサーバーの秘密情報に保存する。
6. 32文字以上のランダムな同期キーを生成し `npx wrangler secret put ACCESS_KEY` で保存する。このキーは専用APIへのアクセス用。GitHubトークンではありません。
7. アプリの「設定とバックアップ」にAPIのHTTPS URLと同期キーを入力し、設定を保存 → 今すぐ同期。キーはブラウザのメモリだけに保持します。リロード後は再入力します。

## 動作

毎回、保存先が非公開であることをサーバーで確認します。公開リポジトリなら拒否します。原本・整理版・サムネイルはSHA-256を名前とする不変ファイルとして保存します。管理情報、分類辞書、履歴、ゴミ箱の状態とPDFを1コミットで反映します。既存ファイルを勝手に削除しません。不要な過去ファイルはGitの履歴を含め残るため、長期間の大量スキャンには別のストレージが適します。

親コミットとリモートの版を照合し、force pushを使わず更新します。別端末の変更があれば競合として止めます。自動上書きはしません。競合時はローカルZIPを保存してからリモートを復元し、ローカルの未反映PDFを追加してください。自動マージは未実装です。

元PDFは12MiB、整理版は14MiBまでをこのAPIの実装上限とし、1リクエスト40MiBまでです。大きいPDFや一括同期が上限を超える場合は明確なエラーで止め、端末内データを保持します。ZIPバックアップか教材ごとの分割を利用してください。

GitHubの現在の公式制限（2026-11-10確認）は、単一オブジェクト100MBの上限、推奨リポジトリサイズ10GB以下です。APIには別途、認証方式ごとの回数制限と書き込み頻度制限があります。利用制限の回避を目的とした連打は行いません。

参考:
- https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://developers.cloudflare.com/workers/platform/pricing/

## 公開前の確認状況

サーバーの非公開判定・認証拒否・競合・API失敗・コミット手順はモック通信で自動テストしています。利用者の実トークン、非公開データリポジトリ、外部サーバーは未接続です。実際のGitHubへのPDF保存・別端末からの再取得は未検証です。接続するまで「GitHub保存済み」とは表示しません。
