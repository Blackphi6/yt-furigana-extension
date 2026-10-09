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
  /** 辞書の読み込み完了をコンソールに出す（既定 false） */
  debug?: boolean;
}

export interface ToHtmlOptions {
  /** 拡張と同じ語単位の <span class="yt-furigana-word" …> で包む（既定 false = <ruby> だけ） */
  clickable?: boolean;
  /** 読み分けに使う前後の文脈（字幕の行全体など） */
  contextText?: string;
}

export interface FuriganaEngine {
  /** ルビ付き HTML（本文は HTML エスケープ済み） */
  toHtml(text: string, options?: ToHtmlOptions): string;
  /** kuromoji の形態素解析結果 */
  tokenize(text: string): KuromojiToken[];
  /** 漢字を含むか */
  hasKanji(text: string): boolean;
}

export function createFuriganaEngine(options?: CreateFuriganaEngineOptions): Promise<FuriganaEngine>;
