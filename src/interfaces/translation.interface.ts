export type TranslationProvider = 'deepl' | 'libretranslate';
export type TranslationCacheSource = 'message' | 'redis' | false;

export interface TranslateResult {
  translation: string;
  sourceLang: string;
  targetLang: string;
  fromCache: TranslationCacheSource;
  provider?: TranslationProvider;
}

export interface SupportedLanguage {
  code: string;
  name: string;
}

// ─── Cost-optimisation log entry ──────────────────────────────────────────────

export interface TranslationLogEntry {
  userId: string;
  sourceLang: string;
  targetLang: string;
  charCount: number;
  cacheHit: TranslationCacheSource;
  provider: TranslationProvider | 'none';
  durationMs: number;
  success: boolean;
}
