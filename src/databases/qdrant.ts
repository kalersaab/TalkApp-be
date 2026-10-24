import { QdrantClient } from '@qdrant/js-client-rest';

import { QDRANT_URL, QDRANT_API_KEY, QDRANT_COLLECTION } from '@config';
import { logger } from '@utils/logger';

export const COLLECTION = QDRANT_COLLECTION ?? 'user_bios';

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: QDRANT_URL ?? 'http://localhost:6333',
      ...(QDRANT_API_KEY ? { apiKey: QDRANT_API_KEY } : {}),
    });
  }
  return client;
}

export async function isQdrantAvailable(): Promise<boolean> {
  try {
    await getQdrantClient().getCollections();
    return true;
  } catch {
    logger.warn('[Qdrant] Not available — vector ranking disabled');
    return false;
  }
}

export async function getUserVector(userId: string): Promise<number[] | null> {
  try {
    const result = await getQdrantClient().retrieve(COLLECTION, {
      ids: [userId],
      with_vector: true,
    });
    const point = result[0];
    if (!point) return null;
    const vec = point.vector;
    if (Array.isArray(vec)) return vec as number[];
    return null;
  } catch {
    return null;
  }
}
