# Simple Excel Editor

VSCode 拡張機能 — Excel ファイル (`.xlsx` / `.xls` / `.xlsm`) をエディタ内で直接スプレッドシート形式で編集できます。

![エディタのプレビュー](docs/screenshots/editor-preview.png)

---

## 機能

| 機能 | 詳細 |
|------|------|
| 表形式編集 | セルをダブルクリックして直接編集 |
| マルチシート | 画面下部のタブでシートを切り替え |
| NULL値対応 | 空文字列とNULLを区別して表示・編集 |
| ページネーション | 大量行を一定件数ずつ表示 |
| 行・列の追加/削除 | ツールバーボタンで操作 |
| 保存 | Ctrl+S で Excel ファイルに書き戻し |

## 必要条件

- Java 21 以上
- [exceltocsv](https://github.com/Nobuyuki-Inaba/exceltocsv) の fat JAR

## セットアップ

### 1. exceltocsv JAR のビルドと配置

```bash
git clone https://github.com/Nobuyuki-Inaba/exceltocsv.git
cd exceltocsv
mvn package
cp target/exceltocsv-1.0.0-jar-with-dependencies.jar \
   ../simple-excel-editor/lib/exceltocsv.jar
```

### 2. 依存パッケージのインストール

```bash
cd simple-excel-editor
npm install
```

### 3. デバッグ実行

VSCode でこのフォルダを開き、**F5** を押すと拡張機能開発ホストが起動します。

## 設定項目

| 設定 | デフォルト | 説明 |
|------|-----------|------|
| `simpleExcelEditor.javaPath` | `""` | Java 実行ファイルパス（空の場合は自動検出） |
| `simpleExcelEditor.jarPath` | `""` | exceltocsv JAR パス（空の場合は `lib/exceltocsv.jar`） |
| `simpleExcelEditor.nullMarkers` | `["\\N"]` | NULL として扱う文字列のリスト |
| `simpleExcelEditor.pageSize` | `200` | 1ページに表示する行数 |
| `simpleExcelEditor.hasHeader` | `true` | 先頭行をヘッダとして扱うか |
| `simpleExcelEditor.encoding` | `"UTF-8"` | CSV 変換時の文字エンコーディング |

### Java の自動検出順序

1. `simpleExcelEditor.javaPath`（ユーザ手動設定）
2. `java.jdt.ls.java.home`（Language Support for Java by Red Hat）
3. `java.home`（Java Extension Pack）
4. `JAVA_HOME` 環境変数
5. `java`（PATH フォールバック）

## NULL 値の扱い

このエディタはソフトウェア開発での利用を想定しており、**空文字列と NULL を明確に区別**します。

- **空セル** → CSV で空文字列 `""`
- **NULL セル** → CSV で `\N`（デフォルト、設定で変更可能）
- **入力方法** → セルを編集中に `Alt+N` で NULL マーカーを挿入

## 構成

```
simple-excel-editor/
├── src/
│   ├── extension.ts            # エントリポイント
│   ├── ExcelEditorProvider.ts  # カスタムエディタ本体
│   ├── JavaRunner.ts           # exceltocsv JAR 実行
│   ├── JavaPathDetector.ts     # Java パス自動検出
│   └── CsvUtils.ts             # CSV パース/シリアライズ
├── media/
│   ├── editor.js               # Webview UI（Vanilla JS、外部ライブラリなし）
│   └── editor.css              # スタイル（VS Code テーマ変数対応）
└── lib/
    └── exceltocsv.jar          # 変換エンジン（要配置）
```

## ライセンス

MIT
