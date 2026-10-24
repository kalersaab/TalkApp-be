import { createHash } from 'crypto';
import * as deepl from 'deepl-node';

import { DEEPL_API_KEY, LIBRETRANSLATE_URL, LIBRETRANSLATE_KEY } from '@config';
import { getRedisService } from '@databases/redis';
import { getMessageRepository } from '@repositories/message.repository';
import { HttpException } from '@exceptions/HttpException';
import { isValidLanguageCode } from '@utils/languageCodes';
import { logger } from '@utils/logger';
import type { TranslateResult, SupportedLanguage, TranslationLogEntry, TranslationProvider } from '@interfaces/translation.interface';

const TRANSLATION_TTL = 30 * 24 * 3600;
const LANG_LIST_TTL = 24 * 3600;
const LANG_LIST_KEY = 'talkapp:translation:languages';

let _deepl: deepl.Translator | null = null;

function getDeepLClient(): deepl.Translator {
  if (!_deepl) {
    const key = DEEPL_API_KEY ?? '';
    if (!key) throw new HttpException(503, 'DeepL API key not configured');
    _deepl = new deepl.Translator(key);
  }
  return _deepl;
}

async function callLibreTranslate(text: string, sourceLang: string, targetLang: string): Promise<string> {
  const baseUrl = (LIBRETRANSLATE_URL ?? 'http://localhost:5000').replace(/\/$/, '');
  const url = new URL('/translate', baseUrl);

  const body = JSON.stringify({
    q: text,
    source: sourceLang === 'auto' ? 'auto' : sourceLang.toLowerCase(),
    target: targetLang.toLowerCase(),
    format: 'text',
    ...(LIBRETRANSLATE_KEY ? { api_key: LIBRETRANSLATE_KEY } : {}),
  });

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? require('https') : require('http');

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = transport.request(options, (res: import('http').IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: string) => {
        data += chunk;
      });
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`LibreTranslate HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          const parsed = JSON.parse(data) as { translatedText?: string };
          if (!parsed.translatedText) {
            reject(new Error('LibreTranslate returned empty translation'));
          } else {
            resolve(parsed.translatedText);
          }
        } catch {
          reject(new Error('LibreTranslate returned invalid JSON'));
        }
      });
    });

    req.setTimeout(8_000, () => {
      req.destroy();
      reject(new Error('LibreTranslate request timed out'));
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export class TranslationService {
  getCacheKey(text: string, sourceLang: string, targetLang: string): string {
    return createHash('sha256').update(`${text}|${sourceLang.toLowerCase()}|${targetLang.toLowerCase()}`).digest('hex');
  }

  isValidLanguageCode(code: string): boolean {
    return isValidLanguageCode(code);
  }

  async detectLanguage(text: string): Promise<string> {
    try {
      const client = getDeepLClient();

      const result = await client.translateText(text, null, 'en-US');
      const detected = Array.isArray(result) ? result[0]?.detectedSourceLang : result.detectedSourceLang;
      return (detected ?? 'en').toLowerCase();
    } catch {
      return 'en';
    }
  }

  async translate(
    text: string,
    sourceLang: string | null,
    targetLang: string,
  ): Promise<{ translation: string; detectedSourceLang: string; provider: TranslationProvider }> {
    try {
      const client = getDeepLClient();

      const deeplTarget = targetLang.toUpperCase() as deepl.TargetLanguageCode;
      const deeplSource = sourceLang ? (sourceLang.toUpperCase() as deepl.SourceLanguageCode) : null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      let result: deepl.TextResult | deepl.TextResult[];
      try {
        result = await client.translateText(text, deeplSource, deeplTarget);
      } finally {
        clearTimeout(timeout);
      }

      const item = Array.isArray(result) ? result[0] : result;
      if (!item) {
        throw new Error('Translation result is empty');
      }
      return {
        translation: item.text,
        detectedSourceLang: item.detectedSourceLang.toLowerCase(),
        provider: 'deepl',
      };
    } catch (err) {
      const error = err as Error & { errorCode?: number };

      if (error.errorCode === 429) {
        logger.warn('[TranslationService] DeepL rate limited — retrying in 1s');
        await new Promise(r => setTimeout(r, 1_000));
        try {
          const client = getDeepLClient();
          const deeplTarget = targetLang.toUpperCase() as deepl.TargetLanguageCode;
          const deeplSource = sourceLang ? (sourceLang.toUpperCase() as deepl.SourceLanguageCode) : null;
          const result = await client.translateText(text, deeplSource, deeplTarget);
          const item = Array.isArray(result) ? result[0]! : result;
          return { translation: item.text, detectedSourceLang: item.detectedSourceLang.toLowerCase(), provider: 'deepl' };
        } catch (retryErr) {
          logger.warn(`[TranslationService] DeepL retry failed: ${(retryErr as Error).message}`);
        }
      }

      if (error.errorCode === 456) {
        logger.error('[TranslationService] DeepL quota exceeded');
        throw new HttpException(503, 'Translation quota exceeded. Please try again tomorrow.');
      }

      logger.warn(`[TranslationService] DeepL failed, trying LibreTranslate: ${error.message}`);
    }

    try {
      const translation = await callLibreTranslate(text, sourceLang ?? 'auto', targetLang);
      return {
        translation,
        detectedSourceLang: sourceLang ?? 'auto',
        provider: 'libretranslate',
      };
    } catch (err) {
      logger.error(`[TranslationService] LibreTranslate failed: ${(err as Error).message}`);
      throw new HttpException(503, 'Translation service unavailable');
    }
  }

  async translateMessage(userId: string, convId: string, msgId: string, targetLang: string): Promise<TranslateResult> {
    const start = Date.now();
    const redis = getRedisService();
    const repo = getMessageRepository();

    if (!this.isValidLanguageCode(targetLang)) {
      throw new HttpException(400, `Invalid language code: ${targetLang}`);
    }

    const message = await repo.getMessageById(convId, msgId);
    if (!message) throw new HttpException(404, 'Message not found');

    const content = message.content;

    const existingTranslation = message.translations[targetLang];
    if (existingTranslation) {
      this.logTranslation({
        userId,
        sourceLang: 'unknown',
        targetLang,
        charCount: content.length,
        cacheHit: 'message',
        provider: 'none',
        durationMs: Date.now() - start,
        success: true,
      });
      return { translation: existingTranslation, sourceLang: 'unknown', targetLang, fromCache: 'message' };
    }

    const sourceLangHint = 'auto';
    const cacheKey = this.getCacheKey(content, sourceLangHint, targetLang);

    const cached = await redis.getTranslation(cacheKey).catch(() => null);
    if (cached) {
      void repo
        .updateMessageTranslation({ convId, msgId, lang: targetLang, translation: cached })
        .catch(err => logger.warn(`[TranslationService] Cassandra update failed: ${(err as Error).message}`));

      this.logTranslation({
        userId,
        sourceLang: sourceLangHint,
        targetLang,
        charCount: content.length,
        cacheHit: 'redis',
        provider: 'none',
        durationMs: Date.now() - start,
        success: true,
      });
      return { translation: cached, sourceLang: sourceLangHint, targetLang, fromCache: 'redis' };
    }

    const detectedSource = await this.detectLanguage(content);

    const { translation, detectedSourceLang, provider } = await this.translate(content, detectedSource, targetLang);

    const finalCacheKey = this.getCacheKey(content, detectedSourceLang, targetLang);
    void redis
      .cacheTranslation(finalCacheKey, translation, TRANSLATION_TTL)
      .catch(err => logger.warn(`[TranslationService] Redis cache failed: ${(err as Error).message}`));

    void repo
      .updateMessageTranslation({ convId, msgId, lang: targetLang, translation })
      .catch(err => logger.warn(`[TranslationService] Cassandra update failed: ${(err as Error).message}`));

    this.logTranslation({
      userId,
      sourceLang: detectedSourceLang,
      targetLang,
      charCount: content.length,
      cacheHit: false,
      provider,
      durationMs: Date.now() - start,
      success: true,
    });

    return { translation, sourceLang: detectedSourceLang, targetLang, fromCache: false, provider };
  }

  async getSupportedLanguages(): Promise<SupportedLanguage[]> {
    const redis = getRedisService();

    const cached = await redis.getTranslation(LANG_LIST_KEY).catch(() => null);
    if (cached) {
      return JSON.parse(cached) as SupportedLanguage[];
    }

    try {
      const client = getDeepLClient();
      const langs = await client.getTargetLanguages();
      const result: SupportedLanguage[] = langs.map(l => ({
        code: l.code.toLowerCase(),
        name: l.name,
      }));

      void redis.cacheTranslation(LANG_LIST_KEY, JSON.stringify(result), LANG_LIST_TTL).catch(() => null);

      return result;
    } catch {
      return [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'zh', name: 'Chinese' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'ar', name: 'Arabic' },
        { code: 'ru', name: 'Russian' },
      ];
    }
  }

  private logTranslation(entry: TranslationLogEntry): void {
    logger.info(
      `[Translation] user=${entry.userId} ${entry.sourceLang}→${entry.targetLang} ` +
        `chars=${entry.charCount} cache=${entry.cacheHit || 'miss'} ` +
        `provider=${entry.provider} duration=${entry.durationMs}ms success=${entry.success}`,
    );
  }
}
