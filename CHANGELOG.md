# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-05-19

### Changed

- Rewrote README in English for VS Code Marketplace publication

## [0.1.0] - 2026-05-18

### Added

- `.xlsx` / `.xlsm` ファイルのスプレッドシート表示・編集 (初期実装)
- 行の追加・削除・複製 (Ctrl+D)
- 複数行選択 (Shift+クリック / Ctrl+クリック) と右クリックメニューからのシート作成 (#31)
- セル範囲選択・コピー＆ペースト (Clipboard API) (#29)
- Undo / Redo (最大50ステップ) (#29)
- 行の検索・フィルタ (#2)
- ページネーション (設定で件数変更可能)
- 列選択時に重複値をハイライト表示 (#3)
- 列選択時に統計情報をステータスバーに表示 (行数・ユニーク数・NULL数・EMPTY数) (#8)
- ヘッダ行のカラム名をダブルクリックで編集 (#24)
- 日付形式バリデーション — ISO 8601 (YYYY-MM-DD) 以外のセルを警告ハイライト (#10)
- NULL / EMPTY 値の区別表示 (`[null]` / `[empty]`、DBRider 形式対応) (#6)
- 行番号列を左端に固定・横スクロール (#18)
- クロスシート外部キー参照ナビゲーション — 同名カラムを持つ他シートへのジャンプ (#9)
- CSV ファイル直接編集 (#40)
- `table-ordering.txt` で複数 CSV を一括表示 (#40)
- ツールバーの「CSV 追加」ボタンでシートを追加 (#40)
- シートのリネーム (ダブルクリック / 右クリックメニュー) (#42)
- シートの削除 (右クリックメニュー、確認ダイアログ付き) (#42)
- MIT LICENSE ファイルを追加 (#11)

### Changed

- Excel I/O を Java JAR から **ExcelJS** (Node.js ライブラリ) へ移行 — Java 不要 (#32)
  - `.xls` (Excel 97-2003 バイナリ形式) は非対応。`.xlsx` / `.xlsm` のみサポート
- `[null]` マーカーのデフォルト値を DBRider `ReplacementDataSet` 形式に統一 (#6)

### Fixed

- 複数行選択時に行削除が1行しか削除されない不具合を修正

[Unreleased]: https://github.com/Nobuyuki-Inaba/simple-excel-editor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Nobuyuki-Inaba/simple-excel-editor/releases/tag/v0.1.0
