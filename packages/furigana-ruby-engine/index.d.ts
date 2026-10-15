export interface KuromojiToken {
  surface_form: string;
  reading?: string;
  pronunciation?: string;
  pos?: string;
  basic_form?: string;
  [key: string]: unknown;
}

export interface CreateFuriganaEngineOptions {
  /** dict/ を配信している URL（ブラウザでは必須。Node では省略するとパッケージ同梱の dict/ を読む） */
  dictionaryBaseUrl?: string | URL;
  /** 辞書ファイル名 → gzip バイト列。拡張なら chrome.runtime.getURL などで自前で読む */
  loadFile?: (fileName: string) => Promise<ArrayBuffer | Uint8Array>;
  /** 熟字訓・人名・駅名などの句辞書を読むか（既定 true） */
  phraseDictionaries?: boolean;
  /** 表層 → 読み（ひらがな）。例 { "髙橋": "たかはし" } */
  userReadings?: Record<string, string>;
  /**
   * toHtmlAsync で読み API を使う。true なら公開 API（https://yt-furigana-readings.onrender.com）。
   * 指定すると本文が API サーバーへ送られる。既定は使わない（通信しない）
   */
  readingApi?: true | ReadingApiOptions;
  /** 辞書の読み込み完了・読み API の失敗をコンソールに出す（既定 false） */
  debug?: boolean;
}

export interface ReadingApiOptions {
  /** API のベース URL（/v1/readings は省略可）。省略時は公開 API */
  url?: string;
  /** Authorization: Bearer に載せるキー */
  apiKey?: string;
  /** 時間切れまでのミリ秒（既定 30000）。過ぎたら手元のエンジンの結果を返す */
  timeoutMs?: number;
}

export interface ToHtmlOptions {
  /** 拡張と同じ語単位の <span class="yt-furigana-word" …> で包む（既定 false = <ruby> だけ） */
  clickable?: boolean;
  /** 読み分けに使う前後の文脈（字幕の行全体など） */
  contextText?: string;
}

export interface CandidatesOptions {
  /** 今表示している読み。指定すると先頭に source: "current" で入る */
  currentReading?: string;
  /** 読み分けに使う前後の文脈。合う候補が上位に来る */
  contextText?: string;
}

export interface ReadingCandidate {
  /** 読み（ひらがな。ユーザー指定・現在の読みはカタカナのこともある） */
  reading: string;
  /** 出どころ: "current" | "user" | "manual" | "neologd" | "context" | "dict" | "number" */
  source: string;
  /** 表示用の短い日本語ラベル（例: "辞書" "文脈" "学習済み"） */
  label: string;
}

export interface FuriganaEngine {
  /** ルビ付き HTML（本文は HTML エスケープ済み） */
  toHtml(text: string, options?: ToHtmlOptions): string;
  /** readingApi 指定時は読み API + 手元の辞書で、未指定時は toHtml と同じ。API 失敗時は toHtml の結果 */
  toHtmlAsync(text: string, options?: ToHtmlOptions): Promise<string>;
  /** 語の読み候補（スコア順・最大 8 件）。読み選択メニューなどに使う */
  candidates(surface: string, options?: CandidatesOptions): ReadingCandidate[];
  /** kuromoji の形態素解析結果 */
  tokenize(text: string): KuromojiToken[];
  /** 漢字を含むか */
  hasKanji(text: string): boolean;
}

export function createFuriganaEngine(options?: CreateFuriganaEngineOptions): Promise<FuriganaEngine>;
